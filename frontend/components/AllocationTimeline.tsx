"use client";
import { useState, type CSSProperties } from "react";
import { JOB_COLORS } from "@/lib/jobs";
import type { JobSummary } from "@/app/types";
import type { TimelineData } from "@/lib/timeline";
import styles from "./AllocationTimeline.module.css";

/** 학습 섹션 전용: 대기열의 job이 예측(전력/활용률/SLA) 기반 최적화로 방금 어느
 *  노드에 배치됐는지 - id는 admission(assignment) 단위로 매번 새로 만들어서, 같은
 *  노드가 짧은 간격으로 다시 배치받아도 애니메이션이 각각 새로 재생된다. */
export interface AdmittedFlash {
  id: string;
  nodeId: number;
  /** 이동 중 라벨에 쓴다 - "뭔가 보라색 점이 휙" 수준으론 뭘 하는 건지 안 보인다는
   *  피드백을 받고, 무슨 job이 어디로 배치됐는지 글자로 같이 보여주기로 했다. */
  modelName: string;
}

interface Props {
  data: TimelineData;
  onSelectJob?: (jobId: number) => void;
  /** 추론 섹션 전용: 점유 막대 대신 "지금 서빙 중인 모델명" 별도 칸 + 요청 도착
   *  애니메이션을 보여준다. 기본은 false(학습 섹션과 같은 기존 점유 막대 타임라인). */
  showActiveModel?: boolean;
  /** 학습 섹션 전용: 방금 예측 기반으로 배치된 job들 - 왼쪽 위 최적화 배지에서 그
   *  노드 행까지 짧은 점 하나가 날아가는 걸로 "이 예측으로 여기 배치됐다"를 보여준다. */
  admittedFlashes?: AdmittedFlash[];
}

const ROW_H = 38;
const LABEL_W = 132;
/** showActiveModel일 때만 쓰는, 노드 이름 옆 별도 모델명 칸 */
const MODEL_COL_W = 150;
const GAP = 10;
/** 요청 애니메이션 1주기가 상징하는 실제 요청 수 - "req 숫자" 표시가 매 주기 이만큼씩 늘어난다 */
const REQUESTS_PER_PULSE = 1000;
/** 오른쪽 GPU/DRAM/Disk 계층 다이어그램 폭 - showActiveModel일 때만 붙는다 */
const HIERARCHY_W = 190;

