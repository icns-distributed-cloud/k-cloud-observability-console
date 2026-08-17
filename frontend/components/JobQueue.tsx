"use client";
import { useEffect, useRef, useState } from "react";
import { tierMix } from "@/lib/jobs";
import { waitingLabel } from "@/lib/jobMetrics";
import type { JobSummary } from "@/app/types";
import styles from "./JobQueue.module.css";

interface Props {
  /** status="queued"인 job만, submitted_at 오름차순으로 넘겨준다 */
  jobs: JobSummary[];
  nowMs: number;
  onSelectJob: (jobId: number) => void;
}

export default function JobQueue({ jobs, nowMs, onSelectJob }: Props) {
  // 큐를 빠져나간 job(배정됨)을 바로 지우지 않고, 퇴장 애니메이션이 끝날 때까지
  // 잠깐 더 화면에 들고 있는다. 원래 있던 자리에서 그대로 빠져나가야
  // "중간 것이 먼저 나간다"가 보이므로, 순서는 항상 이전 목록을 기준으로 유지한다.
  const [rendered, setRendered] = useState<JobSummary[]>(jobs);
  const [leavingIds, setLeavingIds] = useState<Set<number>>(new Set());
  const prevIdsRef = useRef<Set<number>>(new Set(jobs.map((j) => j.id)));

  useEffect(() => {
    const incomingIds = new Set(jobs.map((j) => j.id));
    const departed = [...prevIdsRef.current].filter((id) => !incomingIds.has(id));

    if (departed.length > 0) {
      setLeavingIds((prev) => new Set([...prev, ...departed]));
      setRendered((prevList) => {
        const known = new Set(prevList.map((j) => j.id));
        const stillOrLeaving = prevList.filter(
          (j) => incomingIds.has(j.id) || departed.includes(j.id)
        );
        const arrived = jobs.filter((j) => !known.has(j.id));
        return [...stillOrLeaving, ...arrived];
      });
    } else {
      setRendered(jobs);
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

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--sub)", marginBottom: 8 }}>
        대기열{jobs.length > 0 ? ` (${jobs.length})` : ""}
      </div>

      {rendered.length === 0 ? (
        <div style={{ fontSize: 14, color: "var(--sub)", padding: "8px 2px" }}>
          대기 중인 작업 없음
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {rendered.map((job) => {
            const leaving = leavingIds.has(job.id);
            return (
              <div
                key={job.id}
                onClick={() => !leaving && onSelectJob(job.id)}
                onAnimationEnd={() => leaving && handleLeaveEnd(job.id)}
                className={`${styles.card} ${leaving ? styles.leaving : ""}`}
                style={{
                  flexShrink: 0,
                  minWidth: 172,
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  background: "var(--panel-2)",
                  cursor: leaving ? "default" : "pointer",
                }}
              >
                <div
                  title={job.model_name}
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {job.model_name}
                </div>
                <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                  {tierMix(job.selected_tier) || "—"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sub)", marginTop: 6 }}>
                  대기 {waitingLabel(job, nowMs)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
