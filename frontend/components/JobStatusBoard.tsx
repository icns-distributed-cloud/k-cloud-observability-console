"use client";
import { useEffect, useRef, useState } from "react";
import Card from "@/components/Card";
import { fetchJobs } from "@/lib/api";
import { JOB_COLORS } from "@/lib/jobs";
import type { JobStatus, JobSummary } from "@/app/types";
import styles from "./JobStatusBoard.module.css";

/** 이 페이지는 다른 화면들보다 짧게 잡는다 - 준비중/마무리중 구간(백엔드
 * PROVISIONING_SEC/FINALIZING_SEC)이 이 주기보다 훨씬 짧으면 그 사이 상태를
 * 못 보고 건너뛴 것처럼 보인다. */
const POLL_MS = 4_000;
const STAGE_HEIGHT = 520;
/** zone 중심을 일직선이 아니라 완만한 물결로 배치 (인덱스별 y 오프셋) */
const WAVE_OFFSET = [0, -34, 26, -30, 6];
/** 완료 zone에 무한정 쌓이지 않도록, 최근 이만큼만 보여준다 */
const DONE_CAP = 24;
const STATUSES: JobStatus[] = ["queued", "provisioning", "running", "finalizing", "done"];
const STATUS_LABELS_EN: Record<JobStatus, string> = {
  queued: "Queued",
  provisioning: "Provisioning",
  running: "Running",
  finalizing: "Finalizing",
  done: "Done",
};
/** 해바라기 나선 패킹에 쓰는 golden angle (라디안) */
const GOLDEN_ANGLE = 137.5 * (Math.PI / 180);
const CHIP_W = 78;
const CHIP_H = 26;

interface Props {
  onSelect: (jobId: number) => void;
  onCountChange?: (count: number) => void;
}

interface Positioned {
  job: JobSummary;
  x: number;
  y: number;
}

const byOldestFirst = (a: JobSummary, b: JobSummary) =>
  new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();

