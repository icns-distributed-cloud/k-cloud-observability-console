import type { ClusterDetail, MetricProfilePoint } from '@/app/types'

export const dummyCluster: ClusterDetail = {
  id: 1,
  name: '경희대 서울캠퍼스 A동',
  status: 'active',
  is_live: true,
  cost_per_hour: '12.50',
  avg_util: 0.58,
  queued_count: 2,
  running_count: 4,
  done_count: 17,
  nodes: [
    {
      id: 1, name: 'g0', cluster_id: 1, alerts: [],
      metric_profiles: [
        { metric_type: 'util', baseline: '0.82', amplitude: '0.03', period_sec: 90, unit: 'pct' },
      ],
    },
    {
      id: 2, name: 'g1', cluster_id: 1, alerts: [],
      metric_profiles: [
        { metric_type: 'util', baseline: '0.80', amplitude: '0.04', period_sec: 110, unit: 'pct' },
      ],
    },
    {
      id: 3, name: 'g2', cluster_id: 1, alerts: [],
      metric_profiles: [
        { metric_type: 'util', baseline: '0.74', amplitude: '0.05', period_sec: 100, unit: 'pct' },
      ],
    },
    {
      id: 4, name: 'n0', cluster_id: 1, alerts: [],
      metric_profiles: [
        { metric_type: 'util', baseline: '0.50', amplitude: '0.06', period_sec: 80, unit: 'pct' },
      ],
    },
    {
      id: 5, name: 'n1', cluster_id: 1,
      alerts: [
        { id: 1, severity: 'sla', message: 'SLA 임계 접근 · p99 지연 42ms (목표 40ms 초과)' },
      ],
      metric_profiles: [
        { metric_type: 'util', baseline: '0.54', amplitude: '0.05', period_sec: 95, unit: 'pct' },
      ],
    },
    {
      id: 6, name: 'p0', cluster_id: 1, alerts: [],
      metric_profiles: [
        { metric_type: 'util', baseline: '0.05', amplitude: '0.02', period_sec: 120, unit: 'pct' },
      ],
    },
  ],
  accelerators: [
    { node_id: 1, kind: 'GPU', model_name: 'A100', tflops: '19.5', memory_gb: '80', memory_type: 'HBM2e', tdp_w: 400, count: 1 },
    { node_id: 2, kind: 'GPU', model_name: 'A100', tflops: '19.5', memory_gb: '80', memory_type: 'HBM2e', tdp_w: 400, count: 1 },
    { node_id: 3, kind: 'GPU', model_name: 'A100', tflops: '19.5', memory_gb: '80', memory_type: 'HBM2e', tdp_w: 400, count: 1 },
    { node_id: 4, kind: 'NPU', model_name: 'Sapeon X220', tflops: '6.4', memory_gb: '16', memory_type: 'GDDR6', tdp_w: 150, count: 1 },
    { node_id: 5, kind: 'NPU', model_name: 'Sapeon X220', tflops: '6.4', memory_gb: '16', memory_type: 'GDDR6', tdp_w: 150, count: 1 },
    { node_id: 6, kind: 'PIM', model_name: 'HBM-PIM', tflops: '2.1', memory_gb: '32', memory_type: 'HBM2', tdp_w: 90, count: 1 },
  ],
}

/** 클러스터 모니터링용 프로파일 (GET /clusters/{id}/metric-profiles 응답) */
export const dummyClusterMetrics: MetricProfilePoint[] = [
  { metric_type: 'utilization', baseline: '60', amplitude: '10', period_sec: 60, unit: 'pct' },
  { metric_type: 'power', baseline: '65', amplitude: '8', period_sec: 90, unit: 'kW' },
  { metric_type: 'sla', baseline: '99', amplitude: '0.5', period_sec: 120, unit: 'pct' },
]

/** 노드에서 실행 중인 작업 (실제로는 assignments + jobs 조합으로 구해야 함) */
export const dummyNodeJobs: Record<number, { name: string; color: string } | null> = {
  1: { name: 'FedCare-BERT', color: '#6366F1' },
  2: { name: 'FedCare-BERT', color: '#6366F1' },
  3: { name: 'ResNet-50', color: '#E11D48' },
  4: { name: 'MobileNetV2', color: '#D97706' },
  5: { name: 'MobileNetV2', color: '#D97706' },
  6: null,
}