"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import Card from "@/components/Card";
import StatCard from "@/components/StatCard";
import AllocationTimeline, { tierOf } from "@/components/AllocationTimeline";
import JobQueue from "@/components/JobQueue";
import Sparkline from "@/components/Sparkline";
import {
  fetchClusterAssignments,
  fetchClusterDetail,
  fetchClusterMetrics,
  fetchJobDetail,
  fetchJobs,
  fetchNodeDetail,
  fetchProviders,
} from "@/lib/api";
import {
  buildTimeline,
  selectSchedulerNodes,
  type SchedulerSection,
  type TimelineData,
} from "@/lib/timeline";
import { averageMetricSeries, cumulativeThisHour, generateMetricSeries } from "@/lib/metrics";
import { tierMix } from "@/lib/jobs";
import type { AdmittedFlash } from "@/components/AllocationTimeline";
import { currentLiveValue } from "@/lib/jobMetrics";
import { flattenRegions, isDomestic } from "@/lib/mapData";
import { useTime } from "@/lib/TimeContext";
import type { AcceleratorGroup, JobSummary, MetricProfilePoint, MetricType, NodePurpose } from "@/app/types";

/** 백엔드에 push가 없으므로 주기적으로 다시 조회한다 (sweep 결과·새 작업 반영).
 * 추론 job의 준비중(provisioning) 구간이 8초뿐이라, 그보다 긴 주기로 폴링하면 그
 * 창을 통째로 못 담아 Disk/DRAM 티어를 거의 못 보고 곧장 실행중(GPU)으로 넘어가
 * 있는 경우가 많았다 - JobStatusBoard(POLL_MS=4000)와 같은 이유로 짧게 잡는다. */
const POLL_MS = 4_000;
/** 학습 섹션 "예측 기반 배치" 패널 전용 상수. 실제 배치 알고리즘이 이 예측을 쓰는 건
 * 아니고, "이런 예측을 보고 배치한다"는 걸 보여주는 시연용 연출이다. */
const PREDICTION_LOOKAHEAD_SEC = 30;
/** AllocationTimeline.module.css의 .optimizeAnchor/.optimizeStreak과 같은 색으로
 * 맞춰야 한다 - 두 파일이 각자 하드코딩하고 있으니 바꿀 땐 같이 바꿔야 한다. */
const PREDICT_COLOR = "#6366F1";
/** 배치 순간 애니메이션(AllocationTimeline의 optimize-flash 900ms + optimize-landing이
 * 820ms 지연 후 900ms 더 - 총 ~1.72s)이 다 재생될 시간을 넉넉히 주고 나서 목록에서
 * 지운다. */
const FLASH_LIFETIME_MS = 2_200;
/** 스파크라인 표시 구간(초)·점 개수. 14개(≈6.9s 간격)로는 pseudoJitter의 빠른 성분
 * (주기 3.3s)이 언더샘플링돼 그래프에 안 살고 뭉개진다 - 추론 상세 페이지가 60초를
 * 30개 점(≈2.1s 간격)으로 찍는 것과 비슷한 밀도로 맞춘다. */
const METRIC_SPAN_SEC = 90;
const METRIC_POINTS = 45;

/** 학습/추론 둘 다 보여주는 공통 지표 - 클러스터 단위 프로파일이 없어서(라이브
 * 클러스터가 하나뿐이라 학습/추론 풀을 구분 못함) 노드별 프로파일을 풀 범위로 평균낸다. */
const COMMON_METRICS: { type: MetricType; label: string }[] = [
  { type: "util", label: "GPU 활용률" },
  { type: "cpu", label: "CPU 활용률" },
  { type: "power", label: "노드 평균 전력" },
  { type: "temp", label: "평균 온도" },
];
/** 학습/추론 전용 지표 - cluster_metric_profile에 새로 시드해둔 값을 그대로 쓴다 */
const TRAIN_METRICS: { type: MetricType; label: string }[] = [
  { type: "throughput", label: "처리량" },
  { type: "jct", label: "JCT" },
  { type: "goodput", label: "Goodput" },
];
const INFER_METRICS: { type: MetricType; label: string }[] = [
  { type: "ttft", label: "TTFT" },
  { type: "tpot", label: "TPOT" },
  { type: "slo_violation", label: "SLO 위반 (최근 1시간)" },
];