export default function JobStatusBoard({ onSelect, onCountChange }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  // 화면에 실제로 그려지는 목록. cap을 넘겨 빠지는 job도 퇴장 애니메이션이 끝날 때까지
  // 잠깐 더 들고 있는다 (JobQueue.tsx와 같은 패턴).
  const [rendered, setRendered] = useState<JobSummary[]>([]);
  const [leavingIds, setLeavingIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setStageWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchJobs()
        .then((list) => {
          if (cancelled) return;
          setJobs(list);
          onCountChange?.(list.length);
          setError(null);
        })
        .catch((e) => !cancelled && setError(String(e)));

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // onCountChange는 매 렌더 새 함수일 수 있어 의존성에서 뺀다 (폴링 재시작 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const done = jobs.filter((j) => j.status === "done").sort(byOldestFirst);
    const overflowIds = new Set(
      (done.length > DONE_CAP ? done.slice(0, done.length - DONE_CAP) : []).map((j) => j.id)
    );
    const visibleJobs = jobs.filter((j) => !overflowIds.has(j.id));

    const incomingIds = new Set(visibleJobs.map((j) => j.id));
    const departed = [...prevIdsRef.current].filter((id) => !incomingIds.has(id));

    if (departed.length > 0) {
      setLeavingIds((prev) => new Set([...prev, ...departed]));
      setRendered((prevList) => {
        const known = new Set(prevList.map((j) => j.id));
        const stillOrLeaving = prevList.filter(
          (j) => incomingIds.has(j.id) || departed.includes(j.id)
        );
        const arrived = visibleJobs.filter((j) => !known.has(j.id));
        return [...stillOrLeaving, ...arrived];
      });
    } else {
      setRendered(visibleJobs);
    }
    prevIdsRef.current = incomingIds;
  }, [jobs]);

  const handleLeaveEnd = (id: number) => {
    setLeavingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setRendered((prev) => prev.filter((j) => j.id !== id));
  };

  if (error) return <div style={{ padding: 24 }}>불러오기 실패: {error}</div>;

  const zoneCount = STATUSES.length;
  const colW = stageWidth / zoneCount;
  const zoneRadius = Math.max(Math.min(colW * 0.44, 170), 100);
  const zoneCenter = (zi: number) => ({
    cx: colW * (zi + 0.5),
    cy: STAGE_HEIGHT / 2 + WAVE_OFFSET[zi],
  });

  const byStatus = new Map<JobStatus, JobSummary[]>(STATUSES.map((s) => [s, []]));
  for (const job of [...rendered].sort(byOldestFirst)) {
    byStatus.get(job.status as JobStatus)?.push(job);
  }

  const positioned: Positioned[] = [];
  STATUSES.forEach((status, zi) => {
    const list = byStatus.get(status) ?? [];
    const { cx, cy } = zoneCenter(zi);
    // zone 인원이 많을수록 나선 간격을 좁혀서 배경 원 반지름 안에 들어오게 한다
    const spacing = Math.max(Math.min(zoneRadius / Math.sqrt(Math.max(list.length, 1)), 46), 24);
    list.forEach((job, i) => {
      const angle = i * GOLDEN_ANGLE;
      const r = spacing * Math.sqrt(i);
      positioned.push({ job, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });
  });
  const posById = new Map(positioned.map((p) => [p.job.id, p]));

  return (
    <Card>
      <div ref={stageRef} style={{ position: "relative", width: "100%", height: STAGE_HEIGHT }}>
        {stageWidth > 0 && (
          <>
            {/* zone 사이 흐름을 암시하는 화살표 */}
            {STATUSES.slice(0, -1).map((_, zi) => {
              const a = zoneCenter(zi);
              const b = zoneCenter(zi + 1);
              return (
                <div
                  key={`arrow-${zi}`}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: (a.cx + b.cx) / 2,
                    top: (a.cy + b.cy) / 2,
                    transform: "translate(-50%, -50%)",
                    fontSize: 20,
                    color: "var(--line)",
                    fontWeight: 700,
                  }}
                >
                  →
                </div>
              );
            })}

            {STATUSES.map((status, zi) => {
              const { cx, cy } = zoneCenter(zi);
              const count = byStatus.get(status)?.length ?? 0;
              return (
                <div key={status}>
                  <div
                    style={{
                      position: "absolute",
                      left: cx - zoneRadius,
                      top: cy - zoneRadius,
                      width: zoneRadius * 2,
                      height: zoneRadius * 2,
                      borderRadius: "50%",
                      border: "1px dashed var(--line)",
                      background: "var(--panel-2)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: cx,
                      top: cy - zoneRadius - 28,
                      transform: "translateX(-50%)",
                      textAlign: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {STATUS_LABELS_EN[status]}{" "}
                    <span style={{ color: "var(--sub)", fontWeight: 600 }}>({count})</span>
                  </div>
                </div>
              );
            })}

            {rendered.map((job) => {
              const pos = posById.get(job.id);
              if (!pos) return null;
              const leaving = leavingIds.has(job.id);
              return (
                <div
                  key={job.id}
                  onClick={() => !leaving && onSelect(job.id)}
                  onAnimationEnd={() => leaving && handleLeaveEnd(job.id)}
                  className={`${styles.chip} ${leaving ? styles.leaving : ""}`}
                  style={{
                    position: "absolute",
                    left: pos.x - CHIP_W / 2,
                    top: pos.y - CHIP_H / 2,
                    width: CHIP_W,
                    height: CHIP_H,
                    cursor: leaving ? "default" : "pointer",
                    transition: "left 500ms ease, top 500ms ease",
                  }}
                >
                  <div
                    className={styles.float}
                    title={`J-${job.id} · ${job.model_name}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 13,
                      background: JOB_COLORS[job.type],
                      boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 8px",
                      // 같은 job이라도 항상 같은 위상으로 떠서 폴링마다 리듬이 안 바뀌게
                      animationDelay: `${(job.id % 10) * 0.28}s`,
                    }}
                  >
                    <span
                      style={{
                        color: "#FFFFFF",
                        fontSize: 11,
                        fontWeight: 700,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {job.model_name}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Card>
  );
}
