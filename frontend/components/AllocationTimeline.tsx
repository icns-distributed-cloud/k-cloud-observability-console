"use client";
import { JOB_COLORS } from "@/lib/jobs";
import type { TimelineData } from "@/lib/timeline";

interface Props {
  data: TimelineData;
  onSelectJob?: (jobId: number) => void;
}

const ROW_H = 38;
const LABEL_W = 132;

export default function AllocationTimeline({ data, onSelectJob }: Props) {
  return (
    <div>
      {/* 막대 영역 */}
      <div style={{ position: "relative" }}>
        {data.rows.map((row) => (
          <div
            key={row.nodeId}
            style={{ display: "flex", alignItems: "center", height: ROW_H, gap: 10 }}
          >
            <span
              title={row.nodeName}
              style={{
                width: LABEL_W,
                flexShrink: 0,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "'IBM Plex Mono', monospace",
                textAlign: "right",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {row.nodeName}
            </span>

            <div
              style={{
                position: "relative",
                flex: 1,
                height: 22,
                background: "var(--panel-2)",
                borderRadius: 6,
              }}
            >
              {row.bars.map((bar) => {
                const color = bar.isNew
                  ? "var(--new-job)"
                  : bar.job
                    ? JOB_COLORS[bar.job.type]
                    : "var(--idle)";
                return (
                  <div
                    key={bar.assignmentId}
                    onClick={() => bar.job && onSelectJob?.(bar.job.id)}
                    title={bar.job?.model_name ?? `job ${bar.jobId}`}
                    style={{
                      position: "absolute",
                      left: `${bar.start * 100}%`,
                      width: `${bar.width * 100}%`,
                      top: 0,
                      height: "100%",
                      background: color,
                      borderRadius: 6,
                      boxShadow: bar.isNew ? "0 0 0 2px var(--new-job-glow)" : undefined,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 8,
                      color: "#FFFFFF",
                      fontSize: 13,
                      fontWeight: 700,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      cursor: bar.job ? "pointer" : "default",
                    }}
                  >
                    {bar.job?.model_name ?? `J${bar.jobId}`}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* 현재 시각 세로선 */}
        {data.nowPos !== null && (
          <div
            style={{
              position: "absolute",
              left: `calc(${LABEL_W}px + 10px + (100% - ${LABEL_W}px - 10px) * ${data.nowPos})`,
              top: 4,
              bottom: 4,
              width: 2,
              background: "var(--ink)",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -6,
                left: -4,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--ink)",
              }}
            />
          </div>
        )}
      </div>

      {/* 눈금 */}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <span style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ position: "relative", flex: 1, height: 18 }}>
          {data.ticks.map((t, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${t.pos * 100}%`,
                transform:
                  i === 0 ? "none" : i === data.ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--sub)",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}