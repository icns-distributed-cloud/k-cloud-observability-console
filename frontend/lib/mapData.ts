import type { ClusterTreeItem, ProviderKind, ProviderTree } from '@/app/types'

export interface MapRegion {
  id: number
  name: string
  location: string
  lat: number
  lon: number
  providerName: string
  providerKind: ProviderKind
  clusters: ClusterTreeItem[]
}

/** 대한민국 대략 범위 (국내/해외 구분용) */
function isDomestic(lat: number, lon: number): boolean {
  return lat >= 33 && lat <= 39 && lon >= 124 && lon <= 132
}

/** ProviderTree[] → MapRegion[] 로 평탄화 */
export function flattenRegions(providers: ProviderTree[]): MapRegion[] {
  const out: MapRegion[] = []
  for (const p of providers) {
    for (const r of p.regions) {
      out.push({
        id: r.id,
        name: r.name,
        location: r.location,
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        providerName: p.name,
        providerKind: p.kind,
        clusters: r.clusters,
      })
    }
  }
  return out
}

export function splitByLocation(regions: MapRegion[]) {
  return {
    domestic: regions.filter((r) => isDomestic(r.lat, r.lon)),
    overseas: regions.filter((r) => !isDomestic(r.lat, r.lon)),
  }
}

/** 클러스터 id → 소속 리전 찾기 (연결선 그릴 때 좌표 필요) */
export function buildClusterCoords(regions: MapRegion[]): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>()
  for (const r of regions) {
    for (const c of r.clusters) m.set(c.id, [r.lon, r.lat])
  }
  return m
}