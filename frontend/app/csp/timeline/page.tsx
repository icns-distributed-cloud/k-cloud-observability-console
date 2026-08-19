"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import Card from "@/components/Card";
import StatCard from "@/components/StatCard";
import AllocationTimeline from "@/components/AllocationTimeline";
import JobQueue from "@/components/JobQueue";
import Sparkline from "@/components/Sparkline";
import {
  fetchClusterAssignments,
  fetchClusterDetail,
  fetchClusterMetrics,
  fetchJobDetail,
  fetchJobs,
  fetchProviders,
} from "@/lib/api";
import {
  buildTimeline,
  selectSchedulerNodes,
  type SchedulerSection,
  type TimelineData,
} from "@/lib/timeline";
import { averageMetricSeries, cumulativeThisHour, generateMetricSeries } from "@/lib/metrics";
import { currentLiveValue } from "@/lib/jobMetrics";
import { flattenRegions, isDomestic } from "@/lib/mapData";
import { useTime } from "@/lib/TimeContext";
import type { JobSummary, MetricProfilePoint, MetricType, NodePurpose } from "@/app/types";

/** 백엔드에 push가 없으므로 주기적으로 다시 조회한다 (sweep 결과·새 작업 반영) */
const POLL_MS = 10_000;
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

interface SchedulerData {
  train: SchedulerSection<NodeRef>;
  infer: SchedulerSection<NodeRef>;
  jobs: JobSummary[];
  /** 라이브 클러스터의 학습/추론 전용 지표 (cluster_metric_profile) */
  clusterMetrics: MetricProfilePoint[];
  /** 지금 요청을 받고 있는 추론 job의 처리량(req/s) - 타임라인 펄스 속도 계산용 */
  pulseRatesByJobId: Map<number, number>;
}

export default function SchedulerPage() {
  const router = useRouter();
  const { nowSec } = useTime();
  const nowMs = nowSec === null ? null : nowSec * 1000;

  const [data, setData] = useState<SchedulerData | null>(null);
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

        // 학습/추론 전용 지표(throughput/jct/goodput, ttft/tpot/slo_violation)는
        // 라이브 클러스터에만 시드돼있다 - 새 작업이 실제로 도는 곳이라 그 값만 의미있다.
        const liveClusterIds = details.filter((d) => d?.is_live).map((d) => d!.id);
        const clusterMetricLists = await Promise.all(
          liveClusterIds.map((id) => fetchClusterMetrics(id).catch(() => []))
        );
        if (cancelled) return;
        const clusterMetrics = clusterMetricLists.flat();

        // 지금 실제로 요청을 받고 있는(할당이 아직 안 끝난) 추론 job들의 처리량을 가져와
        // 타임라인 막대의 "요청 도착" 펄스 속도를 정한다. JobSummary엔 지표가 없어서
        // 상세 조회가 필요한데, 동시에 요청 받는 추론 job 수는 노드 수만큼이라 적다.
        const activeInferJobIds = [...new Set(
          infer.assignments.filter((a) => a.to_t === null).map((a) => a.job_id)
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

        setData({ train, infer, jobs, clusterMetrics, pulseRatesByJobId });
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
  }

  if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;

  return (
    <main style={{ padding: "24px 28px" }}>
      <Breadcrumb
        segments={[
          { label: "지도", onClick: () => router.push("/csp") },
          { label: "스케줄러" },
        ]}
      />

      <div style={{ margin: "16px 0 24px" }}>
        <div style={{ fontSize: 27, fontWeight: 700 }}>스케줄러</div>
        <div style={{ fontSize: 17, fontWeight: 550, color: "var(--sub)", marginTop: 4 }}>
          노드별 작업 점유 이력
        </div>
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
            onSelectJob={(id) => router.push(`/csp/jobs/${id}`)}
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
  onSelectJob,
}: {
  title: string;
  queueJobs: JobSummary[];
  nowMs: number;
  data: TimelineData | null;
  commonMetrics: MetricStat[];
  specialMetrics: MetricSeries[];
  /** 추론 섹션 전용: 점유 막대 대신 지금 서빙 중인 모델명 칸 + 요청 도착 애니메이션을 보여준다 */
  showActiveModel?: boolean;
  onSelectJob: (jobId: number) => void;
}) {
  // showActiveModel은 사실상 "이게 추론 섹션이냐"와 같은 값이라 따로 prop을 안 늘리고
  // 재사용한다. 학습 섹션은 손 안 대고(기존 그대로 무채색 숫자·초록 그래프), 추론
  // 섹션만 추론을 뜻하는 주황(--job-infer)으로 숫자·그래프 색을 맞춘다.
  const metricColor = showActiveModel ? "var(--job-infer)" : undefined;

  return (
    <>
      <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 12 }}>{title}</div>

      {(commonMetrics.length > 0 || specialMetrics.length > 0) && (
        <Card>
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
        </Card>
      )}
      <div style={{ height: 16 }} />

      <Card>
        <JobQueue jobs={queueJobs} nowMs={nowMs} onSelectJob={onSelectJob} />
        <div style={{ height: 1, background: "var(--line)", margin: "4px 0 16px" }} />
        {data ? (
          <AllocationTimeline data={data} onSelectJob={onSelectJob} showActiveModel={showActiveModel} />
        ) : (
          <div style={{ padding: 32, textAlign: "center", fontSize: 15, color: "var(--sub)" }}>
            표시할 노드가 없습니다.
          </div>
        )}
      </Card>
    </>
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
