-- Local test seed data. Small, hand-picked rows covering every table
-- so backend/frontend can each test against a known dataset locally.
--
-- Usage (from repo root, containers must be running and migrated):
--   docker compose exec -T db psql -U kcloud -d kcloud < backend/seed.sql
--
-- Safe to re-run any time - it wipes and reloads all seed tables first.
--
-- The app computes "now" in KST (see backend/app/clock.py), but this
-- session defaults to the container's UTC timezone. Switch it so every
-- now() below lands on the same wall-clock time the app would use -
-- otherwise seeded "running" jobs look 9 hours stale to the sweep logic
-- and get marked done immediately.
SET timezone = 'Asia/Seoul';

TRUNCATE
  provider, region, cluster, node, accelerator,
  cluster_metric_profile, node_metric_profile, accelerator_metric_profile,
  cluster_distributed_link, node_alert,
  model, model_layer, model_layer_edge, dataset,
  "user", job, assignment, event,
  job_metric_profile, job_cache_profile, job_cache_tier,
  hyperparam_adjustment, job_kqv_benchmark, reallocation,
  job_negotiation, job_negotiation_item,
  resource_tier, resource_tier_requirement
RESTART IDENTITY CASCADE;

-- ---------- infra ----------
-- provider 1 / region 1 / cluster 1,2 / node 1,2 / accelerator 1,2,3 are kept exactly as
-- they were originally seeded (job/assignment/event data below references these IDs
-- directly), everything else here is new demo breadth added on top (map now shows
-- 3 providers spread over 9 regions - 4 domestic, 5 overseas - and 10 clusters total).
INSERT INTO provider (name, kind) VALUES
  ('온프레미스', 'onprem'),
  ('AWS', 'cloud'),
  ('GCP', 'cloud');

-- id 4: purely for extra decorative world-map dots below (see world-map-only regions
-- block further down) - not clicked into during the demo, so kept minimal.
INSERT INTO provider (name, kind) VALUES
  ('Azure', 'cloud');

-- latitude/longitude: this is what places the pin on the map (see ClusterMap.tsx /
-- mapData.ts). lat 33-39 & lon 124-132 -> rendered as a domestic pin on the Korea-mode
-- map at its real coordinates; anything outside that box -> rendered as its own dot on
-- the world map at its real coordinates (all domestic regions get bundled into a single
-- "대한민국" hub marker in world view). So: real KR coords for onprem sites, real
-- datacenter-region coords for cloud regions.
INSERT INTO region (provider_id, name, location, latitude, longitude) VALUES
  (1, '서울 본원 DC', '서울 동대문구', 37.594, 127.052),
  (1, '수원 국제캠 DC', '경기 수원시 영통구', 37.2436, 127.0807),
  (1, '대전 DC', '대전 유성구', 36.3745, 127.3648),
  (1, '부산 DC', '부산 해운대구', 35.1796, 129.0756),
  (2, 'us-east-1', 'N. Virginia, US', 38.13, -78.45),
  (2, 'ap-northeast-1', 'Tokyo, JP', 35.68, 139.65),
  (2, 'eu-west-1', 'Dublin, IE', 53.41, -8.24),
  (3, 'us-central1', 'Iowa, US', 41.26, -95.86),
  (3, 'asia-southeast1', 'Singapore, SG', 1.35, 103.82);

-- world-map-only regions: dots on the world map, never drilled into during the demo,
-- so each gets just enough (1 cluster / 1 node / 1 accelerator) to render cleanly in
-- both the map and the "자원 계층" side panel without looking empty.
INSERT INTO region (provider_id, name, location, latitude, longitude) VALUES
  (2, 'eu-central-1', 'Frankfurt, DE', 50.11, 8.68),
  (2, 'ap-south-1', 'Mumbai, IN', 19.08, 72.88),
  (2, 'sa-east-1', 'Sao Paulo, BR', -23.55, -46.63),
  (2, 'af-south-1', 'Cape Town, ZA', -33.92, 18.42),
  (3, 'europe-west4', 'Eemshaven, NL', 53.44, 6.84),
  (3, 'australia-southeast1', 'Sydney, AU', -33.87, 151.21),
  (4, 'eastasia', 'Hong Kong, HK', 22.32, 114.17),
  (4, 'uksouth', 'London, UK', 51.51, -0.13),
  (4, 'canadacentral', 'Toronto, CA', 43.65, -79.38);