interface MetricSeries {
  label: string;
  values: number[];
  /** SLO 위반 횟수처럼 그래프보다 숫자 자체가 더 중요한 지표는 그래프 없이 숫자만
   * 크게 보여준다 (같은 줄의 다른 스파크라인과 카드 크기는 그대로 맞춘다). */
  numberOnly?: boolean;
}

/** 공통 지표는 그래프 없이 숫자만 보여준다 (4개+3개 그래프가 한꺼번에 있으면 너무
 * 복잡하다는 피드백 - 학습/추론 전용 지표만 스파크라인으로 남긴다). */
interface MetricStat {
  label: string;
  value: number;
  unit: string;
}

interface NodeRef {
  id: number;
  name: string;
  purpose: NodePurpose;
  /** 소속 클러스터가 라이브인지. 스케줄러 행 정렬 우선순위에 쓴다 */
  isLive: boolean;
  metricProfiles: MetricProfilePoint[];
}

/** trainFlashes 상태에 쓰는 내부 타입 - AdmittedFlash에 발생 시각(at)만 얹는다.
 * at은 렌더에 쓰는 게 아니라 FLASH_LIFETIME_MS가 지나면 목록에서 지우기 위한
 * 것뿐이라, AllocationTimeline에는 AdmittedFlash(id/nodeId)만 넘긴다. */
interface TrainFlashEvent extends AdmittedFlash {
  at: number;
}

/** "다음 배치 후보"로 뽑힌 노드 - 이름과 그 노드 자신의 예측 활용률/전력을 같이
 * 들고 있다. 패널 상단 3개 숫자 중 활용률/전력 두 개는 풀 평균이 아니라 바로 이
 * 노드의 예측치를 그대로 쓴다 - "이 예측값이라서 이 노드가 골렸다"는 인과관계가
 * 실제로 보이게 하려면, 화면에 뜨는 숫자와 고르는 데 쓴 숫자가 같은 것이어야 한다
 * (풀 평균을 보여주면 숫자가 바뀌어도 어느 노드가 뽑히는지와 무관해 보인다). 백엔드
 * admission(_pick_free_nodes_for_tier)도 같은 예측·같은 정렬 규칙(활용률 낮은 순,
 * 동률이면 전력 낮은 순)으로 후보를 고르도록 맞춰뒀으므로, 여기 뜬 노드가 보통
 * 실제로 다음에 배정되는 노드와 같다. */
interface NodeCandidate {
  nodeId: number;
  nodeName: string;
  util: number | null;
  power: number | null;
  utilUnit: string;
  powerUnit: string;
}

/** 학습 섹션 "예측 기반 배치" 패널에 쓰는 예측치. 대기열에 다음 job이 있으면 활용률/
 * 전력은 그 job에게 고른 topCandidate 노드 자신의 예측치를 쓴다(위 NodeCandidate
 * 설명 참고) - 값이 바뀌면 어느 노드가 뽑히는지도 같이 바뀌는 게 눈에 보여야 하므로.
 * 대기열이 비어 고를 대상이 없을 때만 풀 평균으로 대체한다(그래야 그때도 숫자 자체는
 * 계속 보인다). SLA는 클러스터 단위 지표라 노드별로 못 나누므로 항상 클러스터
 * 평균이다. 실측 지표와 같은 baseline/amplitude/period_sec 파형에서
 * PREDICTION_LOOKAHEAD_SEC만큼 앞선 시점의 값을 뽑아 "예측"이라고 보여준다 - 새
 * 예측 모델이 아니라 이미 있는 파형을 미래 시점에서 한 번 더 평가하는 것뿐이다. */
interface PredictionStats {
  power: number | null;
  powerUnit: string;
  util: number | null;
  utilUnit: string;
  sla: number | null;
  slaUnit: string;
  nextJob: { modelName: string; tierMix: string } | null;
  /** null이면 지금 그 job의 요구사항에 맞는 빈 노드가 하나도 없다는 뜻 (자리 부족) */
  topCandidate: NodeCandidate | null;
}

