"use client";
import { useEffect, useRef, useState } from "react";
import Card from "@/components/Card";
import { fetchJobs } from "@/lib/api";
import { CURRENT_USER_ID } from "@/lib/auth";
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
/** 나선 슬롯을 job.id % 이 값으로 고정한다 (zone 안 "몇 번째냐"로 정하면, 형제 job이
 * 들고 날 때마다 순번이 밀려서 다른 job들 위치까지 같이 튄다 - 필러가 자주 도니까
 * 매 폴링마다 여러 zone이 통째로 재배치되는 것처럼 보였다). id % N은 zone 인원과
 * 무관하게 항상 같은 슬롯이라, 같은 job은 형제가 바뀌어도 제자리에 머문다. */
const SPIRAL_SLOTS = 30;
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
  // 단계가 바뀐(예: provisioning -> running) job은 진행률 바가 이전 폭에서 부드럽게
  // "줄어드는" 게 아니라 즉시 리셋돼야 한다 - width 트랜지션을 그 한 번만 꺼서 스냅시킨다.
  const prevStatusRef = useRef<Map<number, JobStatus>>(new Map());
  const [phaseResetIds, setPhaseResetIds] = useState<Set<number>>(new Set());

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
    const changedStatus = new Set<number>();
    for (const job of jobs) {
      const prevStatus = prevStatusRef.current.get(job.id);
      if (prevStatus !== undefined && prevStatus !== job.status) changedStatus.add(job.id);
      prevStatusRef.current.set(job.id, job.status);
    }
    setPhaseResetIds(changedStatus);

    const done = jobs.filter((j) => j.status === "done").sort(byOldestFirst);
    const overflowIds = new Set(
      (done.length > DONE_CAP ? done.slice(0, done.length - DONE_CAP) : []).map((j) => j.id)
    );
    const visibleJobs = jobs.filter((j) => !overflowIds.has(j.id));

    const incomingIds = new Set(visibleJobs.map((j) => j.id));
    const departed = [...prevIdsRef.current].filter((id) => !incomingIds.has(id));

    if (departed.length > 0) {
      setLeavingIds((prev) => new Set([...prev, ...departed]));
      // 나가는 job만 퇴장 애니메이션이 끝날 때까지 예전 스냅샷을 들고 있는다 - 남아있는
      // job까지 죄다 옛날 데이터로 되돌리면(이전 방식), 누구 하나 나갈 때마다 한 폴링
      // 주기 동안 화면 전체가 멈췄다 따라잡는 것처럼 보인다.
      setRendered((prevList) => {
        const departingSnapshots = prevList.filter((j) => departed.includes(j.id));
        return [...visibleJobs, ...departingSnapshots];
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

  // 슬롯 개수가 고정이라 spacing도 고정 - zone 인원수가 늘고 줄어도 이미 있던
  // job들의 위치는 안 바뀐다 (SPIRAL_SLOTS 위 주석 참고).
  const spiralSpacing = Math.max(Math.min(zoneRadius / Math.sqrt(SPIRAL_SLOTS), 46), 24);
  const positioned: Positioned[] = [];
  STATUSES.forEach((status, zi) => {
    const list = byStatus.get(status) ?? [];
    const { cx, cy } = zoneCenter(zi);
    for (const job of list) {
      const slot = job.id % SPIRAL_SLOTS;
      const angle = slot * GOLDEN_ANGLE;
      const r = spiralSpacing * Math.sqrt(slot);
      positioned.push({ job, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
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
                    // 겹친 칩들 사이에서 링이 이웃 칩에 가려 일부만 보이지 않도록, 강조된 칩을
                    // 항상 맨 위로 그린다. (실제로 둥둥 떠다니는 애니메이션은 안쪽 .float에
                    // 걸려있어서, z-index만 여기 두고 테두리 자체는 .float에 같이 둔다 -
                    // 그래야 칩이 위아래로 떠다닐 때 테두리도 같이 움직인다.)
                    zIndex: job.user_id === CURRENT_USER_ID ? 5 : undefined,
                  }}
                >
                  <div
                    className={styles.float}
                    title={`J-${job.id} · ${job.model_name}`}
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      borderRadius: 13,
                      background: JOB_COLORS[job.type],
                      // 시연 유저(CSC, user_id=1)가 제출한 job은 링을 둘러서 필러 사이에서도
                      // 바로 눈에 띄게 한다. 링은 진행률 바를 자르는 overflow:hidden과 같은
                      // 엘리먼트에 두면 자기 자신의 box-shadow까지 잘려서 안 보인다 - 그래서
                      // overflow:hidden은 진행률 바 트랙(아래, 훨씬 작은 범위)으로 내리고 여긴
                      // 안 둔다. 색은 이 칩 팔레트(초록/주황)와도, 칩들이 겹칠 때 생기는 기본
                      // drop-shadow 착시(옅은 흰 테두리)와도 안 섞이는 rose(--new-job)로 골랐다.
                      boxShadow:
                        job.user_id === CURRENT_USER_ID
                          ? "0 1px 4px rgba(0,0,0,0.18), 0 0 0 3px var(--new-job)"
                          : "0 1px 4px rgba(0,0,0,0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 8px",
                      // 같은 job이라도 항상 같은 위상으로 떠서 폴링마다 리듬이 안 바뀌게
                      animationDelay: `${(job.id % 10) * 0.28}s`,
                    }}
                  >
                    {job.phase_progress !== null && (
                      // provisioning/finalizing/running 단계 진행률 (queued·done·무기한
                      // 추론 running은 백엔드가 null로 내려줘서 여기 아예 안 보인다).
                      // 항상 보이는 트랙을 깔아야 진행률이 낮을 때도 "진행바가 있다"는
                      // 게 보이고, width에 폴링 주기만큼 트랜지션을 걸어야 4초마다
                      // 스냅으로 뚝뚝 튀지 않고 부드럽게 차오르는 것처럼 보인다.
                      // overflow:hidden은 위 .float가 아니라 여기 둔다 - 부모의 box-shadow
                      // 링을 자르지 않으면서, 진행률 바 자체는 알약 모양 아래쪽 모서리에
                      // 맞춰 둥글게 잘라내야 해서 borderRadius도 같이 준다.
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: 4,
                          background: "rgba(0,0,0,0.3)",
                          borderRadius: "0 0 13px 13px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${job.phase_progress * 100}%`,
                            background: "#FFFFFF",
                            transition: phaseResetIds.has(job.id) ? "none" : `width ${POLL_MS}ms linear`,
                          }}
                        />
                      </div>
                    )}
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
