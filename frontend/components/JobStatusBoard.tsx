"use client";
import { useEffect, useRef, useState, type Key, type ReactNode } from "react";
import Card from "@/components/Card";
import { fetchJobs } from "@/lib/api";
import { CURRENT_USER_ID } from "@/lib/auth";
import { JOB_COLORS, JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/jobs";
import type { JobStatus, JobSummary } from "@/app/types";
import styles from "./JobStatusBoard.module.css";

/** 이 페이지는 다른 화면들보다 짧게 잡는다 - 준비중/마무리중 구간(백엔드
 * PROVISIONING_SEC/FINALIZING_SEC)이 이 주기보다 훨씬 짧으면 그 사이 상태를
 * 못 보고 건너뛴 것처럼 보인다. */
const POLL_MS = 4_000;
const STAGE_HEIGHT = 560;
/** 완료 열은 세로로 쌓이므로 STAGE_HEIGHT 안에 물리적으로 들어가는 만큼만 보여준다.
 *  예산 = (STAGE_HEIGHT - HEADER_H - SLOT_GAP) / (CHIP_H + SLOT_GAP) ≈ 15슬롯.
 *  분산 job은 2줄이라 2슬롯을 먹으니 여유를 두고 12로 잡았다. STAGE_HEIGHT나
 *  CHIP_H를 바꾸면 이 값도 같이 봐야 한다. */
const DONE_CAP = 12;
const STATUSES: JobStatus[] = ["queued", "provisioning", "running", "finalizing", "done"];
const CHIP_W = 78;
const CHIP_H = 26;
const LINK_W = 12;
const ROW_GAP = 6;
/** 열 제목이 차지하는 높이 - 칩은 이 아래에서부터 쌓인다 */
const HEADER_H = 40;
/** 세로로 쌓이는 칩(그룹) 사이 간격 */
const SLOT_GAP = 8;
/** 열 박스 좌우 여백 */
const PAD_X = 12;

interface Props {
  onSelect: (jobId: number) => void;
  onCountChange?: (count: number) => void;
}

interface Positioned {
  job: JobSummary;
  x: number;
  y: number;
  /** 그룹(분산 job이면 여러 줄) 높이. 레이아웃에서 이미 계산한 값을 렌더가 다시
   *  계산하지 않고 그대로 쓴다 - 따로 계산하면 rowCap이 바뀔 때 둘이 어긋난다. */
  h: number;
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

  const colW = stageWidth / STATUSES.length;
  const cardW = colW - PAD_X * 2;
  const columnX = (zi: number) => colW * (zi + 0.5);
  /** 열 폭에 칩이 가로로 몇 개 들어가는지 (예전 ROW_CAP=2 상수를 대체).
   *  분산 job은 이 개수까지 한 줄에 놓고 넘치면 다음 줄로 접는다. */
  const rowCap = Math.max(1, Math.floor((cardW + LINK_W) / (CHIP_W + LINK_W)));

  const byStatus = new Map<JobStatus, JobSummary[]>(STATUSES.map((s) => [s, []]));
  for (const job of [...rendered].sort(byOldestFirst)) {
    byStatus.get(job.status as JobStatus)?.push(job);
  }

  // 열 안에서 위→아래로 쌓는다. 그룹 높이가 job마다 다르므로(분산은 2줄) 균등
  // 간격이 아니라 누적으로 계산해야 겹치지 않는다. byStatus가 byOldestFirst로
  // 정렬돼 있어 오래된 게 위에 오고, 맨 위가 빠지면 아래가 한 칸씩 올라오면서
  // 큐가 전진하는 것처럼 보인다.
  const groupHeightOf = (job: JobSummary) => {
    const n = Math.max(1, job.assigned_nodes.length);
    const rows = Math.ceil(n / rowCap);
    return rows * CHIP_H + (rows - 1) * ROW_GAP;
  };

  const positioned: Positioned[] = [];
  STATUSES.forEach((status, zi) => {
    const cx = columnX(zi);
    let y = HEADER_H + SLOT_GAP;
    for (const job of byStatus.get(status) ?? []) {
      const h = groupHeightOf(job);
      positioned.push({ job, x: cx, y: y + h / 2, h });   // x/y는 계속 그룹 중심
      y += h + SLOT_GAP;
    }
  });
  const posById = new Map(positioned.map((p) => [p.job.id, p]));

  return (
    <Card>
      <div ref={stageRef} style={{ position: "relative", width: "100%", height: STAGE_HEIGHT }}>
        {stageWidth > 0 && (
          <>
            {/* 열 사이 흐름 - 글리프 하나를 키우는 것보다 열 사이 빈 공간을 채우는
                셰브론이 단계 흐름으로 읽힌다. 열 제목 줄 높이에 맞춰 고정한다. */}
            {STATUSES.slice(0, -1).map((_, zi) => (
              <div
                key={`arrow-${zi}`}
                aria-hidden
                style={{
                  position: "absolute",
                  left: (columnX(zi) + columnX(zi + 1)) / 2,
                  top: HEADER_H / 2,
                  transform: "translate(-50%, -50%)",
                  width: PAD_X * 2,
                  height: 14,
                  background: "var(--line)",
                  clipPath: "polygon(0 20%, 55% 20%, 55% 0, 100% 50%, 55% 100%, 55% 80%, 0 80%)",
                }}
              />
            ))}

            {STATUSES.map((status, zi) => {
              const cx = columnX(zi);
              // rendered에는 퇴장 애니메이션 중인 스냅샷도 섞여 있어서 실제 서버
              // 상태보다 크게 나온다 - 헤더 숫자는 원본 jobs 기준으로 센다.
              const count = jobs.filter((j) => j.status === status).length;
              return (
                <div key={status}>
                  <div
                    style={{
                      position: "absolute",
                      left: cx - cardW / 2,
                      top: 0,
                      width: cardW,
                      height: STAGE_HEIGHT,
                      borderRadius: 12,
                      border: `1.5px solid ${JOB_STATUS_COLORS[status]}`,
                      // 세로로 길어지면 같은 농도도 훨씬 진해 보여서 30% -> 12%로 낮췄다.
                      background: `color-mix(in srgb, ${JOB_STATUS_COLORS[status]} 12%, var(--panel-2))`,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: cx,
                      top: 10,
                      transform: "translateX(-50%)",
                      textAlign: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {JOB_STATUS_LABELS[status]}{" "}
                    <span style={{ color: "var(--sub)", fontWeight: 600 }}>({count})</span>
                  </div>
                </div>
              );
            })}

            {rendered.map((job) => {
              const pos = posById.get(job.id);
              if (!pos) return null;
              const leaving = leavingIds.has(job.id);
              // 미배정(대기중)이면 assigned_nodes가 비어있다 - 그때도 칩은 하나 그린다.
              const pillCount = Math.max(1, job.assigned_nodes.length);
              const distributed = pillCount > 1;
              const mine = job.user_id === CURRENT_USER_ID;

              // 한 줄에 rowCap개까지, 넘어가면 다음 줄로 접는다.
              // 마지막 줄에 자리가 덜 차면 가운데 정렬한다.
              const perRow = Math.min(pillCount, rowCap);
              const groupWidth = perRow * CHIP_W + (perRow - 1) * LINK_W;
              const groupHeight = pos.h;   // 레이아웃에서 계산한 값을 그대로 쓴다
              const centers: { x: number; y: number }[] = [];
              for (let i = 0; i < pillCount; i++) {
                const row = Math.floor(i / rowCap);
                const col = i % rowCap;
                const itemsInRow = Math.min(rowCap, pillCount - row * rowCap);
                const rowWidth = itemsInRow * CHIP_W + (itemsInRow - 1) * LINK_W;
                const rowLeft = (groupWidth - rowWidth) / 2;
                const left = rowLeft + col * (CHIP_W + LINK_W);
                const top = row * (CHIP_H + ROW_GAP);
                centers.push({ x: left + CHIP_W / 2, y: top + CHIP_H / 2 });
              }

              const pill = (key: Key, title: string, left: number, top: number) => (
                <div
                  key={key}
                  title={title}
                  style={{
                    position: "absolute",
                    left,
                    top,
                    width: CHIP_W,
                    height: CHIP_H,
                    borderRadius: 13,
                    background: JOB_COLORS[job.type],
                    // 시연 유저(CSC, user_id=1)가 제출한 job은 링을 둘러서 필러 사이에서도
                    // 바로 눈에 띄게 한다. 링은 진행률 바를 자르는 overflow:hidden과 같은
                    // 엘리먼트에 두면 자기 자신의 box-shadow까지 잘려서 안 보인다 - 그래서
                    // overflow:hidden은 진행률 바 트랙(아래, 훨씬 작은 범위)으로 내리고 여긴
                    // 안 둔다. 색은 이 칩 팔레트(초록/주황)와도, 칩들이 겹칠 때 생기는 기본
                    // drop-shadow 착시(옅은 흰 테두리)와도 안 섞이는 rose(--new-job)로 골랐다.
                    boxShadow: mine
                      ? "0 1px 4px rgba(0,0,0,0.18), 0 0 0 3px var(--new-job)"
                      : "0 1px 4px rgba(0,0,0,0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 8px",

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
              );

              const pills: ReactNode[] = [];
              for (let i = 0; i < pillCount; i++) {
                const node = job.assigned_nodes[i];
                const title = node
                  ? `J-${job.id} · ${job.model_name} · ${node.node_name} (${i + 1}/${pillCount})`
                  : `J-${job.id} · ${job.model_name}`;
                const c = centers[i];
                pills.push(pill(`pill-${i}`, title, c.x - CHIP_W / 2, c.y - CHIP_H / 2));
              }

              return (
                <div
                  key={job.id}
                  onClick={() => !leaving && onSelect(job.id)}
                  onAnimationEnd={() => leaving && handleLeaveEnd(job.id)}
                  className={`${styles.chip} ${leaving ? styles.leaving : ""}`}
                  style={{
                    position: "absolute",
                    left: pos.x - groupWidth / 2,
                    top: pos.y - groupHeight / 2,
                    width: groupWidth,
                    height: groupHeight,
                    cursor: leaving ? "default" : "pointer",
                    transition: "left 500ms ease, top 500ms ease",
                    // 겹친 칩들 사이에서 링이 이웃 칩에 가려 일부만 보이지 않도록, 강조된 칩을
                    // 항상 맨 위로 그린다. (실제로 둥둥 떠다니는 애니메이션은 안쪽 .float에
                    // 걸려있어서, z-index만 여기 두고 테두리 자체는 .float에 같이 둔다 -
                    // 그래야 칩이 위아래로 떠다닐 때 테두리도 같이 움직인다.)
                    zIndex: mine ? 5 : distributed ? 2 : undefined,
                  }}
                >
                  {distributed && (
                    // 칩 중심끼리 순서대로 이어주는 선 - 같은 줄이면 가로선, 다음 줄로
                    // 넘어가는 지점이면 대각선이 돼서 자연스럽게 지그재그로 이어진다.
                    <svg
                      width={groupWidth}
                      height={groupHeight}
                      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
                    >
                      {centers.slice(1).map((c, i) => (
                        <line
                          key={`link-${i}`}
                          x1={centers[i].x}
                          y1={centers[i].y}
                          x2={c.x}
                          y2={c.y}
                          style={{ stroke: JOB_COLORS[job.type] }}
                          strokeWidth={3}
                          opacity={0.6}
                        />
                      ))}
                      {pillCount >= 3 && (
                        // 마지막 칩을 첫 칩으로 되돌려 닫는다 - 3개면 삼각형, 그 이상이면
                        // 마지막 줄 끝과 첫 줄 시작을 잇는 선 하나가 더 생겨서 전체가 하나의
                        // 닫힌 그룹으로 보인다.
                        <line
                          x1={centers[pillCount - 1].x}
                          y1={centers[pillCount - 1].y}
                          x2={centers[0].x}
                          y2={centers[0].y}
                          style={{ stroke: JOB_COLORS[job.type] }}
                          strokeWidth={3}
                          opacity={0.6}
                        />
                      )}
                    </svg>
                  )}
                  {pills}
                </div>
              );
            })}
          </>
        )}
      </div>
    </Card>
  );
}
