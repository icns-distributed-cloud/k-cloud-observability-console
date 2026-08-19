"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import Card from "@/components/Card";
import AllocationTimeline from "@/components/AllocationTimeline";
import JobQueue from "@/components/JobQueue";
import {
  fetchClusterAssignments,
  fetchClusterDetail,
  fetchJobs,
  fetchProviders,
} from "@/lib/api";
import {
  buildTimeline,
  selectSchedulerNodes,
  type SchedulerSection,
  type TimelineData,
} from "@/lib/timeline";
import { flattenRegions, isDomestic } from "@/lib/mapData";
import { useTime } from "@/lib/TimeContext";
import type { JobSummary, NodePurpose } from "@/app/types";

/** 백엔드에 push가 없으므로 주기적으로 다시 조회한다 (sweep 결과·새 작업 반영) */
const POLL_MS = 10_000;

interface NodeRef {
  id: number;
  name: string;
  purpose: NodePurpose;
  /** 소속 클러스터가 라이브인지. 스케줄러 행 정렬 우선순위에 쓴다 */
  isLive: boolean;
}

interface SchedulerData {
  train: SchedulerSection<NodeRef>;
  infer: SchedulerSection<NodeRef>;
  jobs: JobSummary[];
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
              }))
            : []
        );
        const allAssignments = assignmentLists.flat();
        const { train, infer } = selectSchedulerNodes(allNodes, allAssignments);

        setData({ train, infer, jobs });
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
  if (data && nowMs !== null) {
    const byType = (type: NodePurpose) => data.jobs.filter((j) => j.type === type);
    const byIdAsc = (a: JobSummary, b: JobSummary) =>
      new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    trainQueue = byType("train").filter((j) => j.status === "queued").sort(byIdAsc);
    inferQueue = byType("infer").filter((j) => j.status === "queued").sort(byIdAsc);

    const build = (section: SchedulerSection<NodeRef>) =>
      buildTimeline(section.assignments, data.jobs, section.nodes, nowMs);

    trainTimeline = build(data.train);
    inferTimeline = build(data.infer);
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
            onSelectJob={(id) => router.push(`/csp/jobs/${id}`)}
          />
          <div style={{ height: 28 }} />
          <Section
            title="추론 클러스터"
            queueJobs={inferQueue}
            nowMs={nowMs}
            data={inferTimeline}
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
  onSelectJob,
}: {
  title: string;
  queueJobs: JobSummary[];
  nowMs: number;
  data: TimelineData | null;
  onSelectJob: (jobId: number) => void;
}) {
  return (
    <>
      <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <Card>
        <JobQueue jobs={queueJobs} nowMs={nowMs} onSelectJob={onSelectJob} />
        <div style={{ height: 1, background: "var(--line)", margin: "4px 0 16px" }} />
        {data ? (
          <AllocationTimeline data={data} onSelectJob={onSelectJob} />
        ) : (
          <div style={{ padding: 32, textAlign: "center", fontSize: 15, color: "var(--sub)" }}>
            표시할 노드가 없습니다.
          </div>
        )}
      </Card>
    </>
  );
}