interface SchedulerData {
  train: SchedulerSection<NodeRef>;
  infer: SchedulerSection<NodeRef>;
  jobs: JobSummary[];
  /** 라이브 클러스터의 학습/추론 전용 지표 (cluster_metric_profile) */
  clusterMetrics: MetricProfilePoint[];
  /** 지금 요청을 받고 있는 추론 job의 처리량(req/s) - 타임라인 펄스 속도 계산용 */
  pulseRatesByJobId: Map<number, number>;
  /** 학습 노드 id -> 그 노드에 실제로 꽂혀 있는 가속기 종류/모델. tier 요구사항
   *  (kind+model_name)과 매칭해서 후보를 가려내려면 노드별 가속기 구성이 필요한데,
   *  스케줄러 페이지가 원래 쓰던 ClusterDetail.nodes에는 이 정보가 없어서
   *  (NodeSummary가 아니라 NodeDetail에만 있음) 학습 노드마다 별도로 조회한다. */
  trainAccelerators: Map<number, AcceleratorGroup[]>;
}

export default function SchedulerPage() {
  const router = useRouter();
  const { nowSec } = useTime();
  const nowMs = nowSec === null ? null : nowSec * 1000;

  const [data, setData] = useState<SchedulerData | null>(null);
  // 직전 폴링에서 "진행 중"이던(to_t===null) 학습 배정 id 집합 - 다음 폴링과 비교해
  // 새로 생긴 배정을 "방금 예측 기반으로 배치됐다"로 잡아낸다. null이면 아직 첫 로드
  // 전이라는 뜻이라, 첫 로드에서 이미 돌고 있던 배정들이 전부 "방금 배치된 것"처럼
  // 한꺼번에 반짝이는 걸 막는다.
  const prevTrainAssignmentIdsRef = useRef<Set<number> | null>(null);
  const [trainFlashes, setTrainFlashes] = useState<TrainFlashEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [providers, jobs] = await Promise.all([fetchProviders(), fetchJobs()]);

        // 스케줄링 대상만 조회한다: 국내 클러스터 + 라이브 클러스터(새 작업이 배정되는 곳).
        // 해외 클러스터 전부를 훑으면 요청만 수십 개 늘고 스케줄러에 뜨는 건 없다.
        const targets = flattenRegions(providers)
          .flatMap((r) =>
            r.clusters.map((c) => ({ id: c.id, keep: isDomestic(r.lat, r.lon) || c.is_live }))
          )
          .filter((c) => c.keep);

        const [details, assignmentLists] = await Promise.all([
          Promise.all(targets.map((c) => fetchClusterDetail(c.id).catch(() => null))),
          Promise.all(targets.map((c) => fetchClusterAssignments(c.id).catch(() => []))),
        ]);
        if (cancelled) return;

        // is_live는 ClusterDetail이 Cluster를 확장하며 그대로 들고 오므로 d에서 바로 읽는다.
        // targets와 인덱스를 맞춰 꺼내면 조회 실패(null)가 섞였을 때 어긋날 여지가 생긴다.
        const allNodes: NodeRef[] = details.flatMap((d) =>
          d
            ? d.nodes.map((n) => ({
                id: n.id,
                name: n.name,
                purpose: n.purpose,
                isLive: d.is_live,
                metricProfiles: n.metric_profiles,
              }))
            : []
        );
        const allAssignments = assignmentLists.flat();
        const { train, infer } = selectSchedulerNodes(allNodes, allAssignments);

        // "예측 기반 배치" 패널이 tier 요구사항(kind+model_name)과 후보 노드를 매칭하려면
        // 노드별 가속기 구성이 있어야 하는데, ClusterDetail.nodes(NodeSummary)에는 없다 -
        // 학습 노드 수가 적어서(라이브 클러스터 하나 기준 7대) 노드마다 상세 조회해도 괜찮다.
        const trainNodeDetails = await Promise.all(
          train.nodes.map((n) => fetchNodeDetail(n.id).catch(() => null))
        );
        if (cancelled) return;
        const trainAccelerators = new Map<number, AcceleratorGroup[]>(
          train.nodes.map((n, i) => [n.id, trainNodeDetails[i]?.accelerators ?? []])
        );

        // "예측 기반 배치" 연출용: 이번 폴링에서 새로 생긴(진행 중) 학습 배정 = 방금
        // 대기열에서 어느 노드로 배치된 job. 첫 로드(ref가 아직 null)에는 이미 돌고
        // 있던 배정 전부가 "새로" 잡혀버리니 건너뛴다.
        const activeTrainAssignmentIds = new Set(
          train.assignments.filter((a) => a.to_t === null).map((a) => a.id)
        );
        if (prevTrainAssignmentIdsRef.current !== null) {
          const prevIds = prevTrainAssignmentIdsRef.current;
          const newlyAdmitted = train.assignments.filter(
            (a) => a.to_t === null && !prevIds.has(a.id)
          );
          if (newlyAdmitted.length > 0) {
            const at = Date.now();
            const jobNameById = new Map(jobs.map((j) => [j.id, j.model_name]));
            setTrainFlashes((prev) => [
              ...prev.filter((f) => at - f.at < FLASH_LIFETIME_MS * 2),
              ...newlyAdmitted.map((a) => ({
                id: `${a.id}-${at}`,
                nodeId: a.node_id,
                modelName: jobNameById.get(a.job_id) ?? "?",
                at,
              })),
            ]);
          }
        }
        prevTrainAssignmentIdsRef.current = activeTrainAssignmentIds;

        // 학습/추론 전용 지표(throughput/jct/goodput, ttft/tpot/slo_violation)는
        // 라이브 클러스터에만 시드돼있다 - 새 작업이 실제로 도는 곳이라 그 값만 의미있다.
        const liveClusterIds = details.filter((d) => d?.is_live).map((d) => d!.id);
        const clusterMetricLists = await Promise.all(
          liveClusterIds.map((id) => fetchClusterMetrics(id).catch(() => []))
        );
        if (cancelled) return;
        const clusterMetrics = clusterMetricLists.flat();

        // 지금 실제로 요청을 받고 있는 추론 job들의 처리량을 가져와 타임라인 막대의
        // "요청 도착" 펄스 속도를 정한다. JobSummary엔 지표가 없어서 상세 조회가
        // 필요한데, 동시에 요청 받는 추론 job 수는 노드 수만큼이라 적다.
        // 할당이 안 끝났다(to_t===null)는 것만으론 부족하다 - provisioning 중(아직
        // Disk/DRAM 단계, GPU에 안 올라옴)에도 참이라, 로딩도 안 끝난 모델이 요청을
        // 받는 것처럼 보이는 버그였다. tierOf가 "GPU" 판정한 job만 실제로 서빙 중인
        // 것이므로, 클러스터 하이러키 다이어그램(AllocationTimeline)과 같은 기준으로
        // 걸러야 둘이 어긋나지 않는다.
        const jobById = new Map(jobs.map((j) => [j.id, j]));
        const activeInferJobIds = [...new Set(
          infer.assignments
            .filter((a) => a.to_t === null)
            .map((a) => a.job_id)
            .filter((jobId) => {
              const job = jobById.get(jobId);
              return job !== undefined && tierOf(job) === "active";
            })
        )];
        const activeInferDetails = await Promise.all(
          activeInferJobIds.map((id) => fetchJobDetail(id).catch(() => null))
        );
        if (cancelled) return;
        const pulseRatesByJobId = new Map<number, number>();
        for (const detail of activeInferDetails) {
          if (!detail) continue;
          const featured = detail.metrics.find((m) => m.featured);
          if (!featured) continue;
          const rate = currentLiveValue(featured, detail, Date.now());
          if (rate > 0) pulseRatesByJobId.set(detail.id, rate);
        }

        setData({ train, infer, jobs, clusterMetrics, pulseRatesByJobId, trainAccelerators });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // 타임라인은 매 틱 다시 계산한다 (현재시각 선이 흐르고, 만료된 새 작업이 사라지도록)
  let trainTimeline: TimelineData | null = null;
  let inferTimeline: TimelineData | null = null;
  // 대기열: status="queued"인 job을 제출 순으로 나열 (백필이 훑는 순서와 동일)
  let trainQueue: JobSummary[] = [];
  let inferQueue: JobSummary[] = [];
  let trainCommonMetrics: MetricStat[] = [];
  let trainSpecialMetrics: MetricSeries[] = [];
  let inferCommonMetrics: MetricStat[] = [];
  let inferSpecialMetrics: MetricSeries[] = [];
  let trainPrediction: PredictionStats | null = null;
  let visibleTrainFlashes: AdmittedFlash[] = [];
  if (data && nowMs !== null && nowSec !== null) {
    const byType = (type: NodePurpose) => data.jobs.filter((j) => j.type === type);
    const byIdAsc = (a: JobSummary, b: JobSummary) =>
      new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    trainQueue = byType("train").filter((j) => j.status === "queued").sort(byIdAsc);
    inferQueue = byType("infer").filter((j) => j.status === "queued").sort(byIdAsc);

    const build = (section: SchedulerSection<NodeRef>, pulseRates?: Map<number, number>) =>
      buildTimeline(section.assignments, data.jobs, section.nodes, nowMs, pulseRates);

    trainTimeline = build(data.train);
    inferTimeline = build(data.infer, data.pulseRatesByJobId);

    const poolMetrics = (nodes: NodeRef[]): MetricStat[] =>
      COMMON_METRICS.flatMap(({ type, label }) => {
        const profiles = nodes
          .map((n) => n.metricProfiles.find((m) => m.metric_type === type))
          .filter((m): m is MetricProfilePoint => m !== undefined);
        if (profiles.length === 0) return [];
        const series = averageMetricSeries(profiles, nowSec, METRIC_SPAN_SEC, METRIC_POINTS);
        return [{ label, value: series[series.length - 1], unit: profiles[0].unit }];
      });

    const specialMetrics = (defs: typeof TRAIN_METRICS): MetricSeries[] =>
      defs.flatMap(({ type, label }) => {
        const profile = data.clusterMetrics.find((m) => m.metric_type === type);
        if (!profile) return [];
        // SLO 위반은 순간값이 아니라 누적 카운터라 사인파(generateMetricSeries)가 아니라
        // "이번 시간 들어 몇 번 위반됐는지"로 계산한다 - 오르내리지 않고 정수로만 쌓인다.
        if (type === "slo_violation") {
          return [{ label, values: [cumulativeThisHour(Number(profile.baseline), nowSec)], numberOnly: true }];
        }
        return [
          {
            label: `${label} (${profile.unit})`,
            values: generateMetricSeries(profile, nowSec, METRIC_SPAN_SEC, METRIC_POINTS),
          },
        ];
      });

    trainCommonMetrics = poolMetrics(data.train.nodes);
    trainSpecialMetrics = specialMetrics(TRAIN_METRICS);
    inferCommonMetrics = poolMetrics(data.infer.nodes);
    inferSpecialMetrics = specialMetrics(INFER_METRICS);

    // spanSec=0, points=1로 부르면 generateMetricSeries가 딱 predictAt 그 순간의 값
    // 하나만 돌려준다 - 새 수식 없이 기존 파형을 미래 시점에서 한 번 더 평가하는 것뿐.
    const predictAt = nowSec + PREDICTION_LOOKAHEAD_SEC;
    // 노드별로 "지금 뭘 돌리고 있는지" - busyWith 표시용. 아래 rankNodes가 비어 있는
    // 노드만 추려내지 않고 사용 중인 노드도 같이 담기 때문에 필요하다: 이 클러스터는
    // 풀 크기가 tier 요구 대수와 딱 맞아서(H100 2대=tier1 요구 그대로, NPU 1대뿐 등)
    // 하나만 돌아도 "비어 있는 노드"가 0개가 되는 경우가 흔했다 - 그러면 예측 수치
    // 자체가 화면에서 통째로 사라져버려서, 사용 중인 노드도 (예측치 + "사용 중" 표시로)
    // 같이 보여주기로 했다.
    const idleNodeIds = new Set(
      (trainTimeline?.rows ?? [])
        .filter((r) => !r.bars.some((b) => b.isActive))
        .map((r) => r.nodeId)
    );
    const predictNode = (nodeId: number, type: MetricType) => {
      const node = data.train.nodes.find((n) => n.id === nodeId);
      const profile = node?.metricProfiles.find((m) => m.metric_type === type);
      return profile ? generateMetricSeries(profile, predictAt, 0, 1)[0] : null;
    };

    // 대기열 맨 앞 job의 tier 요구사항(분산 배치면 여러 줄)에 맞는 노드 중 예측이 가장
    // 좋은 것 하나를 "이 작업이 배정될 노드"로 확정해서 보여준다 - 비어 있는 노드를
    // 우선하되(idle 여부를 정렬 1순위로), 지금 당장 빈 자리가 없어도 "그래서 대기
    // 중"이라고 얼버무리지 않고 그 tier에서 예측이 가장 좋은 노드를 그대로 목적지로
    // 보여준다. 정렬 기준(util 낮은 순, 동률이면 power 낮은 순)에 쓴 값을 그대로
    // NodeCandidate에 담아서 돌려준다 - 패널이 "이 숫자라서 이 노드가 뽑혔다"를
    // 같은 숫자로 보여줘야 인과관계가 실제로 느껴진다.
    const nextQueuedTrainJob = trainQueue[0] ?? null;
    let topCandidate: NodeCandidate | null = null;
    if (nextQueuedTrainJob?.selected_tier) {
      const allMatches = nextQueuedTrainJob.selected_tier.requirements.flatMap((req) =>
        data.train.nodes
          .filter((n) => {
            const accels = data.trainAccelerators.get(n.id) ?? [];
            return accels.some((a) => a.kind === req.kind && a.model_name === req.model_name);
          })
          .map((n) => {
            const utilProfile = n.metricProfiles.find((m) => m.metric_type === "util");
            const powerProfile = n.metricProfiles.find((m) => m.metric_type === "power");
            return {
              nodeId: n.id,
              nodeName: n.name,
              idle: idleNodeIds.has(n.id),
              util: predictNode(n.id, "util"),
              power: predictNode(n.id, "power"),
              utilUnit: utilProfile?.unit ?? "%",
              powerUnit: powerProfile?.unit ?? "W",
            };
          })
      );
      allMatches.sort((a, b) => {
        if (a.idle !== b.idle) return a.idle ? -1 : 1;
        const au = a.util ?? Infinity;
        const bu = b.util ?? Infinity;
        if (au !== bu) return au - bu;
        return (a.power ?? Infinity) - (b.power ?? Infinity);
      });
      topCandidate = allMatches[0] ?? null;
    }

    // power/util 예측은 원래 학습 풀 전체 평균으로 뒀었는데, 그러면 화면 숫자가 바뀌어도
    // 어느 노드가 뽑히는지랑 상관없어 보인다는 피드백을 받고 되돌렸다 - 대기열에 다음
    // job이 있으면(topCandidate가 있으면) 그 노드 자신의 예측치를 그대로 쓴다. 대기열이
    // 비어 고를 대상이 없을 때만 풀 평균(trainCommonMetrics의 poolMetrics와 같은 방식,
    // "지금" 대신 predictAt 시점)으로 대체해서 그때도 숫자 자체는 계속 보이게 한다.
    const slaProfile = data.clusterMetrics.find((m) => m.metric_type === "sla");
    if (topCandidate) {
      trainPrediction = {
        power: topCandidate.power,
        powerUnit: topCandidate.powerUnit,
        util: topCandidate.util,
        utilUnit: topCandidate.utilUnit,
        sla: slaProfile ? generateMetricSeries(slaProfile, predictAt, 0, 1)[0] : null,
        slaUnit: slaProfile?.unit ?? "%",
        nextJob: nextQueuedTrainJob
          ? { modelName: nextQueuedTrainJob.model_name, tierMix: tierMix(nextQueuedTrainJob.selected_tier) }
          : null,
        topCandidate,
      };
    } else {
      const poolPowerProfiles = data.train.nodes
        .map((n) => n.metricProfiles.find((m) => m.metric_type === "power"))
        .filter((m): m is MetricProfilePoint => m !== undefined);
      const poolUtilProfiles = data.train.nodes
        .map((n) => n.metricProfiles.find((m) => m.metric_type === "util"))
        .filter((m): m is MetricProfilePoint => m !== undefined);
      trainPrediction = {
        power: poolPowerProfiles.length > 0 ? averageMetricSeries(poolPowerProfiles, predictAt, 0, 1)[0] : null,
        powerUnit: poolPowerProfiles[0]?.unit ?? "W",
        util: poolUtilProfiles.length > 0 ? averageMetricSeries(poolUtilProfiles, predictAt, 0, 1)[0] : null,
        utilUnit: poolUtilProfiles[0]?.unit ?? "%",
        sla: slaProfile ? generateMetricSeries(slaProfile, predictAt, 0, 1)[0] : null,
        slaUnit: slaProfile?.unit ?? "%",
        nextJob: nextQueuedTrainJob
          ? { modelName: nextQueuedTrainJob.model_name, tierMix: tierMix(nextQueuedTrainJob.selected_tier) }
          : null,
        topCandidate: null,
      };
    }

    visibleTrainFlashes = trainFlashes.filter((f) => nowMs - f.at < FLASH_LIFETIME_MS);
  }

  if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;

  return (
    <main style={{ padding: "24px 28px" }}>
      <Breadcrumb
        segments={[
          { label: "가용영역", onClick: () => router.push("/csp") },
          { label: "스케줄러" },
        ]}
      />

      <div style={{ margin: "16px 0 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>스케줄러</div>
      </div>

      {loading || nowMs === null ? (
        <Card>
          <div style={{ padding: 24, textAlign: "center", fontSize: 15, color: "var(--sub)" }}>
            불러오는 중…
          </div>
        </Card>
      ) : (
        <>
          <Section
            title="학습 클러스터"
            queueJobs={trainQueue}
            nowMs={nowMs}
            data={trainTimeline}
            commonMetrics={trainCommonMetrics}
            specialMetrics={trainSpecialMetrics}
            prediction={trainPrediction}
            admittedFlashes={visibleTrainFlashes}
            onSelectJob={(id) => router.push(`/csp/jobs/${id}`)}
            onSelectNode={(id) => router.push(`/csp/nodes/${id}`)}
          />
          <div style={{ height: 28 }} />
          <Section
            title="추론 클러스터"
            queueJobs={inferQueue}
            nowMs={nowMs}
            data={inferTimeline}
            commonMetrics={inferCommonMetrics}
            specialMetrics={inferSpecialMetrics}
            showActiveModel
            onSelectJob={(id) => router.push(`/csp/jobs/${id}`)}
            onSelectNode={(id) => router.push(`/csp/nodes/${id}`)}
          />
        </>
      )}
    </main>
  );
}

function Section({
  title,
  queueJobs,
  nowMs,
  data,
  commonMetrics,
  specialMetrics,
  showActiveModel,
  prediction,
  admittedFlashes,
  onSelectJob,
  onSelectNode,
}: {
  title: string;
  queueJobs: JobSummary[];
  nowMs: number;
  data: TimelineData | null;
  commonMetrics: MetricStat[];
  specialMetrics: MetricSeries[];
  /** 추론 섹션 전용: 점유 막대 대신 지금 서빙 중인 모델명 칸 + 요청 도착 애니메이션을 보여준다 */
  showActiveModel?: boolean;
  /** 학습 섹션 전용: 있으면 "예측 기반 배치" 패널을 보여준다 */
  prediction?: PredictionStats | null;
  /** 학습 섹션 전용: 방금 예측 기반으로 배치된 job들 */
  admittedFlashes?: AdmittedFlash[];
  onSelectJob: (jobId: number) => void;
  onSelectNode: (nodeId: number) => void;
}) {
  // showActiveModel은 사실상 "이게 추론 섹션이냐"와 같은 값이라 따로 prop을 안 늘리고
  // 재사용한다. 학습 섹션은 손 안 대고(기존 그대로 무채색 숫자·초록 그래프), 추론
  // 섹션만 추론을 뜻하는 주황(--job-infer)으로 숫자·그래프 색을 맞춘다.
  const metricColor = showActiveModel ? "var(--job-infer)" : undefined;

  return (
    <>
      <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 12 }}>{title}</div>

      {/* 예전엔 지표/예측 패널/대기열+타임라인이 각자 따로 떠 있는 카드 3개였는데,
          "학습 클러스터"라는 한 덩어리로 안 보인다는 피드백을 받고 카드 하나로
          합쳤다 - 안에서는 구분선(divider)으로만 나눈다. */}
      <Card>
        {(commonMetrics.length > 0 || specialMetrics.length > 0) && (
          <>
            {commonMetrics.length > 0 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {commonMetrics.map((m) => (
                  <StatCard
                    key={m.label}
                    label={m.label}
                    value={m.value.toFixed(1)}
                    unit={m.unit}
                    compact
                    valueColor={metricColor}
                  />
                ))}
              </div>
            )}
            {commonMetrics.length > 0 && specialMetrics.length > 0 && (
              <div style={{ height: 20 }} />
            )}
            <MetricRow metrics={specialMetrics} color={metricColor} />
            <div style={{ height: 1, background: "var(--line)", margin: "20px 0" }} />
          </>
        )}

        {prediction && (
          <>
            <PredictionPanel prediction={prediction} />
            <div style={{ height: 1, background: "var(--line)", margin: "20px 0" }} />
          </>
        )}

        <JobQueue jobs={queueJobs} nowMs={nowMs} onSelectJob={onSelectJob} />
        <div style={{ height: 1, background: "var(--line)", margin: "4px 0 16px" }} />
        {data ? (
          <AllocationTimeline
            data={data}
            onSelectJob={onSelectJob}
            onSelectNode={onSelectNode}
            showActiveModel={showActiveModel}
            admittedFlashes={admittedFlashes}
          />
        ) : (
          <div style={{ padding: 32, textAlign: "center", fontSize: 15, color: "var(--sub)" }}>
            표시할 노드가 없습니다.
          </div>
        )}
      </Card>
    </>
  );
}

