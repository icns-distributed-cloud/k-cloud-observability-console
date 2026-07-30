"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { DistributedLinkItem } from "@/app/types";
import { buildClusterCoords, isDomestic, splitByLocation, type MapRegion } from "@/lib/mapData";

const WORLD_URL = "https://unpkg.com/world-atlas@2/countries-110m.json";
const KR_ID = "410";
const KR_HUB: [number, number] = [127.9, 36.4];

const ACCENT = "#6366F1";
const LAND = "#1C2A45";
const LAND_STROKE = "#2C3E60";

interface GeoFeature {
  type: string;
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry: unknown;
}

interface ClusterMapProps {
  regions: MapRegion[];
  links: DistributedLinkItem[];
  onSelectCluster: (clusterId: number) => void;
}

/** 컨테이너 크기를 추적 */
function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 560 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export default function ClusterMap({ regions, links, onSelectCluster }: ClusterMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(wrapRef);

  const [world, setWorld] = useState<GeoFeature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"world" | "korea">("world");
  const [picker, setPicker] = useState<{ x: number; y: number; region: MapRegion } | null>(null);

  useEffect(() => {
    fetch(WORLD_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((topo) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fc = feature(topo, (topo as any).objects.countries) as any;
        setWorld(fc.features as GeoFeature[]);
      })
      .catch(() => setError("지도 데이터를 불러오지 못했습니다."));
  }, []);

  const { domestic, overseas } = useMemo(() => splitByLocation(regions), [regions]);
  const clusterCoords = useMemo(() => buildClusterCoords(regions), [regions]);

  const geo = useMemo(() => {
    if (!world || !w || !h) return null;
    const pad = 26;
    if (mode === "korea") {
      const kr = world.find((f) => String(f.id) === KR_ID);
      if (!kr) return null;
      const proj = geoMercator();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proj.fitExtent([[pad, pad], [w - pad, h - pad]], kr as any);
      return { proj, path: geoPath(proj), kr };
    }
    const proj = geoNaturalEarth1();
    proj.fitExtent([[pad, pad], [w - pad, h - pad]], { type: "Sphere" });
    return { proj, path: geoPath(proj), kr: null };
  }, [world, w, h, mode]);

  const project = useCallback(
    (lon: number, lat: number): [number, number] | null => {
      if (!geo) return null;
      const p = geo.proj([lon, lat]);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
      return [p[0], p[1]];
    },
    [geo]
  );

  const enterKorea = () => {
    setPicker(null);
    setMode("korea");
  };
  const backToWorld = () => {
    setPicker(null);
    setMode("world");
  };

  if (error) {
    return (
      <div ref={wrapRef} style={shellStyle}>
        <div style={{ color: "var(--sub)", fontSize: 13 }}>{error}</div>
      </div>
    );
  }
  if (!world || !geo) {
    return (
      <div ref={wrapRef} style={shellStyle}>
        <div style={{ color: "var(--sub)", fontSize: 12.5 }}>지도 로딩 중…</div>
      </div>
    );
  }

  const domesticClusterCount = domestic.reduce((n, r) => n + r.clusters.length, 0);

  return (
    <div ref={wrapRef} style={shellStyle}>
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        {/* 국가 경계 */}
        <g>
          {world.map((f, i) => {
            const isKR = String(f.id) === KR_ID;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const d = geo.path(f as any);
            if (!d) return null;
            return (
              <path
                key={i}
                d={d}
                fill={mode === "world" && isKR ? "#2A3A5E" : LAND}
                stroke={LAND_STROKE}
                strokeWidth={0.5}
                style={mode === "world" && isKR ? { cursor: "pointer" } : undefined}
                onClick={mode === "world" && isKR ? enterKorea : undefined}
              />
            );
          })}
        </g>

        {/* 연결선 */}
        <g>
          {mode === "korea" &&
            links.map((l) => {
              const a = clusterCoords.get(l.cluster_a_id);
              const b = clusterCoords.get(l.cluster_b_id);
              if (!a || !b) return null;
              const pa = project(a[0], a[1]);
              const pb = project(b[0], b[1]);
              if (!pa || !pb) return null;
              return (
                <line
                  key={l.id}
                  x1={pa[0]}
                  y1={pa[1]}
                  x2={pb[0]}
                  y2={pb[1]}
                  stroke={l.active ? ACCENT : "#3A4A66"}
                  strokeWidth={l.active ? 1.6 : 1}
                  strokeDasharray={l.active ? undefined : "4 4"}
                  opacity={l.active ? 0.8 : 0.45}
                />
              );
            })}

          {/* world 모드: 국내 쪽은 대한민국 허브 마커 위치로 대체해서 그림.
              양쪽 다 국내인 링크는 둘 다 같은 허브 점으로 뭉개져 그릴 게 없으므로 스킵 */}
          {mode === "world" &&
            links.map((l) => {
              const a = clusterCoords.get(l.cluster_a_id);
              const b = clusterCoords.get(l.cluster_b_id);
              if (!a || !b) return null;
              const aDomestic = isDomestic(a[1], a[0]);
              const bDomestic = isDomestic(b[1], b[0]);
              if (aDomestic && bDomestic) return null;
              const pa = project(...(aDomestic ? KR_HUB : a));
              const pb = project(...(bDomestic ? KR_HUB : b));
              if (!pa || !pb) return null;
              return (
                <line
                  key={`w-${l.id}`}
                  x1={pa[0]}
                  y1={pa[1]}
                  x2={pb[0]}
                  y2={pb[1]}
                  stroke={l.active ? ACCENT : "#3A4A66"}
                  strokeWidth={l.active ? 1.6 : 1}
                  strokeDasharray={l.active ? undefined : "4 4"}
                  opacity={l.active ? 0.8 : 0.45}
                />
              );
            })}
        </g>

        {/* 마커 */}
        <g>
          {mode === "world" ? (
            <>
              {(() => {
                const hub = project(KR_HUB[0], KR_HUB[1]);
                if (!hub || domesticClusterCount === 0) return null;
                return (
                  <g transform={`translate(${hub[0]},${hub[1]})`} style={{ cursor: "pointer" }} onClick={enterKorea}>
                    <circle r={15} fill={ACCENT} opacity={0.16} />
                    <circle r={7} fill={ACCENT} stroke="var(--bg)" strokeWidth={1.5} />
                    <MarkerLabel text={`대한민국 · 클러스터 ${domesticClusterCount}곳`} y={-20} bold />
                  </g>
                );
              })()}
              {overseas.map((r) => {
                const p = project(r.lon, r.lat);
                if (!p) return null;
                const anyActive = r.clusters.some((c) => c.status === "active");
                return (
                  <g key={r.id} transform={`translate(${p[0]},${p[1]})`}>
                    <circle r={5} fill={anyActive ? ACCENT : "#8FA1BD"} stroke="var(--bg)" strokeWidth={1.5} />
                    <MarkerLabel text={`${r.name} · ${r.clusters.length}`} y={-14} />
                  </g>
                );
              })}
            </>
          ) : (
            domestic.map((r) => {
              const p = project(r.lon, r.lat);
              if (!p) return null;
              const multi = r.clusters.length > 1;
              const anyActive = r.clusters.some((c) => c.status === "active");
              const anyAlert = r.clusters.some((c) => c.has_alert);
              const col = anyActive ? ACCENT : "#64748B";
              const handleClick = () => {
                if (multi) setPicker({ x: p[0], y: p[1], region: r });
                else if (r.clusters[0]) onSelectCluster(r.clusters[0].id);
              };
              return (
                <g
                  key={r.id}
                  transform={`translate(${p[0]},${p[1]})`}
                  style={{ cursor: "pointer" }}
                  onClick={handleClick}
                >
                  <circle r={multi ? 15 : 11} fill={col} opacity={0.18} />
                  {anyAlert && (
                    <circle r={5.5} fill="#EF4444" cx={9} cy={-9} stroke="var(--bg)" strokeWidth={1.5} />
                  )}
                  <circle r={multi ? 11 : 6.5} fill={col} stroke="var(--bg)" strokeWidth={1.5} />
                  {multi && (
                    <text
                      y={4}
                      textAnchor="middle"
                      fill="var(--bg)"
                      fontSize={12}
                      fontWeight={800}
                      fontFamily="'IBM Plex Mono', monospace"
                      style={{ pointerEvents: "none" }}
                    >
                      {r.clusters.length}
                    </text>
                  )}
                  <MarkerLabel text={multi ? r.name : r.clusters[0]?.name ?? r.name} y={-20} bold />
                </g>
              );
            })
          )}
        </g>
      </svg>

      {/* 상단 오버레이 */}
      <div style={{ position: "absolute", top: 14, left: 16, display: "flex", alignItems: "center", gap: 10 }}>
        {mode === "korea" && (
          <button onClick={backToWorld} style={backBtnStyle}>
            ‹ 세계 지도
          </button>
        )}
        <div style={badgeStyle}>
          {mode === "korea" ? "대한민국 · 연구 클러스터" : "글로벌 연동 · 대한민국을 클릭"}
        </div>
      </div>

      {mode === "world" && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: 16,
            fontSize: 11.5,
            color: "var(--sub)",
            background: "rgba(11,18,32,.55)",
            padding: "6px 11px",
            borderRadius: 8,
          }}
        >
          🇰🇷 대한민국 마커를 클릭하면 국내 클러스터 지도가 열립니다
        </div>
      )}

      {/* 클러스터 선택 팝오버 */}

      {/* 클러스터 선택 팝오버 */}
      {picker && (
        <div
          style={{
            position: "absolute",
            left: Math.max(12, Math.min(picker.x - 110, w - 232)),
            top: Math.max(12, picker.y - 12 - 44 * (picker.region.clusters.length + 1)),
            width: 220,
            background: "rgba(15,23,40,.97)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 8,
            boxShadow: "0 12px 32px rgba(0,0,0,.5)",
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 6px 8px",
              fontSize: 11.5,
              color: "var(--sub)",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {picker.region.name}
            <button
              onClick={() => setPicker(null)}
              style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", fontSize: 14 }}
            >
              ×
            </button>
          </div>
          {picker.region.clusters.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setPicker(null);
                onSelectCluster(c.id);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: "none",
                border: "none",
                color: "var(--ink)",
                padding: "9px 6px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12.5,
                fontWeight: 600,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: c.status === "active" ? ACCENT : "#64748B",
                  flexShrink: 0,
                }}
              />
              {c.name}
              {c.has_alert && (
                <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: "#EF4444" }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MarkerLabel({ text, y, bold }: { text: string; y: number; bold?: boolean }) {
  return (
    <text
      y={y}
      textAnchor="middle"
      fill={bold ? "var(--ink)" : "#B7C4D8"}
      fontSize={11}
      fontWeight={bold ? 700 : 500}
      style={{ pointerEvents: "none" }}
    >
      {text}
    </text>
  );
}

const shellStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 520,
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const backBtnStyle: React.CSSProperties = {
  border: "1px solid var(--line)",
  background: "rgba(11,18,32,.7)",
  color: "var(--ink)",
  borderRadius: 9,
  padding: "6px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
};

const badgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--sub)",
  fontFamily: "'IBM Plex Mono', monospace",
  background: "rgba(11,18,32,.55)",
  padding: "5px 10px",
  borderRadius: 8,
};