INSERT INTO cluster (region_id, name, status, is_live, cost_per_hour) VALUES
  (1, 'khu-cluster-01', 'active', false, 0),
  (1, 'khu-cluster-02', 'standby', false, 0),
  (2, 'khu-suwon-01', 'active', true, 0),
  (3, 'khu-daejeon-01', 'standby', false, 0),
  (4, 'khu-busan-01', 'active', false, 0),
  (5, 'aws-use1-a', 'active', false, 123.00),
  (6, 'aws-apne1-a', 'active', false, 98.50),
  (7, 'aws-euw1-a', 'standby', false, 0),
  (8, 'gcp-usc1-a', 'active', false, 110.00),
  (9, 'gcp-sea1-a', 'active', false, 105.00);

INSERT INTO cluster (region_id, name, status, is_live, cost_per_hour) VALUES
  (10, 'aws-euc1-a', 'active', false, 115.00),
  (11, 'aws-aps1-a', 'active', false, 92.00),
  (12, 'aws-sae1-a', 'standby', false, 0),
  (13, 'aws-afs1-a', 'active', false, 88.00),
  (14, 'gcp-euw4-a', 'active', false, 108.00),
  (15, 'gcp-ause1-a', 'active', false, 120.00),
  (16, 'azure-eas-a', 'active', false, 99.00),
  (17, 'azure-uks-a', 'standby', false, 0),
  (18, 'azure-cac-a', 'active', false, 101.00);

-- purpose only matters for admission on the live cluster (khu-suwon-01, id 3) - every
-- other node just gets 'train' as an arbitrary default since nothing reads it there.
INSERT INTO node (cluster_id, name, purpose) VALUES
  (1, 'srv-01', 'train'),
  (2, 'srv-02', 'train'),
  (3, 'suwon-srv-01', 'train'),
  (3, 'suwon-srv-02', 'train'),
  (4, 'daejeon-srv-01', 'train'),
  (4, 'daejeon-srv-02', 'train'),
  (5, 'busan-srv-01', 'train'),
  (5, 'busan-srv-02', 'train'),
  (6, 'use1-node-a', 'train'),
  (6, 'use1-node-b', 'train'),
  (7, 'apne1-node-a', 'train'),
  (7, 'apne1-node-b', 'train'),
  (8, 'euw1-node-a', 'train'),
  (8, 'euw1-node-b', 'train'),
  (9, 'usc1-node-a', 'train'),
  (9, 'usc1-node-b', 'train'),
  (10, 'sea1-node-a', 'train'),
  (10, 'sea1-node-b', 'train');

INSERT INTO node (cluster_id, name, purpose) VALUES
  (11, 'euc1-node-a', 'train'),
  (12, 'aps1-node-a', 'train'),
  (13, 'sae1-node-a', 'train'),
  (14, 'afs1-node-a', 'train'),
  (15, 'euw4-node-a', 'train'),
  (16, 'ause1-node-a', 'train'),
  (17, 'eas-node-a', 'train'),
  (18, 'uks-node-a', 'train'),
  (19, 'cac-node-a', 'train');

