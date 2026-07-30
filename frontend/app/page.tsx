"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ClusterMap from "@/components/ClusterMap";
import { fetchDistributedLinks, fetchProviders } from "@/lib/api";
import { flattenRegions, type MapRegion } from "@/lib/mapData";
import type { DistributedLinkItem, ProviderTree } from "@/app/types";

const PROVIDER_KIND_LABELS: Record<string, string> = {
  onprem: "온프레미스",
  cloud: "클라우드",
};

export default function Home() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderTree[]>([]);
  const [links, setLinks] = useState<DistributedLinkItem[]>([]);
  const [regions, setRegions] = useState<MapRegion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchProviders(), fetchDistributedLinks().catch(() => [])])
      .then(([p, l]) => {
        setProviders(p);
        setLinks(l);
        setRegions(flattenRegions(p));
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;

  return (
    <main style={{ padding: "24px 28px", display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0, height: "calc(100vh - 48px)" }}>
        <ClusterMap
          regions={regions}
          links={links}
          onSelectCluster={(id) => router.push(`/clusters/${id}`)}
        />
      </div>

      <aside style={{ width: 300, flexShrink: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--sub)",
            marginBottom: 12,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          자원 계층
        </div>

        {providers.map((p) => (
          <div
            key={p.id}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>
              {p.name}
              {PROVIDER_KIND_LABELS[p.kind] !== p.name && (
                <span style={{ fontSize: 11, color: "var(--sub)", fontWeight: 500, marginLeft: 6 }}>
                  {PROVIDER_KIND_LABELS[p.kind] ?? p.kind}
                </span>
              )}
            </div>

            {p.regions.map((r) => (
              <div key={r.id} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--sub)",
                    fontFamily: "'IBM Plex Mono', monospace",
                    marginBottom: 6,
                  }}
                >
                  ▪ {r.name}
                </div>

                {r.clusters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/clusters/${c.id}`)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      background: "none",
                      border: "none",
                      color: "var(--ink)",
                      padding: "6px 0 6px 10px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12.5,
                      fontWeight: 600,
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: c.status === "active" ? "var(--accent)" : "#64748B",
                        flexShrink: 0,
                      }}
                    />
                    {c.name}
                    {c.has_alert && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#EF4444",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 11,
                        color: "var(--sub)",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {c.node_count}노드
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </aside>
    </main>
  );
}