/** 학습 섹션 전용 - 참고했던 원본 그림(Power/Utilization/SLA prediction → Resource
 * optimization) 그대로 아이콘 없이 숫자 3개 + 화살표 + 배지 하나로 간결하게 보여준다.
 * 예전엔 요구사항 줄마다 후보를 표로 늘어놨는데, 그러니 정작 봐야 할 "그래서 뭘 어떻게
 * 했다는거지"가 표 속에 묻혔다 - 지금은 대기열 맨 앞 job의 tier 요구사항 중 예측이
 * 가장 좋은 노드 하나만 "다음 배치 후보"로 짚어준다. 백엔드 admission
 * (_pick_free_nodes_for_tier)도 같은 예측·같은 규칙(활용률 낮은 순, 동률이면 전력
 * 낮은 순 - backend/app/services/jobs.py의 _predicted_util/_predicted_power,
 * PREDICTION_LOOKAHEAD_SEC와 이름만 다를 뿐 같은 30초)으로 후보를 고르므로, 여기 뜬
 * 노드가 보통 실제로 다음에 배정되는 노드와 같다. */
function PredictionPanel({ prediction }: { prediction: PredictionStats }) {
  const tc = prediction.topCandidate;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginBottom: 12, letterSpacing: "0.02em" }}>
        예측 기반 배치 (Resource Optimization)
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <StatCard
          label={tc ? `${tc.nodeName} 활용률 예측` : "예측 활용률"}
          value={prediction.util !== null ? prediction.util.toFixed(1) : "–"}
          unit={prediction.utilUnit}
          compact
          valueColor={PREDICT_COLOR}
        />
        <StatCard
          label={tc ? `${tc.nodeName} 전력 예측` : "예측 전력"}
          value={prediction.power !== null ? prediction.power.toFixed(0) : "–"}
          unit={prediction.powerUnit}
          compact
          valueColor={PREDICT_COLOR}
        />
        <StatCard
          label="클러스터 SLA 예측"
          value={prediction.sla !== null ? prediction.sla.toFixed(1) : "–"}
          unit={prediction.slaUnit}
          compact
        />
      </div>

      {prediction.nextJob === null ? (
        <div style={{ fontSize: 13, color: "var(--sub)", marginTop: 14 }}>대기 중인 학습 작업이 없습니다.</div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 16,
            padding: "12px 16px",
            borderRadius: 10,
            border: `1.5px solid ${PREDICT_COLOR}`,
            background: "rgba(99, 102, 241, 0.06)",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700 }}>{prediction.nextJob.modelName}</span>
          <span style={{ fontSize: 11, color: "var(--sub)" }}>{prediction.nextJob.tierMix}</span>
          <span style={{ fontSize: 20, color: PREDICT_COLOR, marginLeft: "auto" }}>→</span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "'IBM Plex Mono', monospace",
              color: PREDICT_COLOR,
            }}
          >
            {tc ? tc.nodeName : "-"}
          </span>
        </div>
      )}
    </div>
  );
}

function MetricRow({ metrics, color }: { metrics: MetricSeries[]; color?: string }) {
  if (metrics.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      {metrics.map((m) => (
        <Sparkline key={m.label} label={m.label} values={m.values} numberOnly={m.numberOnly} color={color} />
      ))}
    </div>
  );
}
