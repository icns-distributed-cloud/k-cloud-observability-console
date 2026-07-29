import { buildGraphColumns, CHARACTERISTIC_COLORS, CHARACTERISTIC_LABELS } from "@/lib/modelGraph";
import type { ModelLayerEdgeItem, ModelLayerItem } from "@/app/types";

interface ModelGraphProps {
  layers: ModelLayerItem[];
  edges: ModelLayerEdgeItem[];
}

export default function ModelGraph({ layers, edges }: ModelGraphProps) {
  if (layers.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--sub)", textAlign: "center", padding: 20 }}>
        레이어 정보가 없습니다.
      </div>
    );
  }

  const columns = buildGraphColumns(layers, edges);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
        {columns.map((col, ci) => (
          <div key={col.depth} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {col.layers.map((l) => {
                const color = CHARACTERISTIC_COLORS[l.characteristic] ?? "var(--sub)";
                return (
                  <div
                    key={l.id}
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

            {ci < columns.length - 1 && (
              <span style={{ color: "var(--sub)", fontSize: 14, flexShrink: 0 }}>→</span>
            )}
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