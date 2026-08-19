"use client";
import { useState } from "react";
import { JOB_COLORS } from "@/lib/jobs";
import type { TimelineData } from "@/lib/timeline";
import styles from "./AllocationTimeline.module.css";

interface Props {
  data: TimelineData;
  onSelectJob?: (jobId: number) => void;
  /** 추론 섹션 전용: 점유 막대 대신 "지금 서빙 중인 모델명" 별도 칸 + 요청 도착
   *  애니메이션을 보여준다. 기본은 false(학습 섹션과 같은 기존 점유 막대 타임라인). */
  showActiveModel?: boolean;
}

const ROW_H = 38;
const LABEL_W = 132;
/** showActiveModel일 때만 쓰는, 노드 이름 옆 별도 모델명 칸 */
const MODEL_COL_W = 150;
const GAP = 10;
/** 요청 애니메이션 1주기가 상징하는 실제 요청 수 - "req 숫자" 표시가 매 주기 이만큼씩 늘어난다 */
const REQUESTS_PER_PULSE = 1000;

export default function AllocationTimeline({ data, onSelectJob, showActiveModel }: Props) {
  const leadingW = showActiveModel ? LABEL_W + GAP + MODEL_COL_W : LABEL_W;

  return (
    <div>
      {/* 막대 영역 */}
      <div style={{ position: "relative" }}>
        {data.rows.map((row) => {
          // 지금 이 노드를 점유 중인 job (있다면) - 모델명 칸과 요청 애니메이션에 쓴다.
          // 처리량을 못 가져와 펄스 속도 계산에 실패해도 "뭘 서빙 중인지"는 보여줘야
          // 하므로, 펄스 유무(pulseIntervalSec)와는 별개로 isActive만으로 판단한다.
          const activeBar = row.bars.find((b) => b.isActive);
          return (
            <div
              key={row.nodeId}
              style={{ display: "flex", alignItems: "center", height: ROW_H, gap: GAP }}
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

              {showActiveModel && (
                <span
                  title={activeBar?.job?.model_name}
                  style={{
                    width: MODEL_COL_W,
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--sub)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {activeBar?.job?.model_name ?? ""}
                </span>
              )}

              <div
                style={{
                  position: "relative",
                  flex: 1,
                  height: 22,
                  background: "var(--panel-2)",
                  borderRadius: 6,
                }}
              >
                {/* 추론 섹션은 점유 막대를 안 그린다 - 모델명은 이제 왼쪽 별도 칸이,
                    "요청이 오간다"는 느낌은 아래 RequestFlyer가 맡는다. */}
                {!showActiveModel &&
                  row.bars.map((bar) => {
                    const color = bar.isMine
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
                          boxShadow: bar.isMine ? "0 0 0 2px var(--new-job-glow)" : undefined,
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

                {activeBar?.pulseIntervalSec !== undefined && (
                  <RequestFlyer intervalSec={activeBar.pulseIntervalSec} seed={activeBar.nodeId} />
                )}
              </div>
            </div>
          );
        })}

        {/* 현재 시각 세로선 - 추론 섹션은 더 이상 "과거~지금" 이력을 보여주는 타임라인이
            아니라 요청이 오가는 걸 보여줄 뿐이라, 시각 기준선 자체가 의미가 없다. */}
        {!showActiveModel && data.nowPos !== null && (
          <div
            style={{
              position: "absolute",
              left: `calc(${leadingW}px + ${GAP}px + (100% - ${leadingW}px - ${GAP}px) * ${data.nowPos})`,
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

      {/* 눈금 - 마찬가지로 추론 섹션은 시간축이 없는 화면이라 뺀다 */}
      {!showActiveModel && (
        <div style={{ display: "flex", gap: GAP, marginTop: 8 }}>
          <span style={{ width: leadingW, flexShrink: 0 }} />
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
      )}
    </div>
  );
}

/** 처리량이 높으면 pulseIntervalSec이 1~2초까지 짧아지는데, 그 속도로 트랙을 다
 *  가로지르게 하면 "req N" 글자를 읽을 새도 없이 지나간다 - 도착 빈도(간격) 자체는
 *  처리량을 그대로 반영하되, 한 번 날아가는 데 걸리는 시간에는 최소값을 둔다. */
const MIN_FLIGHT_SEC = 4;

/** 트랙 오른쪽("지금")에서 나타나 왼쪽(트랙 끝, 모델명 칸 진입 전)까지 날아가 사라지는
 *  요청 하나. "req N" 텍스트가 매 주기 REQUESTS_PER_PULSE(1000)씩 늘어나서, 같은 게
 *  아니라 계속 새 요청이 도착하는 것처럼 보이게 한다. 애니메이션 좌표가 트랙 자기
 *  자신(0~100%) 기준이라 왼쪽 끝을 넘어 모델명 칸까지 침범하지 않는다. */
function RequestFlyer({ intervalSec, seed }: { intervalSec: number; seed: number }) {
  const [count, setCount] = useState(() => (seed * 137) % REQUESTS_PER_PULSE);
  return (
    <span
      className={styles.pulse}
      style={{ animationDuration: `${Math.max(intervalSec, MIN_FLIGHT_SEC)}s` }}
      onAnimationIteration={() => setCount((c) => c + REQUESTS_PER_PULSE)}
    >
      req {count}
    </span>
  );
}
