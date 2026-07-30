import type { ModelLayerEdgeItem, ModelLayerItem } from '@/app/types'

export interface GraphColumn {
  depth: number
  layers: ModelLayerItem[]
}

/**
 * 엣지 기반으로 각 레이어의 깊이(열 번호)를 계산한다.
 * 깊이 = 선행 레이어들의 최대 깊이 + 1 (진입 엣지가 없으면 0)
 * 위상정렬(Kahn's algorithm)로 순회하며 계산한다.
 */
export function buildGraphColumns(
  layers: ModelLayerItem[],
  edges: ModelLayerEdgeItem[]
): GraphColumn[] {
  const byId = new Map(layers.map((l) => [l.id, l]))
  const indegree = new Map<number, number>()
  const outgoing = new Map<number, number[]>()
  const depth = new Map<number, number>()

  for (const l of layers) {
    indegree.set(l.id, 0)
    outgoing.set(l.id, [])
    depth.set(l.id, 0)
  }

  for (const e of edges) {
    if (!byId.has(e.from_layer_id) || !byId.has(e.to_layer_id)) continue
    indegree.set(e.to_layer_id, (indegree.get(e.to_layer_id) ?? 0) + 1)
    outgoing.get(e.from_layer_id)!.push(e.to_layer_id)
  }

  // 진입 차수 0인 노드부터 시작
  const queue = layers.filter((l) => indegree.get(l.id) === 0).map((l) => l.id)
  const visited: number[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    visited.push(id)

    for (const next of outgoing.get(id) ?? []) {
      // 선행 노드보다 최소 1 깊게
      depth.set(next, Math.max(depth.get(next) ?? 0, (depth.get(id) ?? 0) + 1))

      const remaining = (indegree.get(next) ?? 0) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  // 순환이 있으면 방문 못한 노드가 남음 → 맨 뒤 열에 몰아넣음
  if (visited.length < layers.length) {
    const maxDepth = Math.max(0, ...Array.from(depth.values()))
    for (const l of layers) {
      if (!visited.includes(l.id)) depth.set(l.id, maxDepth + 1)
    }
  }

  // 깊이별로 그룹핑
  const grouped = new Map<number, ModelLayerItem[]>()
  for (const l of layers) {
    const d = depth.get(l.id) ?? 0
    if (!grouped.has(d)) grouped.set(d, [])
    grouped.get(d)!.push(l)
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([d, ls]) => ({ depth: d, layers: ls }))
}

/** characteristic별 색상 */
export const CHARACTERISTIC_COLORS: Record<string, string> = {
  compute_bound: 'var(--layer-compute)',
  memory_bound: 'var(--layer-memory)',
  balanced: 'var(--layer-balanced)',
}

export const CHARACTERISTIC_LABELS: Record<string, string> = {
  compute_bound: '연산 집약',
  memory_bound: '메모리 집약',
  balanced: '균형',
}