export default function AllocationTimeline({ data, onSelectJob, showActiveModel, admittedFlashes }: Props) {
  const leadingW = LABEL_W + (showActiveModel ? GAP + MODEL_COL_W : 0);
  // 알고 보니 원본 그림이 노드(GPU)별이 아니라 클러스터 하나 단위였다 - 행마다 따로
  // 그리던 티어 표시를 걷어내고, 지금 활성 job들을 한데 모아 오른쪽에 클러스터
  // 공용 계층 다이어그램 하나로 그린다. 노드 여러 개짜리(분산) job은 행(노드)마다
  // 한 번씩 잡히니 job.id로 중복 제거한다 - 안 그러면 같은 모델이 여러 번 뜬다.
  const activeJobs = showActiveModel
    ? [...new Map(
        data.rows
          .map((row) => row.bars.find((b) => b.isActive)?.job)
          .filter((j): j is JobSummary => j !== undefined)
          .map((j) => [j.id, j] as const)
      ).values()]
    : [];

  return (
    <div style={{ display: "flex", gap: 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
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
                    display: "inline-flex",
                    alignItems: "center",
                    height: 24,
                    padding: "0 10px",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: activeBar?.job
                      ? "color-mix(in srgb, var(--job-infer) 12%, var(--panel-2))"
                      : "var(--panel-2)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: activeBar?.job ? "var(--job-infer)" : "var(--sub)",
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

        {/* 예측 기반 배치 표시 (학습 섹션 전용) - 방금 배치된 job의 모델명을 단 라벨이
            위에서 그 노드 행까지 날아가고, 도착하면 그 행 전체가 잠깐 테두리로
            빛난다. 예전엔 색만 있는 점이라 "뭔가 휙 지나간다"는 것만 보이고 뭘 하는
            건지 안 보인다는 피드백을 받아, 라벨(무슨 job인지)과 도착 지점 강조(어느
            행인지)를 둘 다 넣었다. 실제 배치 알고리즘과는 무관하고, "예측을 보고
            이 job이 저기 배치됐다"는 인상만 주는 시연용 연출이다. */}
        {admittedFlashes &&
          admittedFlashes.map((f) => {
            const idx = data.rows.findIndex((r) => r.nodeId === f.nodeId);
            if (idx === -1) return null;
            const rowTop = idx * ROW_H;
            const rowCenter = rowTop + ROW_H / 2;
            return (
              <span key={f.id}>
                <span
                  className={styles.optimizeLabel}
                  style={{ "--target-top": `${rowCenter}px` } as CSSProperties}
                >
                  {f.modelName}
                </span>
                <span className={styles.optimizeRowGlow} style={{ top: rowTop, height: ROW_H }} />
              </span>
            );
          })}
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

      {showActiveModel && <ClusterModelHierarchy jobs={activeJobs} />}
    </div>
  );
}

const TIER_COLD = "#9CA3AF"; // Disk - 회색
const TIER_READY = "#F59E0B"; // DRAM - 주황/노랑
const TIER_ACTIVE = "#16A34A"; // GPU - 초록

export type Tier = "active" | "ready" | "cold";

/** 준비중(provisioning) job의 모델이 Disk→DRAM→GPU 중 어디쯤 있는지 - 이미 알고 있는
 *  단계 진행률(phase_progress)을 그대로 위치로 옮겨 쓴다. 실행중/마무리중이면 이미
 *  다 올라온 것이므로 GPU.
 *  page.tsx의 펄스(req 도착 애니메이션) 대상 판정에도 그대로 재사용한다 - Disk/DRAM
 *  단계는 아직 로딩 중이라 실제로 요청을 처리할 수 없으니, "GPU 티어"의 기준이 두
 *  군데서 어긋나면 안 된다. */
export function tierOf(job: JobSummary): Tier {
  const pct = job.status === "provisioning" ? (job.phase_progress ?? 0) * 100 : 100;
  return pct < 34 ? "cold" : pct < 67 ? "ready" : "active";
}

const TIER_ZONES: { key: Tier; label: string; color: string }[] = [
  { key: "active", label: "GPU", color: TIER_ACTIVE },
  { key: "ready", label: "DRAM", color: TIER_READY },
  { key: "cold", label: "Disk", color: TIER_COLD },
];

/** SwitchServe 논문 그림에서 착안 - 그림을 다시 보니 노드(GPU)별이 아니라 클러스터
 *  하나 단위 다이어그램이었다. 그래서 행마다 따로 안 그리고, 지금 활성인 job들을
 *  전부 모아 GPU(위)→DRAM→Disk(아래) 세 구역에 나눠 담는다. 실제 GPU/DRAM/Disk
 *  점유를 추적하는 건 아니고, 각 job의 준비중 단계 진행률로 구역만 정한다. */
function ClusterModelHierarchy({ jobs }: { jobs: JobSummary[] }) {
  const byTier: Record<Tier, JobSummary[]> = { active: [], ready: [], cold: [] };
  for (const job of jobs) byTier[tierOf(job)].push(job);

  return (
    <div style={{ width: HIERARCHY_W, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {TIER_ZONES.map((zone) => (
        <div key={zone.key} className={styles.hierarchyZone} style={{ borderColor: zone.color }}>
          <div className={styles.hierarchyLabel} style={{ color: zone.color }}>
            {zone.label}
          </div>
          <div className={styles.hierarchyChips}>
            {byTier[zone.key].length === 0 ? (
              <span className={styles.hierarchyEmpty}>—</span>
            ) : (
              byTier[zone.key].map((job) => (
                <span key={job.id} className={styles.hierarchyChip} title={job.model_name}>
                  <span className={styles.hierarchyDot} style={{ background: zone.color }} />
                  {job.model_name}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
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
  const duration = Math.max(intervalSec, MIN_FLIGHT_SEC);
  // 새로고침 직후엔 모든 행의 애니메이션이 마운트된 그 순간을 0%로 잡고 출발한다 -
  // duration이 같거나 비슷한 여러 행(비슷한 처리량)은 완전히 같은 위상으로 움직여서
  // req들이 한 몸처럼 나란히 날아간다. seed(노드 id)로 각 행을 그 사이클의 서로 다른
  // 지점에서 이미 출발한 것처럼 음수 delay를 줘서 위상을 흩뜨린다.
  const delayFrac = ((seed * 613) % 997) / 997;
  return (
    <span
      className={styles.pulse}
      style={{ animationDuration: `${duration}s`, animationDelay: `${-(duration * delayFrac).toFixed(2)}s` }}
      onAnimationIteration={() => setCount((c) => c + REQUESTS_PER_PULSE)}
    >
      req {count}
    </span>
  );
}
