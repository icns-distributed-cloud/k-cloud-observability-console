"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { buildGraphColumns, CHARACTERISTIC_COLORS, CHARACTERISTIC_LABELS } from "@/lib/modelGraph";
import type { ModelLayerEdgeItem, ModelLayerItem } from "@/app/types";

interface ModelGraphProps {
  layers: ModelLayerItem[];
  edges: ModelLayerEdgeItem[];
}

interface EdgePath {
  id: string;
  d: string;
}

export default function ModelGraph({ layers, edges }: ModelGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<number, HTMLDivElement>());
  const [paths, setPaths] = useState<EdgePath[]>([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  const rows = buildGraphColumns(layers, edges);

  // buildGraphColumns는 depth(몇 번째 줄)만 정해줄 뿐, 실제로 어느 박스가 어느 박스로
  // 이어지는지는 안 그려준다 - 레이어가 몇 개 안 될 땐 줄마다 화살표 하나로도 우연히
  // 맞아떨어졌지만, 브랜치·머지가 있으면 그걸론 실제 연결을 표현할 수 없다. 그래서
  // 레이아웃이 끝난 뒤 각 박스의 실제 위치를 재서, from_layer_id -> to_layer_id 엣지마다
  // 곡선을 그린다. 같은 depth 안에서 줄바꿈(wrap)되면 위치가 바뀌므로 ResizeObserver로
  // 다시 잰다.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const anchor = (el: HTMLDivElement, side: "top" | "bottom") => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left + r.width / 2 - containerRect.left,
          y: (side === "top" ? r.top : r.bottom) - containerRect.top,
        };
      };

      const next: EdgePath[] = [];
      for (const e of edges) {
        const from = nodeRefs.current.get(e.from_layer_id);
        const to = nodeRefs.current.get(e.to_layer_id);
        if (!from || !to) continue;
        const p1 = anchor(from, "bottom");
        const p2 = anchor(to, "top");
        // 제어점을 각자의 x에 고정하면(예전 방식) 양 끝 접선이 항상 수직이 돼서
        // 화살표가 항상 아래를 향해 어색해 보였다. 대신 두 점을 잇는 대각선 쪽으로
        // 제어점을 당겨서, 접선이 실제 연결 방향을 따라가게 한다.
        const midX = (p1.x + p2.x) / 2;
        const c1y = p1.y + (p2.y - p1.y) * 0.25;
        const c2y = p1.y + (p2.y - p1.y) * 0.75;
        next.push({
          id: `${e.from_layer_id}-${e.to_layer_id}`,
          d: `M ${p1.x} ${p1.y} C ${midX} ${c1y}, ${midX} ${c2y}, ${p2.x} ${p2.y}`,
        });
      }
      setPaths(next);
      setSvgSize({ width: container.scrollWidth, height: container.scrollHeight });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [layers, edges]);

  if (layers.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--sub)", textAlign: "center", padding: 20 }}>
        레이어 정보가 없습니다.
      </div>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          paddingBottom: 8,
        }}
      >
        <svg
          width={svgSize.width}
          height={svgSize.height}
          style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }}
        >
          <defs>
            <marker
              id="model-graph-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="var(--sub)" />
            </marker>
          </defs>
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              stroke="var(--sub)"
              strokeWidth={1.5}
              markerEnd="url(#model-graph-arrow)"
            />
          ))}
        </svg>

        {rows.map((row) => (
          <div
            key={row.depth}
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 40,
            }}
          >
            {row.layers.map((l) => {
              const color = CHARACTERISTIC_COLORS[l.characteristic] ?? "var(--sub)";
              return (
                <div
                  key={l.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(l.id, el);
                    else nodeRefs.current.delete(l.id);
                  }}
                  style={{
                    background: "var(--panel-2)",
                    border: "1px solid var(--line)",
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    minWidth: 150,
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                    {l.op_name}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--sub)",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {Number(l.gflops)} GFLOPs · {CHARACTERISTIC_LABELS[l.characteristic] ?? l.characteristic}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--sub)",
                      fontFamily: "'IBM Plex Mono', monospace",
                      marginTop: 2,
                    }}
                  >
                    {l.shape} · {Number(l.mem_mb)}MB
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 10.5, color: "var(--sub)" }}>
        {Object.entries(CHARACTERISTIC_LABELS).map(([key, label]) => (
          <span key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: CHARACTERISTIC_COLORS[key],
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