-- live cluster (khu-suwon-01) node pool, split by purpose so admission/resource-tier
-- availability can be demoed cleanly: train gets GPUx3 + NPUx1 (4 nodes), infer gets
-- NPUx1 + PIMx1 (2 nodes). suwon-srv-01/02 (GPU) and suwon-srv-03 (NPU) already existed;
-- 04-06 are new.
INSERT INTO node (cluster_id, name, purpose) VALUES
  (3, 'suwon-srv-03', 'train'),
  (3, 'suwon-srv-04', 'train'),
  (3, 'suwon-srv-05', 'infer'),
  (3, 'suwon-srv-06', 'infer');

INSERT INTO accelerator (node_id, kind, model_name, tflops, memory_gb, memory_type, tdp_w) VALUES
  (1, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (1, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (2, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (3, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (3, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (4, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (5, 'NPU', 'Furiosa RNGD', 256, 48, 'GDDR6', 180),
  (6, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (7, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (7, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (8, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (9, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (9, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (9, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (9, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (10, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (10, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (10, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (10, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (11, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (11, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (12, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (12, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (13, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (13, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (14, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (15, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (15, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (15, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (15, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (16, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (16, 'GPU', 'NVIDIA H100', 989, 80, 'HBM3', 700),
  (17, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (17, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (18, 'PIM', 'SK hynix AiM', 128, 32, 'HBM-PIM', 150);

INSERT INTO accelerator (node_id, kind, model_name, tflops, memory_gb, memory_type, tdp_w) VALUES
  (19, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (20, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (21, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (22, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (23, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (24, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (25, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (26, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (27, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400);

INSERT INTO accelerator (node_id, kind, model_name, tflops, memory_gb, memory_type, tdp_w) VALUES
  (28, 'NPU', 'Furiosa RNGD', 256, 48, 'GDDR6', 180),
  (29, 'GPU', 'NVIDIA A100', 312, 80, 'HBM2e', 400),
  (30, 'NPU', 'Furiosa RNGD', 256, 48, 'GDDR6', 180),
  (31, 'PIM', 'SK hynix AiM', 128, 32, 'HBM-PIM', 150);

-- All metric_profile tables render as: value(t) = baseline + amplitude * sin(2*pi*t / period_sec)
-- t = current unix epoch seconds (matches app/services/infra.py's _evaluate, which uses
-- time.time() - not job-relative, not wall-clock-of-day; just raw epoch seconds).
--
-- Scale convention: whenever unit='pct', baseline/amplitude are on a 0-100 scale
-- (same convention as 'sla' below), never 0-1. This applies to every utilization-style
-- metric_type (utilization, util, cpu, mem) so the frontend never has to guess whether
-- to multiply by 100 - only unit tells you the scale, and pct always means 0-100.
-- Non-pct units (kW, W, C) are already on their natural absolute scale, no ambiguity there.

-- cluster_metric_profile: all 3 documented metric_type values (power, utilization, sla), all 10 clusters
INSERT INTO cluster_metric_profile (cluster_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (1, 'utilization', 60, 10, 60, 'pct'),
  (1, 'power', 65, 8, 90, 'kW'),
  (1, 'sla', 99.0, 0.5, 120, 'pct'),
  (2, 'utilization', 45, 12, 55, 'pct'),
  (2, 'power', 50, 6, 80, 'kW'),
  (2, 'sla', 98.5, 0.4, 110, 'pct'),
  (3, 'utilization', 58, 9, 60, 'pct'),
  (3, 'power', 60, 7, 90, 'kW'),
  (3, 'sla', 99.2, 0.3, 120, 'pct'),
  (4, 'utilization', 50, 11, 55, 'pct'),
  (4, 'power', 55, 8, 85, 'kW'),
  (4, 'sla', 98.8, 0.5, 115, 'pct'),
  (5, 'utilization', 65, 10, 60, 'pct'),
  (5, 'power', 70, 9, 90, 'kW'),
  (5, 'sla', 99.0, 0.4, 120, 'pct'),
  (6, 'utilization', 72, 8, 50, 'pct'),
  (6, 'power', 110, 15, 70, 'kW'),
  (6, 'sla', 99.5, 0.2, 130, 'pct'),
  (7, 'utilization', 68, 10, 55, 'pct'),
  (7, 'power', 95, 12, 75, 'kW'),
  (7, 'sla', 99.1, 0.3, 125, 'pct'),
  (8, 'utilization', 40, 10, 60, 'pct'),
  (8, 'power', 60, 8, 90, 'kW'),
  (8, 'sla', 98.0, 0.6, 110, 'pct'),
  (9, 'utilization', 75, 9, 50, 'pct'),
  (9, 'power', 120, 14, 65, 'kW'),
  (9, 'sla', 99.4, 0.25, 130, 'pct'),
  (10, 'utilization', 63, 11, 55, 'pct'),
  (10, 'power', 88, 10, 80, 'kW'),
  (10, 'sla', 99.0, 0.35, 120, 'pct');

-- world-map-only clusters (11-19): utilization only, no power/sla - not shown anywhere
-- except the avg_util% in the side tree panel
INSERT INTO cluster_metric_profile (cluster_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (11, 'utilization', 54, 10, 60, 'pct'),
  (12, 'utilization', 61, 9, 55, 'pct'),
  (13, 'utilization', 33, 8, 65, 'pct'),
  (14, 'utilization', 57, 11, 55, 'pct'),
  (15, 'utilization', 49, 10, 60, 'pct'),
  (16, 'utilization', 66, 12, 50, 'pct'),
  (17, 'utilization', 70, 9, 45, 'pct'),
  (18, 'utilization', 28, 7, 65, 'pct'),
  (19, 'utilization', 52, 10, 55, 'pct');

-- node_metric_profile: node 1,2 keep their original full coverage; every new node gets util+temp
INSERT INTO node_metric_profile (node_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (1, 'util', 55, 15, 45, 'pct'),
  (1, 'cpu', 48, 12, 40, 'pct'),
  (1, 'mem', 62, 8, 55, 'pct'),
  (1, 'temp', 62, 4, 50, 'C'),
  (2, 'util', 30, 10, 45, 'pct'),
  (2, 'temp', 45, 3, 50, 'C'),
  (3, 'util', 50, 14, 45, 'pct'), (3, 'temp', 50, 3, 50, 'C'),
  (4, 'util', 42, 10, 45, 'pct'), (4, 'temp', 47, 3, 50, 'C'),
  (5, 'util', 55, 12, 40, 'pct'), (5, 'temp', 52, 4, 50, 'C'),
  (6, 'util', 38, 9, 45, 'pct'), (6, 'temp', 46, 3, 50, 'C'),
  (7, 'util', 60, 15, 40, 'pct'), (7, 'temp', 58, 4, 45, 'C'),
  (8, 'util', 48, 11, 45, 'pct'), (8, 'temp', 51, 3, 50, 'C'),
  (9, 'util', 70, 10, 35, 'pct'), (9, 'temp', 65, 5, 40, 'C'),
  (10, 'util', 66, 12, 35, 'pct'), (10, 'temp', 63, 4, 40, 'C'),
  (11, 'util', 58, 10, 40, 'pct'), (11, 'temp', 55, 4, 45, 'C'),
  (12, 'util', 62, 9, 40, 'pct'), (12, 'temp', 57, 3, 45, 'C'),
  (13, 'util', 35, 8, 50, 'pct'), (13, 'temp', 42, 3, 55, 'C'),
  (14, 'util', 30, 7, 50, 'pct'), (14, 'temp', 40, 3, 55, 'C'),
  (15, 'util', 75, 13, 30, 'pct'), (15, 'temp', 68, 5, 35, 'C'),
  (16, 'util', 71, 11, 32, 'pct'), (16, 'temp', 66, 4, 35, 'C'),
  (17, 'util', 55, 10, 45, 'pct'), (17, 'temp', 53, 4, 50, 'C'),
  (18, 'util', 40, 9, 45, 'pct'), (18, 'temp', 48, 3, 50, 'C'),
  (19, 'util', 50, 12, 45, 'pct'), (20, 'util', 60, 14, 40, 'pct'),
  (21, 'util', 45, 10, 55, 'pct'), (22, 'util', 55, 11, 50, 'pct'),
  (23, 'util', 48, 10, 55, 'pct'), (24, 'util', 62, 13, 45, 'pct'),
  (25, 'util', 68, 12, 40, 'pct'), (26, 'util', 30, 8, 60, 'pct'),
  (27, 'util', 52, 10, 50, 'pct'),
  (28, 'util', 40, 12, 40, 'pct'), (28, 'temp', 48, 3, 45, 'C'),
  (29, 'util', 45, 13, 42, 'pct'), (29, 'temp', 50, 3, 46, 'C'),
  (30, 'util', 38, 11, 41, 'pct'), (30, 'temp', 47, 3, 44, 'C'),
  (31, 'util', 32, 9, 43, 'pct'), (31, 'temp', 44, 3, 47, 'C');

-- node power draw (W), scaled roughly to what each node's accelerators pull
-- (A100 nodes ~300-560W, H100 nodes ~950-2100W, NPU/PIM nodes ~130-150W)
INSERT INTO node_metric_profile (node_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (1, 'power', 560, 130, 42, 'W'),
  (2, 'power', 320, 60, 45, 'W'),
  (3, 'power', 540, 110, 40, 'W'),
  (4, 'power', 300, 55, 46, 'W'),
  (5, 'power', 150, 30, 35, 'W'),
  (6, 'power', 310, 58, 44, 'W'),
  (7, 'power', 950, 180, 36, 'W'),
  (8, 'power', 520, 100, 40, 'W'),
  (9, 'power', 1050, 200, 30, 'W'),
  (10, 'power', 1000, 190, 32, 'W'),
  (11, 'power', 540, 105, 38, 'W'),
  (12, 'power', 520, 100, 39, 'W'),
  (13, 'power', 500, 95, 42, 'W'),
  (14, 'power', 300, 55, 45, 'W'),
  (15, 'power', 2100, 350, 26, 'W'),
  (16, 'power', 1150, 210, 29, 'W'),
  (17, 'power', 530, 100, 40, 'W'),
  (18, 'power', 130, 25, 50, 'W'),
  (19, 'power', 320, 60, 45, 'W'),
  (20, 'power', 330, 62, 44, 'W'),
  (21, 'power', 310, 58, 46, 'W'),
  (22, 'power', 325, 60, 43, 'W'),
  (23, 'power', 315, 57, 47, 'W'),
  (24, 'power', 335, 63, 42, 'W'),
  (25, 'power', 340, 65, 40, 'W'),
  (26, 'power', 300, 55, 48, 'W'),
  (27, 'power', 320, 60, 45, 'W'),
  (28, 'power', 160, 30, 35, 'W'),
  (29, 'power', 310, 58, 44, 'W'),
  (30, 'power', 155, 28, 36, 'W'),
  (31, 'power', 120, 22, 38, 'W');

-- accelerator_metric_profile: accelerator 1,2 keep original full coverage; every new
-- accelerator gets a single 'util' row (kept light since there are 32 new ones)
INSERT INTO accelerator_metric_profile (accelerator_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (1, 'util', 50, 20, 30, 'pct'),
  (1, 'mem', 70, 10, 35, 'pct'),
  (1, 'power', 280, 40, 25, 'W'),
  (2, 'util', 35, 15, 30, 'pct'),
  (4, 'util', 45, 15, 30, 'pct'), (5, 'util', 50, 12, 32, 'pct'),
  (6, 'util', 40, 10, 35, 'pct'), (7, 'util', 55, 18, 25, 'pct'),
  (8, 'util', 42, 11, 33, 'pct'), (9, 'util', 60, 20, 22, 'pct'),
  (10, 'util', 58, 19, 24, 'pct'), (11, 'util', 52, 15, 28, 'pct'),
  (12, 'util', 48, 14, 30, 'pct'), (13, 'util', 46, 13, 31, 'pct'),
  (14, 'util', 44, 12, 32, 'pct'), (15, 'util', 50, 15, 30, 'pct'),
  (16, 'util', 47, 13, 31, 'pct'), (17, 'util', 49, 14, 30, 'pct'),
  (18, 'util', 45, 12, 33, 'pct'), (19, 'util', 43, 11, 34, 'pct'),
  (20, 'util', 56, 16, 27, 'pct'), (21, 'util', 54, 15, 28, 'pct'),
  (22, 'util', 52, 14, 29, 'pct'), (23, 'util', 50, 13, 30, 'pct'),
  (24, 'util', 38, 10, 36, 'pct'), (25, 'util', 36, 9, 37, 'pct'),
  (26, 'util', 34, 8, 38, 'pct'),
  (27, 'util', 62, 20, 20, 'pct'), (28, 'util', 60, 19, 21, 'pct'),
  (29, 'util', 58, 18, 22, 'pct'), (30, 'util', 56, 17, 23, 'pct'),
  (31, 'util', 64, 21, 19, 'pct'), (32, 'util', 62, 20, 20, 'pct'),
  (33, 'util', 48, 14, 30, 'pct'), (34, 'util', 46, 13, 31, 'pct'),
  (35, 'util', 30, 8, 40, 'pct'),
  (36, 'util', 50, 12, 30, 'pct'), (37, 'util', 60, 14, 28, 'pct'),
  (38, 'util', 45, 10, 35, 'pct'), (39, 'util', 55, 11, 32, 'pct'),
  (40, 'util', 48, 10, 33, 'pct'), (41, 'util', 62, 13, 27, 'pct'),
  (42, 'util', 68, 12, 25, 'pct'), (43, 'util', 30, 8, 38, 'pct'),
  (44, 'util', 52, 10, 30, 'pct'),
  (45, 'util', 42, 14, 30, 'pct'),
  (46, 'util', 44, 13, 31, 'pct'), (47, 'util', 40, 12, 32, 'pct'),
  (48, 'util', 33, 10, 34, 'pct');

-- distributed links: domestic-domestic ones only ever draw in Korea-mode view.
-- (1, 6, true) is domestic(서울, cluster 1) <-> overseas(aws-use1-a, cluster 6) so it
-- also shows on the world map (first screen) as a line from the KR hub to that region.
INSERT INTO cluster_distributed_link (cluster_a_id, cluster_b_id, active) VALUES
  (1, 2, true),
  (3, 5, true),
  (1, 4, false),
  (1, 6, true);

INSERT INTO node_alert (node_id, severity, message) VALUES
  (1, 'sla', 'p99 지연 42ms (목표 40ms 초과)'),
  (7, 'physical', '온도 78°C (임계치 초과)'),
  (15, 'sla', 'p99 지연 55ms (목표 50ms 초과)');

-- ---------- model ----------
INSERT INTO model (name, type) VALUES
  ('BERT-base', 'nlp');

INSERT INTO model_layer (model_id, op_name, shape, gflops, mem_mb, characteristic) VALUES
  (1, 'Token Embedding', '512x768', 2.1, 3.1, 'memory_bound'),
  (1, 'Transformer Block x12', '512x768', 38.4, 24.0, 'balanced');

INSERT INTO model_layer_edge (from_layer_id, to_layer_id) VALUES
  (1, 2);

INSERT INTO dataset (name, model_id) VALUES
  ('SST-2', 1),
  ('GLUE-MNLI', 1),
  ('CIFAR-100', NULL);

-- csc-user-01 is the "logged in" user the CSC portal fixes on (no real auth); the
-- others exist so /jobs?user_id= filtering has something to actually filter out.
INSERT INTO "user" (name) VALUES
  ('csc-user-01'),
  ('csc-user-02'),
  ('csc-user-03');

-- ---------- resource tiers ----------
-- attached to cluster 3 (khu-suwon-01), the only is_live=true cluster. Its nodes are
-- purpose-split: train pool = suwon-srv-01/02/04 (GPU x3) + suwon-srv-03 (NPU x1);
-- infer pool = suwon-srv-05 (NPU x1) + suwon-srv-06 (PIM x1). Requirements below are
-- kept within each pool's actual kinds so "available" varies realistically instead of
-- being permanently stuck true/false. "available" in GET /resource-tiers is computed
-- live from free node counts (now purpose-filtered too), not stored.
INSERT INTO resource_tier (cluster_id, job_type, tier_no, cost_per_hour) VALUES
  (3, 'train', 1, 12.0),
  (3, 'train', 2, 5.0),
  (3, 'train', 3, 3.0),
  (3, 'train', 4, 2.0),
  (3, 'infer', 1, 8.0),
  (3, 'infer', 2, 4.0),
  (3, 'infer', 3, 3.0);

INSERT INTO resource_tier_requirement (tier_id, kind, node_count) VALUES
  (1, 'GPU', 2), (1, 'NPU', 1),  -- train tier 1: 고성능 혼합
  (2, 'GPU', 1),                 -- train tier 2: GPU 1대
  (3, 'NPU', 1),                 -- train tier 3: NPU 1대
  (4, 'GPU', 3),                 -- train tier 4: GPU 노드 3대 전부 필요 - 가끔만 available
  (5, 'NPU', 1), (5, 'PIM', 1),  -- infer tier 1: 저지연 혼합, 두 infer 노드 다 필요
  (6, 'NPU', 1),                 -- infer tier 2: NPU 1대
  (7, 'PIM', 2);                 -- infer tier 3: PIM 노드가 1대뿐이라 항상 대기 예상

-- ---------- jobs ----------
-- precision/sla_target were dropped from job (see migration 5fcc49cbc30e) - CSC wizard
-- never collected them. dataset_id/selected_tier_id are nullable and left unset here;
-- they get wired up once the CSC job-submission API seeds real dataset/resource_tier rows.
-- user_id 1 (csc-user-01) is the CSC portal's fixed "logged in" user - jobs 1/2/4 are
-- theirs so /jobs?user_id=1 has something to show; job 3 belongs to user 2 so CSC
-- filtering actually excludes something (CSP's unfiltered list still shows all 4).
-- job 1: train, currently running (started now, 180s duration)
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, submitted_at, started_at, finished_at) VALUES
  (1, 1, 'train', 'running', 128, 'time', now(), now(), NULL);

-- job 2: infer, already finished
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, submitted_at, started_at, finished_at) VALUES
  (1, 1, 'infer', 'done', 32, 'cost', now() - interval '15 minutes', now() - interval '10 minutes', now() - interval '5 minutes');

-- job 3: infer, still queued (no free node) - belongs to a different user
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, submitted_at, started_at, finished_at) VALUES
  (1, 2, 'infer', 'queued', 16, 'balanced', now() - interval '1 minute', NULL, NULL);

-- job 4: train, already finished - donated node1 to job1 (see reallocation below).
-- Reallocation is a train-only concept, so the donor here has to be a train job,
-- not job2 (infer) - that was the bug that made the "재할당" tab show up on an
-- infer job's detail page.
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, submitted_at, started_at, finished_at) VALUES
  (1, 1, 'train', 'done', 64, 'time', now() - interval '12 minutes', now() - interval '11 minutes', now() - interval '1 minute');

INSERT INTO assignment (job_id, node_id, from_t, to_t) VALUES
  (1, 1, now(), NULL),
  (2, 2, now() - interval '10 minutes', now() - interval '5 minutes'),
  (4, 1, now() - interval '11 minutes', now() - interval '1 minute');

INSERT INTO event (type, job_id, node_id, cluster_id, occurred_at) VALUES
  ('ARRIVAL', 1, NULL, NULL, now()),
  ('START', 1, 1, 1, now()),
  ('ARRIVAL', 2, NULL, NULL, now() - interval '15 minutes'),
  ('START', 2, 2, 2, now() - interval '10 minutes'),
  ('FINISH', 2, 2, 2, now() - interval '5 minutes'),
  ('ARRIVAL', 3, NULL, NULL, now() - interval '1 minute'),
  ('ARRIVAL', 4, NULL, NULL, now() - interval '12 minutes'),
  ('START', 4, 1, 1, now() - interval '11 minutes'),
  ('FINISH', 4, 1, 1, now() - interval '1 minute');

-- job 1 (train) overview cards
INSERT INTO job_metric_profile (job_id, seq, label, unit, start_value, target_value, curve_shape, total_count, featured) VALUES
  (1, 1, '정확도', '%', 40, 92, 'exp_approach', NULL, true),
  (1, 2, '에포크', NULL, NULL, NULL, NULL, 100, false);

-- job 2 (infer) overview cards - matches METRIC_TEMPLATES["infer"] in services/jobs.py
INSERT INTO job_metric_profile (job_id, seq, label, unit, start_value, target_value, curve_shape, total_count, featured) VALUES
  (2, 1, '처리량', 'req/s', 350, 420, 'exp_approach', NULL, true),
  (2, 2, '응답지연 p50', 'ms', NULL, 12, NULL, NULL, false),
  (2, 3, '응답지연 p99', 'ms', NULL, 38, NULL, NULL, false),
  (2, 4, '누적 요청 수', NULL, NULL, NULL, NULL, 12000, false),
  (2, 5, 'KV 캐시 적중률', '%', 45, 88, 'exp_approach', NULL, false),
  (2, 6, '요청당 전력', 'J', NULL, 0.42, NULL, NULL, false),
  (2, 7, 'Prefill 비율', '%', NULL, 35, NULL, NULL, false),
  (2, 8, 'Decode 비율', '%', NULL, 65, NULL, NULL, false);

-- job 2 (infer) caching
INSERT INTO job_cache_profile (job_id, latency_reduction_pct) VALUES
  (2, 33.0);

INSERT INTO job_cache_tier (job_id, tier_name, fill_pct, latency_ms) VALUES
  (2, 'VRAM', 82.0, 0.4),
  (2, 'DRAM', 55.0, 2.1),
  (2, 'SSD', 20.0, 18.0);

-- job 1 (train) DART history
INSERT INTO hyperparam_adjustment (job_id, seq, t_offset_sec, param_name, from_value, to_value, reward) VALUES
  (1, 1, 242, '배치 크기', '512', '640', '+0.021'),
  (1, 2, 700, '데이터 shard', '4-way', '6-way', '+0.014');

-- job 1 (train) KQV benchmark
INSERT INTO job_kqv_benchmark (job_id, kqv_gain_pct, kqv_even_makespan_sec, kqv_opt_makespan_sec) VALUES
  (1, 21.5, 77040, 60480);

-- reallocation: job4 (train, done) donated node1 to job1 (train, running)
INSERT INTO reallocation (donor_job_id, receiver_job_id, node_id, at_t_offset_sec, downtime_sec, resume_delay_sec) VALUES
  (4, 1, 1, 52, 0, 8);

-- job 1 negotiation
INSERT INTO job_negotiation (job_id, rounds, agreement_pct) VALUES
  (1, 5, 96.0);

INSERT INTO job_negotiation_item (job_id, side, seq, text) VALUES
  (1, 'proposed', 1, '학습시간 18h'),
  (1, 'proposed', 2, '비용 $210'),
  (1, 'agreed', 1, '전력 2.4kW'),
  (1, 'agreed', 2, '활용률 78%'),
  (1, 'agreed', 3, 'SLA 99.1%');
