-- Full seed data for the current schema (see backend/app/models.py). Rebuilt from
-- scratch to reflect every table as of this point (accelerator_model, node.purpose,
-- user, dataset, resource_tier/resource_tier_requirement, job without
-- precision/sla_target). Meant for real deployment, not just local smoke testing.
--
-- Usage (from repo root, containers must be running and migrated):
--   docker compose exec -T db psql -U kcloud -d kcloud < backend/seed.sql
--
-- Safe to re-run any time - it wipes and reloads all seed tables first.
--
-- The app computes "now" in KST (see backend/app/clock.py), but this session
-- defaults to the container's UTC timezone. Switch it so every now() below lands on
-- the same wall-clock time the app would use - otherwise timestamps look off by 9h.
SET timezone = 'Asia/Seoul';

TRUNCATE
  provider, region, cluster, node, accelerator_model, accelerator,
  cluster_metric_profile, node_metric_profile, accelerator_metric_profile,
  cluster_distributed_link, node_alert,
  model, model_layer, model_layer_edge, dataset,
  "user", job, assignment, event,
  job_metric_profile, job_cache_profile, job_cache_tier,
  hyperparam_adjustment, job_kqv_benchmark, reallocation,
  job_negotiation, job_negotiation_item,
  resource_tier, resource_tier_requirement
RESTART IDENTITY CASCADE;

-- ============================================================
-- infra: provider > region > cluster > node > accelerator
-- ============================================================
INSERT INTO provider (name, kind) VALUES
  ('온프레미스', 'onprem'),
  ('AWS', 'cloud'),
  ('GCP', 'cloud'),
  ('Azure', 'cloud');

-- latitude/longitude place the pin on the CSP map: lat 33-39 & lon 124-132 -> domestic
-- pin at its real coordinates on the Korea-mode map; anything outside that box -> its
-- own dot on the world map (domestic regions bundle into one "대한민국" hub there).
INSERT INTO region (provider_id, name, location, latitude, longitude) VALUES
  (1, '서울 본원 DC', '서울 동대문구', 37.594, 127.052),
  (1, '수원 국제캠 DC', '경기 수원시 영통구', 37.2436, 127.0807),
  (1, '대전 DC', '대전 유성구', 36.3745, 127.3648),
  (1, '부산 DC', '부산 해운대구', 35.1796, 129.0756),
  (2, 'us-east-1', 'N. Virginia, US', 38.13, -78.45),
  (2, 'ap-northeast-1', 'Tokyo, JP', 35.68, 139.65),
  (2, 'eu-west-1', 'Dublin, IE', 53.41, -8.24),
  (3, 'us-central1', 'Iowa, US', 41.26, -95.86),
  (3, 'asia-southeast1', 'Singapore, SG', 1.35, 103.82),
  (4, 'eastasia', 'Hong Kong, HK', 22.32, 114.17);

-- cluster 2 (khu-suwon-01) is the only is_live=true cluster - the sole target of real
-- job admission (services/jobs.py _load_live_cluster). Everything else is CSP-map
-- decoration with no effect on scheduling.
INSERT INTO cluster (region_id, name, status, is_live, cost_per_hour) VALUES
  (1, 'khu-cluster-01', 'active', false, 0),
  (2, 'khu-suwon-01', 'active', true, 0),
  (3, 'khu-daejeon-01', 'standby', false, 0),
  (4, 'khu-busan-01', 'active', false, 0),
  (5, 'aws-use1-a', 'active', false, 123.00),
  (6, 'aws-apne1-a', 'active', false, 98.50),
  (7, 'aws-euw1-a', 'standby', false, 0),
  (8, 'gcp-usc1-a', 'active', false, 110.00),
  (9, 'gcp-sea1-a', 'active', false, 105.00),
  (10, 'azure-eas-a', 'active', false, 99.00);

-- node.purpose (train/infer) only matters functionally on the live cluster (id 2) -
-- it's what admission filters candidate nodes by. Everywhere else it's just realistic
-- variety for the CSP infra pages. Live cluster pool: node ids 4-14, split so every
-- resource_tier below has real matching inventory:
--   train: A100 x3 (4/5/7), H100 x3 (10/11 + 42 below), A6000 x2 (12 + 43 below),
--          NPU/RNGD x2 (6 + 41 below)
--   infer: NPU/RNGD x1 (8), PIM/AiM x1 (9), B200 x4 (13/14 + 39/40 below)
-- train tier 1 (H100x2+NPUx1) and tier 3 (A6000x1) used to have exactly as many
-- matching nodes as they need, so admission had zero real choice - every pick used
-- the same fixed node(s), which made the scheduler look static/rigged rather than
-- actually scheduling anything. Adding one extra NPU/H100/A6000 node each (41/42/43)
-- gives both tiers a real candidate pool to choose from via the predicted-util/power
-- ranking (see _pick_free_nodes_for_tier), without touching either tier's requirement
-- definition.
-- suwon-srv-12/13 (ids 39/40) and 14/15/16 (ids 41/42/43) are appended at the end of
-- this INSERT (rather than in suwon-srv-* numeric order) purely so their id and every
-- downstream id in the file don't shift - keeps every other node/accelerator/
-- metric-profile id stable. Same reasoning applies to their accelerator/metric-profile
-- rows further down.
INSERT INTO node (cluster_id, name, purpose) VALUES
  (1, 'srv-01', 'train'),
  (1, 'srv-02', 'infer'),
  (1, 'srv-03', 'train'),
  (2, 'suwon-srv-01', 'train'),
  (2, 'suwon-srv-02', 'train'),
  (2, 'suwon-srv-03', 'train'),
  (2, 'suwon-srv-04', 'train'),
  (2, 'suwon-srv-05', 'infer'),
  (2, 'suwon-srv-06', 'infer'),
  (2, 'suwon-srv-07', 'train'),
  (2, 'suwon-srv-08', 'train'),
  (2, 'suwon-srv-09', 'train'),
  (2, 'suwon-srv-10', 'infer'),
  (2, 'suwon-srv-11', 'infer'),
  (3, 'daejeon-srv-01', 'train'),
  (3, 'daejeon-srv-02', 'infer'),
  (3, 'daejeon-srv-03', 'train'),
  (4, 'busan-srv-01', 'train'),
  (4, 'busan-srv-02', 'infer'),
  (4, 'busan-srv-03', 'train'),
  (5, 'use1-node-a', 'train'),
  (5, 'use1-node-b', 'infer'),
  (5, 'use1-node-c', 'train'),
  (6, 'apne1-node-a', 'train'),
  (6, 'apne1-node-b', 'infer'),
  (6, 'apne1-node-c', 'train'),
  (7, 'euw1-node-a', 'train'),
  (7, 'euw1-node-b', 'infer'),
  (7, 'euw1-node-c', 'train'),
  (8, 'usc1-node-a', 'train'),
  (8, 'usc1-node-b', 'infer'),
  (8, 'usc1-node-c', 'train'),
  (9, 'sea1-node-a', 'train'),
  (9, 'sea1-node-b', 'infer'),
  (9, 'sea1-node-c', 'train'),
  (10, 'eas-node-a', 'train'),
  (10, 'eas-node-b', 'infer'),
  (10, 'eas-node-c', 'train'),
  (2, 'suwon-srv-12', 'infer'),
  (2, 'suwon-srv-13', 'infer'),
  (2, 'suwon-srv-14', 'train'),
  (2, 'suwon-srv-15', 'train'),
  (2, 'suwon-srv-16', 'train');

-- id 1=NVIDIA A100, 2=NVIDIA H100, 3=Furiosa RNGD, 4=SK hynix AiM, 5=NVIDIA A6000,
-- 6=NVIDIA B200, 7=NVIDIA L40S. accelerator.accelerator_model_id and
-- resource_tier_requirement.accelerator_model_id both reference this table by id, so
-- there's no risk of the two sides spelling a model name differently.
INSERT INTO accelerator_model (name) VALUES
  ('NVIDIA A100'),
  ('NVIDIA H100'),
  ('Furiosa RNGD'),
  ('SK hynix AiM'),
  ('NVIDIA A6000'),
  ('NVIDIA B200'),
  ('NVIDIA L40S');

-- live cluster (node ids 4-14) - exact composition resource_tier_requirement depends on.
INSERT INTO accelerator (node_id, kind, accelerator_model_id, tflops, memory_gb, memory_type, tdp_w) VALUES
  (4, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (4, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (5, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (6, 'NPU', 3, 256, 48, 'GDDR6', 180),
  (7, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (8, 'NPU', 3, 256, 48, 'GDDR6', 180),
  (9, 'PIM', 4, 128, 32, 'HBM-PIM', 150),
  (10, 'GPU', 2, 989, 80, 'HBM3', 700),
  (11, 'GPU', 2, 989, 80, 'HBM3', 700),
  (12, 'GPU', 5, 155, 48, 'GDDR6', 300),
  (13, 'GPU', 6, 2250, 192, 'HBM3e', 1000),
  (14, 'GPU', 6, 2250, 192, 'HBM3e', 1000);

-- everywhere else: decorative, one accelerator per node, cycled across models for
-- visual variety on the CSP infra pages. train-purpose nodes get GPU-family models,
-- infer-purpose nodes get NPU/PIM/B200 for a bit of kind diversity.
INSERT INTO accelerator (node_id, kind, accelerator_model_id, tflops, memory_gb, memory_type, tdp_w) VALUES
  (1, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (3, 'GPU', 2, 989, 80, 'HBM3', 700),
  (15, 'GPU', 7, 733, 48, 'GDDR6', 350),
  (17, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (18, 'GPU', 2, 989, 80, 'HBM3', 700),
  (20, 'GPU', 7, 733, 48, 'GDDR6', 350),
  (21, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (23, 'GPU', 2, 989, 80, 'HBM3', 700),
  (24, 'GPU', 7, 733, 48, 'GDDR6', 350),
  (26, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (27, 'GPU', 2, 989, 80, 'HBM3', 700),
  (29, 'GPU', 7, 733, 48, 'GDDR6', 350),
  (30, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (32, 'GPU', 2, 989, 80, 'HBM3', 700),
  (33, 'GPU', 7, 733, 48, 'GDDR6', 350),
  (35, 'GPU', 1, 312, 80, 'HBM2e', 400),
  (36, 'GPU', 2, 989, 80, 'HBM3', 700),
  (38, 'GPU', 7, 733, 48, 'GDDR6', 350),
  (2, 'NPU', 3, 256, 48, 'GDDR6', 180),
  (16, 'PIM', 4, 128, 32, 'HBM-PIM', 150),
  (19, 'GPU', 6, 2250, 192, 'HBM3e', 1000),
  (22, 'NPU', 3, 256, 48, 'GDDR6', 180),
  (25, 'PIM', 4, 128, 32, 'HBM-PIM', 150),
  (28, 'GPU', 6, 2250, 192, 'HBM3e', 1000),
  (31, 'NPU', 3, 256, 48, 'GDDR6', 180),
  (34, 'PIM', 4, 128, 32, 'HBM-PIM', 150),
  (37, 'GPU', 6, 2250, 192, 'HBM3e', 1000);

-- suwon-srv-12/13 (node ids 39/40) - 2 more live-cluster B200 infer nodes, same spec
-- as the existing pair (13/14). Appended here (own statement, after every other
-- accelerator row) so these land on fresh trailing ids 40/41 instead of shifting the
-- decorative block's ids 13-39 that accelerator_metric_profile below already pins by id.
INSERT INTO accelerator (node_id, kind, accelerator_model_id, tflops, memory_gb, memory_type, tdp_w) VALUES
  (39, 'GPU', 6, 2250, 192, 'HBM3e', 1000),
  (40, 'GPU', 6, 2250, 192, 'HBM3e', 1000);

-- suwon-srv-14/15/16 (node ids 41/42/43) - one extra NPU/H100/A6000 train node each,
-- same spec as their existing sibling (node 6/10/12 respectively). Gives train tier 1
-- and tier 3 a real candidate pool instead of exactly-one-fit (see comment above the
-- node INSERT). Own statement/trailing ids for the same reason as the block above.
INSERT INTO accelerator (node_id, kind, accelerator_model_id, tflops, memory_gb, memory_type, tdp_w) VALUES
  (41, 'NPU', 3, 256, 48, 'GDDR6', 180),
  (42, 'GPU', 2, 989, 80, 'HBM3', 700),
  (43, 'GPU', 5, 155, 48, 'GDDR6', 300);

-- ------------------------------------------------------------
-- metric profiles: value(t) = baseline + amplitude * sin(2*pi*t / period_sec)
-- t = current unix epoch seconds (app/services/infra.py _evaluate uses time.time() -
-- not job-relative, not wall-clock-of-day). Scale convention: unit='pct' always means
-- 0-100 (utilization/util/cpu/mem/sla alike), never 0-1. Non-pct units (kW, W, C) are
-- already on their natural absolute scale.
-- ------------------------------------------------------------
-- cluster 2 (khu-suwon-01) is the only is_live cluster - same "real occasional load"
-- vs "永idle" reasoning as the node-level comment below applies here too.
INSERT INTO cluster_metric_profile (cluster_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (1, 'utilization', 10, 3, 60, 'pct'), (1, 'power', 12, 3, 90, 'kW'), (1, 'sla', 99.0, 0.5, 120, 'pct'),
  (2, 'utilization', 65, 10, 60, 'pct'), (2, 'power', 70, 9, 90, 'kW'), (2, 'sla', 99.0, 0.4, 120, 'pct'),
  (3, 'utilization', 9, 3, 60, 'pct'), (3, 'power', 10, 3, 90, 'kW'), (3, 'sla', 99.2, 0.3, 120, 'pct'),
  (4, 'utilization', 8, 3, 55, 'pct'), (4, 'power', 9, 2, 85, 'kW'), (4, 'sla', 98.8, 0.5, 115, 'pct'),
  (5, 'utilization', 12, 3, 50, 'pct'), (5, 'power', 18, 4, 70, 'kW'), (5, 'sla', 99.5, 0.2, 130, 'pct'),
  (6, 'utilization', 11, 3, 55, 'pct'), (6, 'power', 15, 3, 75, 'kW'), (6, 'sla', 99.1, 0.3, 125, 'pct'),
  (7, 'utilization', 7, 2, 60, 'pct'), (7, 'power', 9, 2, 90, 'kW'), (7, 'sla', 98.0, 0.6, 110, 'pct'),
  (8, 'utilization', 13, 3, 50, 'pct'), (8, 'power', 19, 4, 65, 'kW'), (8, 'sla', 99.4, 0.25, 130, 'pct'),
  (9, 'utilization', 10, 3, 55, 'pct'), (9, 'power', 14, 3, 80, 'kW'), (9, 'sla', 99.0, 0.35, 120, 'pct'),
  (10, 'utilization', 9, 3, 55, 'pct'), (10, 'power', 11, 2, 85, 'kW'), (10, 'sla', 98.9, 0.4, 118, 'pct');

-- 학습/추론 전용 지표. 스케줄러 페이지 두 섹션(학습 클러스터/추론 클러스터)에서만 쓰는
-- 클러스터 단위 값이라, 실제 job이 도는 유일한 라이브 클러스터(2)에만 의미가 있다.
-- metric_type 이름 자체가 학습/추론 어느 한쪽에서만 쓰이므로(예: jct는 학습 섹션만
-- 필터링해서 읽음) 같은 cluster_id에 같이 둬도 섞이지 않는다.
INSERT INTO cluster_metric_profile (cluster_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (2, 'throughput', 850, 120, 75, 'samples/s'),
  (2, 'jct', 42, 8, 100, 's'),
  (2, 'goodput', 91, 4, 80, 'pct'),
  (2, 'ttft', 180, 35, 50, 'ms'),
  (2, 'tpot', 22, 5, 45, 'ms'),
  -- slo_violation은 다른 지표처럼 사인파로 오르내리면 안 되는 누적 카운터라, 프론트가
  -- baseline만 "시간당 위반 건수"로 읽고 amplitude/period_sec은 안 쓴다 (그래도
  -- NOT NULL이라 값은 채워야 함).
  (2, 'slo_violation', 8, 2, 70, 'count');

-- nodes 4-14 (live cluster) see real occasional load (demo submissions + the
-- auto-filler mechanism), so a moderate 30-60% util baseline is plausible. Every
-- other node here NEVER receives a real job (admission only ever targets the live
-- cluster) - they'd sit idle forever, so their util/power baselines are deliberately
-- low (idle draw, not load) instead of matching the same 30-60% range.
-- cpu는 4-14(라이브)만 채운다 - GPU util보다 낮은, 그럴듯한 비율(대략 0.6~0.7배)로.
-- 다른 노드들엔 원래도 cpu가 없었다(스케줄러 페이지 지표에만 필요해서 여기서 추가).
INSERT INTO node_metric_profile (node_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (1, 'util', 8, 3, 45, 'pct'), (1, 'cpu', 6, 2, 40, 'pct'), (1, 'mem', 12, 3, 55, 'pct'), (1, 'temp', 34, 2, 50, 'C'), (1, 'power', 75, 15, 42, 'W'),
  (2, 'util', 6, 2, 45, 'pct'), (2, 'temp', 32, 2, 50, 'C'), (2, 'power', 30, 8, 45, 'W'),
  (3, 'util', 10, 3, 45, 'pct'), (3, 'temp', 36, 2, 50, 'C'), (3, 'power', 120, 25, 40, 'W'),
  (4, 'util', 55, 12, 40, 'pct'), (4, 'cpu', 35, 8, 38, 'pct'), (4, 'temp', 52, 4, 50, 'C'), (4, 'power', 560, 130, 42, 'W'),
  (5, 'util', 42, 10, 45, 'pct'), (5, 'cpu', 28, 6, 43, 'pct'), (5, 'temp', 47, 3, 50, 'C'), (5, 'power', 300, 55, 46, 'W'),
  (6, 'util', 38, 9, 45, 'pct'), (6, 'cpu', 25, 6, 43, 'pct'), (6, 'temp', 46, 3, 50, 'C'), (6, 'power', 160, 30, 35, 'W'),
  (7, 'util', 45, 13, 42, 'pct'), (7, 'cpu', 30, 8, 40, 'pct'), (7, 'temp', 50, 3, 46, 'C'), (7, 'power', 310, 58, 44, 'W'),
  (8, 'util', 38, 11, 41, 'pct'), (8, 'cpu', 26, 7, 39, 'pct'), (8, 'temp', 47, 3, 44, 'C'), (8, 'power', 155, 28, 36, 'W'),
  (9, 'util', 32, 9, 43, 'pct'), (9, 'cpu', 22, 6, 41, 'pct'), (9, 'temp', 44, 3, 47, 'C'), (9, 'power', 120, 22, 38, 'W'),
  (10, 'util', 58, 14, 38, 'pct'), (10, 'cpu', 38, 9, 36, 'pct'), (10, 'temp', 60, 4, 40, 'C'), (10, 'power', 960, 185, 34, 'W'),
  (11, 'util', 54, 13, 39, 'pct'), (11, 'cpu', 35, 8, 37, 'pct'), (11, 'temp', 58, 4, 41, 'C'), (11, 'power', 940, 180, 35, 'W'),
  (12, 'util', 46, 12, 44, 'pct'), (12, 'cpu', 30, 7, 42, 'pct'), (12, 'temp', 52, 3, 47, 'C'), (12, 'power', 290, 50, 42, 'W'),
  (13, 'util', 62, 15, 30, 'pct'), (13, 'cpu', 40, 10, 29, 'pct'), (13, 'temp', 65, 5, 32, 'C'), (13, 'power', 1450, 260, 24, 'W'),
  (14, 'util', 57, 14, 31, 'pct'), (14, 'cpu', 37, 9, 30, 'pct'), (14, 'temp', 63, 5, 33, 'C'), (14, 'power', 1420, 255, 25, 'W'),
  (15, 'util', 9, 3, 45, 'pct'), (15, 'temp', 35, 2, 48, 'C'), (15, 'power', 65, 15, 38, 'W'),
  (16, 'util', 5, 2, 47, 'pct'), (16, 'temp', 30, 2, 49, 'C'), (16, 'power', 22, 6, 39, 'W'),
  (17, 'util', 8, 3, 46, 'pct'), (17, 'temp', 34, 2, 48, 'C'), (17, 'power', 78, 16, 37, 'W'),
  (18, 'util', 11, 3, 41, 'pct'), (18, 'temp', 37, 2, 43, 'C'), (18, 'power', 130, 26, 33, 'W'),
  (19, 'util', 7, 2, 44, 'pct'), (19, 'temp', 33, 2, 46, 'C'), (19, 'power', 180, 35, 27, 'W'),
  (20, 'util', 9, 3, 46, 'pct'), (20, 'temp', 35, 2, 47, 'C'), (20, 'power', 68, 14, 40, 'W'),
  (21, 'util', 10, 3, 36, 'pct'), (21, 'temp', 36, 2, 38, 'C'), (21, 'power', 82, 17, 36, 'W'),
  (22, 'util', 6, 2, 40, 'pct'), (22, 'temp', 31, 2, 44, 'C'), (22, 'power', 28, 7, 37, 'W'),
  (23, 'util', 12, 3, 38, 'pct'), (23, 'temp', 38, 2, 39, 'C'), (23, 'power', 135, 27, 31, 'W'),
  (24, 'util', 8, 3, 43, 'pct'), (24, 'temp', 34, 2, 46, 'C'), (24, 'power', 70, 15, 38, 'W'),
  (25, 'util', 5, 2, 45, 'pct'), (25, 'temp', 30, 2, 48, 'C'), (25, 'power', 24, 6, 40, 'W'),
  (26, 'util', 9, 3, 41, 'pct'), (26, 'temp', 35, 2, 45, 'C'), (26, 'power', 80, 16, 35, 'W'),
  (27, 'util', 11, 3, 44, 'pct'), (27, 'temp', 37, 2, 47, 'C'), (27, 'power', 128, 25, 30, 'W'),
  (28, 'util', 7, 2, 45, 'pct'), (28, 'temp', 33, 2, 48, 'C'), (28, 'power', 175, 34, 28, 'W'),
  (29, 'util', 9, 3, 43, 'pct'), (29, 'temp', 34, 2, 46, 'C'), (29, 'power', 66, 14, 39, 'W'),
  (30, 'util', 10, 3, 37, 'pct'), (30, 'temp', 36, 2, 40, 'C'), (30, 'power', 84, 17, 36, 'W'),
  (31, 'util', 6, 2, 42, 'pct'), (31, 'temp', 31, 2, 45, 'C'), (31, 'power', 27, 7, 38, 'W'),
  (32, 'util', 11, 3, 40, 'pct'), (32, 'temp', 37, 2, 40, 'C'), (32, 'power', 132, 26, 31, 'W'),
  (33, 'util', 8, 3, 44, 'pct'), (33, 'temp', 34, 2, 47, 'C'), (33, 'power', 67, 14, 38, 'W'),
  (34, 'util', 5, 2, 46, 'pct'), (34, 'temp', 30, 2, 49, 'C'), (34, 'power', 23, 6, 41, 'W'),
  (35, 'util', 9, 3, 41, 'pct'), (35, 'temp', 35, 2, 45, 'C'), (35, 'power', 79, 16, 36, 'W'),
  (36, 'util', 10, 3, 43, 'pct'), (36, 'temp', 36, 2, 47, 'C'), (36, 'power', 126, 25, 31, 'W'),
  (37, 'util', 7, 2, 45, 'pct'), (37, 'temp', 32, 2, 48, 'C'), (37, 'power', 172, 33, 28, 'W'),
  (38, 'util', 8, 3, 42, 'pct'), (38, 'temp', 34, 2, 46, 'C'), (38, 'power', 65, 14, 39, 'W'),
  -- suwon-srv-12/13 (39/40) - same B200 live-cluster profile shape as 13/14 above.
  (39, 'util', 60, 15, 31, 'pct'), (39, 'cpu', 39, 9, 30, 'pct'), (39, 'temp', 64, 5, 33, 'C'), (39, 'power', 1440, 258, 25, 'W'),
  (40, 'util', 56, 13, 32, 'pct'), (40, 'cpu', 36, 9, 31, 'pct'), (40, 'temp', 62, 4, 34, 'C'), (40, 'power', 1410, 250, 26, 'W'),
  -- suwon-srv-14/15/16 (41/42/43) - same profile shape as their sibling node (6/10/12)
  -- so the extra candidate looks like a plausible twin, not an outlier.
  (41, 'util', 35, 8, 44, 'pct'), (41, 'cpu', 23, 6, 42, 'pct'), (41, 'temp', 45, 3, 49, 'C'), (41, 'power', 155, 28, 36, 'W'),
  (42, 'util', 55, 13, 39, 'pct'), (42, 'cpu', 36, 8, 37, 'pct'), (42, 'temp', 59, 4, 42, 'C'), (42, 'power', 940, 178, 35, 'W'),
  (43, 'util', 44, 11, 43, 'pct'), (43, 'cpu', 29, 7, 41, 'pct'), (43, 'temp', 51, 3, 46, 'C'), (43, 'power', 285, 48, 41, 'W');

-- accelerator_metric_profile: 'util' on every accelerator (kept light - 39 accelerators
-- would be a lot of rows for full coverage), plus mem/power on accelerator 1 as a
-- fuller example (matches what GET /accelerators/{id} can show).
INSERT INTO accelerator_metric_profile (accelerator_id, metric_type, baseline, amplitude, period_sec, unit) VALUES
  (1, 'util', 50, 20, 30, 'pct'), (1, 'mem', 70, 10, 35, 'pct'), (1, 'power', 280, 40, 25, 'W'),
  (2, 'util', 48, 18, 31, 'pct'),
  (3, 'util', 45, 15, 30, 'pct'),
  (4, 'util', 55, 18, 25, 'pct'),
  (5, 'util', 42, 11, 33, 'pct'),
  (6, 'util', 50, 12, 32, 'pct'),
  (7, 'util', 38, 10, 42, 'pct'),
  (8, 'util', 60, 20, 22, 'pct'),
  (9, 'util', 58, 19, 24, 'pct'),
  (10, 'util', 48, 14, 30, 'pct'),
  (11, 'util', 62, 20, 20, 'pct'),
  (12, 'util', 55, 16, 28, 'pct'),
  -- accelerators 13-39 sit on non-live nodes (never get a real job - see the node
  -- comment above), so idle-range util instead of the live cluster's 38-62%.
  (13, 'util', 9, 3, 35, 'pct'),
  (14, 'util', 7, 2, 31, 'pct'),
  (15, 'util', 8, 3, 32, 'pct'),
  (16, 'util', 6, 2, 34, 'pct'),
  (17, 'util', 9, 3, 31, 'pct'),
  (18, 'util', 7, 2, 36, 'pct'),
  (19, 'util', 5, 2, 28, 'pct'),
  (20, 'util', 8, 3, 33, 'pct'),
  (21, 'util', 9, 3, 30, 'pct'),
  (22, 'util', 6, 2, 32, 'pct'),
  (23, 'util', 10, 3, 29, 'pct'),
  (24, 'util', 8, 3, 31, 'pct'),
  (25, 'util', 6, 2, 30, 'pct'),
  (26, 'util', 8, 3, 34, 'pct'),
  (27, 'util', 10, 3, 27, 'pct'),
  (28, 'util', 6, 2, 34, 'pct'),
  (29, 'util', 9, 3, 30, 'pct'),
  (30, 'util', 8, 3, 31, 'pct'),
  (31, 'util', 5, 2, 36, 'pct'),
  (32, 'util', 4, 2, 37, 'pct'),
  (33, 'util', 11, 3, 19, 'pct'),
  (34, 'util', 4, 2, 38, 'pct'),
  (35, 'util', 4, 2, 39, 'pct'),
  (36, 'util', 10, 3, 20, 'pct'),
  (37, 'util', 5, 2, 38, 'pct'),
  (38, 'util', 4, 2, 39, 'pct'),
  (39, 'util', 9, 3, 21, 'pct'),
  -- suwon-srv-12/13's B200s (accelerator ids 40/41, node ids 39/40) - live-cluster range.
  (40, 'util', 52, 15, 30, 'pct'),
  (41, 'util', 58, 17, 29, 'pct'),
  -- suwon-srv-14/15/16's NPU/H100/A6000 (accelerator ids 42/43/44, node ids 41/42/43).
  (42, 'util', 33, 9, 26, 'pct'),
  (43, 'util', 53, 15, 22, 'pct'),
  (44, 'util', 42, 12, 27, 'pct');

-- distributed links: domestic pairs draw in Korea-mode view. (1, 5, true) is
-- domestic(서울, cluster 1) <-> overseas(aws-use1-a, cluster 5) so it also shows on
-- the world map (first screen) as a line from the KR hub to that region.
INSERT INTO cluster_distributed_link (cluster_a_id, cluster_b_id, active) VALUES
  (1, 2, true),
  (2, 3, true),
  (1, 4, false),
  (1, 5, true);

-- kept off the live cluster (node ids 4-14) on purpose - those nodes are actually
-- admission-eligible, so a red alert badge on one mid-demo would look like something's
-- broken right where a job could otherwise land.
INSERT INTO node_alert (node_id, severity, message) VALUES
  (17, 'sla', 'p99 지연 42ms (목표 40ms 초과)'),
  (21, 'physical', '온도 78°C (임계치 초과)'),
  (31, 'sla', 'p99 지연 55ms (목표 50ms 초과)'),
  (2, 'physical', '팬 속도 이상 감지');

-- ============================================================
-- model / model_layer / model_layer_edge / dataset
-- ============================================================
-- all 12 get real layer graphs (demo presenter can't predict which model gets picked
-- live, so every model needs something to show under "모델 분석"). Each graph reflects
-- that model's actual published architecture, including its real branch/merge points
-- (embedding fan-in, attention/FFN residuals, ResNet skip connections, U-Net skips,
-- FPN-PAN neck, dual encoder towers, ...) rather than a flat chain - buildGraphColumns
-- on the frontend lays out same-depth layers side by side automatically from these
-- edges, no separate "row" concept needed here.
INSERT INTO model (name, type) VALUES
  ('BERT-base', 'nlp'),
  ('GPT-2', 'nlp'),
  ('RoBERTa-large', 'nlp'),
  ('T5-base', 'nlp'),
  ('LLaMA-7B', 'nlp'),
  ('ResNet-50', 'cv'),
  ('ViT-Base', 'cv'),
  ('YOLOv8', 'cv'),
  ('EfficientNet-B4', 'cv'),
  ('Stable-Diffusion-v2', 'cv'),
  ('Whisper-base', 'audio'),
  ('CLIP-ViT', 'multimodal');

-- id ranges (RESTART IDENTITY above means this is exact): 1 BERT-base 1-11,
-- 2 GPT-2 12-23, 3 RoBERTa-large 24-32, 4 T5-base 33-47, 5 LLaMA-7B 48-57,
-- 6 ResNet-50 58-72, 7 ViT-Base 73-83, 8 YOLOv8 84-100, 9 EfficientNet-B4 101-112,
-- 10 Stable-Diffusion-v2 113-123, 11 Whisper-base 124-142, 12 CLIP-ViT 143-153
INSERT INTO model_layer (model_id, op_name, shape, gflops, mem_mb, characteristic) VALUES
  -- 1 BERT-base: 3-way embedding fan-in, post-LN encoder block (attn + FFN residuals), pooler
  (1, 'Token Embedding', '512x768', 2.1, 3.1, 'memory_bound'),
  (1, 'Position Embedding', '512x768', 0.1, 1.6, 'memory_bound'),
  (1, 'Segment Embedding', '512x768', 0.05, 1.6, 'memory_bound'),
  (1, 'Embedding Add & LayerNorm', '512x768', 0.3, 3.1, 'memory_bound'),
  (1, 'Multi-Head Self-Attention', '512x768', 12.6, 6.2, 'compute_bound'),
  (1, 'Attention Add & LayerNorm', '512x768', 0.3, 3.1, 'memory_bound'),
  (1, 'Feed-Forward (GELU)', '512x3072', 25.8, 14.7, 'compute_bound'),
  (1, 'FFN Add & LayerNorm', '512x768', 0.3, 3.1, 'memory_bound'),
  (1, 'Transformer Blocks 2-12 (반복)', '512x768', 386.1, 220.5, 'balanced'),
  (1, 'Pooler (CLS → Tanh)', '1x768', 0.6, 2.4, 'memory_bound'),
  (1, 'Classification Head', '1x2', 0.001, 0.1, 'memory_bound'),

  -- 2 GPT-2: pre-LN decoder-only, causal self-attention, tied-weight LM head
  (2, 'Token Embedding', '1024x768', 2.4, 3.5, 'memory_bound'),
  (2, 'Position Embedding', '1024x768', 0.1, 1.8, 'memory_bound'),
  (2, 'Embedding Add', '1024x768', 0.2, 3.5, 'memory_bound'),
  (2, 'LayerNorm (pre-attn)', '1024x768', 0.1, 3.5, 'memory_bound'),
  (2, 'Masked Self-Attention', '1024x768', 14.2, 7.4, 'compute_bound'),
  (2, 'Attention Residual Add', '1024x768', 0.2, 3.5, 'memory_bound'),
  (2, 'LayerNorm (pre-FFN)', '1024x768', 0.1, 3.5, 'memory_bound'),
  (2, 'Feed-Forward (GELU)', '1024x3072', 28.9, 16.8, 'compute_bound'),
  (2, 'FFN Residual Add', '1024x768', 0.2, 3.5, 'memory_bound'),
  (2, 'Decoder Blocks 2-12 (반복)', '1024x768', 432.6, 247.2, 'balanced'),
  (2, 'Final LayerNorm', '1024x768', 0.1, 3.5, 'memory_bound'),
  (2, 'LM Head (tied weights)', '1024x50257', 39.6, 18.4, 'compute_bound'),

  -- 3 RoBERTa-large: BERT-style block but no segment embedding / NSP (real RoBERTa
  -- detail - only token+position fan-in), MLM head only
  (3, 'Token Embedding', '512x1024', 2.8, 4.2, 'memory_bound'),
  (3, 'Position Embedding', '512x1024', 0.1, 2.1, 'memory_bound'),
  (3, 'Embedding Add & LayerNorm', '512x1024', 0.3, 4.2, 'memory_bound'),
  (3, 'Multi-Head Self-Attention', '512x1024', 22.4, 11.3, 'compute_bound'),
  (3, 'Attention Add & LayerNorm', '512x1024', 0.3, 4.2, 'memory_bound'),
  (3, 'Feed-Forward (GELU)', '512x4096', 45.9, 26.1, 'compute_bound'),
  (3, 'FFN Add & LayerNorm', '512x1024', 0.3, 4.2, 'memory_bound'),
  (3, 'Transformer Blocks 2-24 (반복)', '512x1024', 1562.8, 802.4, 'balanced'),
  (3, 'MLM Head', '512x50265', 52.3, 24.6, 'compute_bound'),

  -- 4 T5-base: real encoder-decoder, relative-position bias (no separate position
  -- embedding layer), decoder cross-attention merges with encoder output
  (4, 'Shared Token Embedding', '512x768', 2.1, 3.4, 'memory_bound'),
  (4, 'Encoder Self-Attention (rel. pos bias)', '512x768', 12.9, 6.4, 'compute_bound'),
  (4, 'Encoder Attn Residual Add', '512x768', 0.3, 3.4, 'memory_bound'),
  (4, 'Encoder Gated-GELU FFN', '512x2048', 24.6, 12.9, 'compute_bound'),
  (4, 'Encoder FFN Residual Add', '512x768', 0.3, 3.4, 'memory_bound'),
  (4, 'Encoder Layers 2-12 (반복)', '512x768', 372.4, 205.6, 'balanced'),
  (4, 'Decoder Token Embedding', '512x768', 2.1, 3.4, 'memory_bound'),
  (4, 'Decoder Masked Self-Attention', '512x768', 12.9, 6.4, 'compute_bound'),
  (4, 'Decoder Self-Attn Residual Add', '512x768', 0.3, 3.4, 'memory_bound'),
  (4, 'Decoder Cross-Attention', '512x768', 12.9, 6.4, 'compute_bound'),
  (4, 'Decoder Cross-Attn Residual Add', '512x768', 0.3, 3.4, 'memory_bound'),
  (4, 'Decoder Gated-GELU FFN', '512x2048', 24.6, 12.9, 'compute_bound'),
  (4, 'Decoder FFN Residual Add', '512x768', 0.3, 3.4, 'memory_bound'),
  (4, 'Decoder Layers 2-12 (반복)', '512x768', 446.8, 246.7, 'balanced'),
  (4, 'LM Head', '512x32128', 33.4, 15.8, 'compute_bound'),

  -- 5 LLaMA-7B: RMSNorm (not LayerNorm), RoPE folded into attention, SwiGLU FFN
  (5, 'Token Embedding', '2048x4096', 8.4, 12.6, 'memory_bound'),
  (5, 'RMSNorm (pre-attn)', '2048x4096', 0.2, 12.6, 'memory_bound'),
  (5, 'Self-Attention (RoPE, causal)', '2048x4096', 68.2, 34.8, 'compute_bound'),
  (5, 'Attention Residual Add', '2048x4096', 0.4, 12.6, 'memory_bound'),
  (5, 'RMSNorm (pre-FFN)', '2048x4096', 0.2, 12.6, 'memory_bound'),
  (5, 'SwiGLU FFN', '2048x11008', 184.6, 92.4, 'compute_bound'),
  (5, 'FFN Residual Add', '2048x4096', 0.4, 12.6, 'memory_bound'),
  (5, 'Decoder Blocks 2-32 (반복)', '2048x4096', 7862.4, 3924.8, 'balanced'),
  (5, 'Final RMSNorm', '2048x4096', 0.2, 12.6, 'memory_bound'),
  (5, 'LM Head', '2048x32000', 268.4, 128.6, 'compute_bound'),

  -- 6 ResNet-50: 4 residual stages, each a real conv-path/skip-path branch that merges
  (6, 'Stem (Conv7x7 + MaxPool)', '224x224x64', 5.4, 2.1, 'compute_bound'),
  (6, 'Stage1 Conv Path', '56x56x256', 10.8, 3.6, 'compute_bound'),
  (6, 'Stage1 Skip (1x1 Conv)', '56x56x256', 1.2, 1.4, 'memory_bound'),
  (6, 'Stage1 Add', '56x56x256', 0.1, 3.6, 'memory_bound'),
  (6, 'Stage2 Conv Path', '28x28x512', 12.6, 4.2, 'compute_bound'),
  (6, 'Stage2 Skip (1x1 Conv, stride2)', '28x28x512', 1.6, 1.6, 'memory_bound'),
  (6, 'Stage2 Add', '28x28x512', 0.1, 4.2, 'memory_bound'),
  (6, 'Stage3 Conv Path', '14x14x1024', 12.6, 4.2, 'compute_bound'),
  (6, 'Stage3 Skip (1x1 Conv, stride2)', '14x14x1024', 1.6, 1.6, 'memory_bound'),
  (6, 'Stage3 Add', '14x14x1024', 0.1, 4.2, 'memory_bound'),
  (6, 'Stage4 Conv Path', '7x7x2048', 8.4, 2.8, 'compute_bound'),
  (6, 'Stage4 Skip (1x1 Conv, stride2)', '7x7x2048', 1.1, 1.1, 'memory_bound'),
  (6, 'Stage4 Add', '7x7x2048', 0.1, 2.8, 'memory_bound'),
  (6, 'Global Avg Pool', '1x1x2048', 0.02, 0.3, 'memory_bound'),
  (6, 'FC Classifier', '1x1000', 0.02, 0.4, 'memory_bound'),

  -- 7 ViT-Base: patch embedding + CLS token + position embedding all fan into the
  -- encoder input, then a BERT-style post-LN block
  (7, 'Patch Embedding (Conv16x16, stride16)', '196x768', 4.6, 4.8, 'compute_bound'),
  (7, 'CLS Token', '1x768', 0.001, 0.1, 'memory_bound'),
  (7, 'Position Embedding', '197x768', 0.1, 1.5, 'memory_bound'),
  (7, 'Embedding Concat & Add', '197x768', 0.2, 4.8, 'memory_bound'),
  (7, 'Multi-Head Self-Attention', '197x768', 9.8, 5.4, 'compute_bound'),
  (7, 'Attention Add & LayerNorm', '197x768', 0.2, 4.8, 'memory_bound'),
  (7, 'MLP (GELU)', '197x3072', 19.6, 11.2, 'compute_bound'),
  (7, 'MLP Add & LayerNorm', '197x768', 0.2, 4.8, 'memory_bound'),
  (7, 'Transformer Blocks 2-12 (반복)', '197x768', 316.8, 179.4, 'balanced'),
  (7, 'Final LayerNorm', '197x768', 0.1, 4.8, 'memory_bound'),
  (7, 'MLP Head (CLS → classes)', '1x1000', 0.8, 3.1, 'memory_bound'),

  -- 8 YOLOv8: backbone feeds a real FPN-PAN neck (top-down upsample/concat then
  -- bottom-up downsample/concat) feeding 3 scale-specific detection heads
  (8, 'Stem Conv', '640x640x32', 3.7, 1.8, 'compute_bound'),
  (8, 'Backbone Stage1', '320x320x64', 8.4, 3.2, 'compute_bound'),
  (8, 'Backbone Stage2 (P3)', '160x160x128', 14.6, 5.6, 'compute_bound'),
  (8, 'Backbone Stage3 (P4)', '80x80x256', 18.2, 6.8, 'compute_bound'),
  (8, 'Backbone Stage4 (P5)', '40x40x512', 16.4, 6.2, 'compute_bound'),
  (8, 'SPPF', '40x40x512', 3.8, 2.4, 'compute_bound'),
  (8, 'Neck Upsample P5→P4', '80x80x256', 0.4, 1.6, 'memory_bound'),
  (8, 'Neck Concat P4', '80x80x512', 6.2, 3.8, 'compute_bound'),
  (8, 'Neck Upsample P4→P3', '160x160x128', 0.4, 1.6, 'memory_bound'),
  (8, 'Neck Concat P3', '160x160x256', 6.8, 4.1, 'compute_bound'),
  (8, 'Neck Downsample P3→P4', '80x80x256', 3.6, 2.2, 'compute_bound'),
  (8, 'Neck Concat P4-v2', '80x80x512', 6.2, 3.8, 'compute_bound'),
  (8, 'Neck Downsample P4→P5', '40x40x512', 3.6, 2.2, 'compute_bound'),
  (8, 'Neck Concat P5-v2', '40x40x1024', 6.8, 4.1, 'compute_bound'),
  (8, 'Detect Head Small', '160x160x144', 4.2, 2.4, 'compute_bound'),
  (8, 'Detect Head Medium', '80x80x144', 3.1, 1.8, 'compute_bound'),
  (8, 'Detect Head Large', '40x40x144', 2.4, 1.4, 'compute_bound'),

  -- 9 EfficientNet-B4: MBConv block with squeeze-excite branch (pool → FC-FC-sigmoid
  -- → channel-wise scale) plus the outer residual, the two branch points that
  -- distinguish it from a plain conv stack
  (9, 'Stem Conv (3x3)', '380x380x48', 3.2, 1.6, 'compute_bound'),
  (9, 'MBConv Expand (1x1 Conv)', '190x190x288', 4.8, 2.4, 'compute_bound'),
  (9, 'Depthwise Conv (3x3)', '190x190x288', 2.1, 1.8, 'compute_bound'),
  (9, 'SE Squeeze (Global Pool)', '1x1x288', 0.01, 0.1, 'memory_bound'),
  (9, 'SE Excite (FC-ReLU-FC-Sigmoid)', '1x1x288', 0.02, 0.2, 'memory_bound'),
  (9, 'SE Scale', '190x190x288', 0.1, 1.8, 'memory_bound'),
  (9, 'Project (1x1 Conv)', '190x190x48', 1.6, 1.2, 'compute_bound'),
  (9, 'Block Residual Add', '190x190x48', 0.05, 1.2, 'memory_bound'),
  (9, 'MBConv Blocks 2-32 (반복)', '190x190x48', 342.6, 168.4, 'balanced'),
  (9, 'Head Conv (1x1)', '12x12x1792', 4.6, 3.2, 'compute_bound'),
  (9, 'Global Avg Pool', '1x1x1792', 0.01, 0.2, 'memory_bound'),
  (9, 'FC Classifier', '1x1000', 0.02, 0.4, 'memory_bound'),

  -- 10 Stable-Diffusion-v2: latent diffusion U-Net - text encoder cross-attends into
  -- the mid block, and each down-block output skips straight across to its matching
  -- up-block (the defining U-Net shape), then a VAE decoder to pixels
  (10, 'Text Encoder (CLIP)', '77x1024', 6.8, 5.2, 'compute_bound'),
  (10, 'Latent Input (noised)', '64x64x4', 0.01, 0.1, 'memory_bound'),
  (10, 'Down Block 1 (ResNet + Self-Attn)', '64x64x320', 12.4, 6.8, 'compute_bound'),
  (10, 'Down Block 2', '32x32x640', 18.6, 9.4, 'compute_bound'),
  (10, 'Down Block 3', '16x16x1280', 22.8, 11.6, 'compute_bound'),
  (10, 'Mid Block (ResNet + Cross-Attn)', '8x8x1280', 14.2, 7.8, 'compute_bound'),
  (10, 'Up Block 1 (+ skip)', '16x16x1280', 24.6, 12.4, 'compute_bound'),
  (10, 'Up Block 2 (+ skip)', '32x32x640', 20.4, 10.2, 'compute_bound'),
  (10, 'Up Block 3 (+ skip)', '64x64x320', 14.8, 7.6, 'compute_bound'),
  (10, 'Output Conv (denoised latent)', '64x64x4', 0.2, 0.8, 'memory_bound'),
  (10, 'VAE Decoder', '512x512x3', 38.6, 22.4, 'compute_bound'),

  -- 11 Whisper-base: conv stem feeds an encoder, decoder cross-attention reaches all
  -- the way back to the encoder's final output (the encoder-decoder bridge)
  (11, 'Mel Spectrogram', '80x3000', 1.2, 1.8, 'memory_bound'),
  (11, 'Conv1D Stem 1', '1500x512', 6.4, 3.8, 'compute_bound'),
  (11, 'Conv1D Stem 2', '1500x512', 6.2, 4.6, 'compute_bound'),
  (11, 'Positional Encoding (sinusoidal)', '1500x512', 0.01, 1.2, 'memory_bound'),
  (11, 'Encoder Embedding Add', '1500x512', 0.2, 4.6, 'memory_bound'),
  (11, 'Encoder Self-Attention', '1500x512', 14.6, 8.2, 'compute_bound'),
  (11, 'Encoder Attn Add & LayerNorm', '1500x512', 0.2, 4.6, 'memory_bound'),
  (11, 'Encoder FFN', '1500x2048', 22.4, 12.6, 'compute_bound'),
  (11, 'Encoder FFN Add & LayerNorm', '1500x512', 0.2, 4.6, 'memory_bound'),
  (11, 'Encoder Layers 2-6 (반복)', '1500x512', 148.2, 82.4, 'balanced'),
  (11, 'Decoder Token Embedding', '448x512', 0.4, 1.6, 'memory_bound'),
  (11, 'Decoder Masked Self-Attention', '448x512', 4.8, 2.9, 'compute_bound'),
  (11, 'Decoder Self-Attn Add & LayerNorm', '448x512', 0.1, 1.6, 'memory_bound'),
  (11, 'Decoder Cross-Attention', '448x512', 6.2, 3.4, 'compute_bound'),
  (11, 'Decoder Cross-Attn Add & LayerNorm', '448x512', 0.1, 1.6, 'memory_bound'),
  (11, 'Decoder FFN', '448x2048', 8.6, 4.8, 'compute_bound'),
  (11, 'Decoder FFN Add & LayerNorm', '448x512', 0.1, 1.6, 'memory_bound'),
  (11, 'Decoder Layers 2-6 (반복)', '448x512', 76.4, 42.8, 'balanced'),
  (11, 'Output Projection (Linear+Softmax)', '448x51865', 11.8, 6.4, 'compute_bound'),

  -- 12 CLIP-ViT: two fully independent encoder towers (image ViT, text transformer)
  -- that only ever meet at the final contrastive similarity - the two long parallel
  -- branches this graph is really meant to show off
  (12, 'Image Patch Embedding', '196x768', 4.6, 4.8, 'compute_bound'),
  (12, 'Image Position Embedding', '196x768', 0.1, 1.5, 'memory_bound'),
  (12, 'Image Embedding Add', '196x768', 0.2, 4.8, 'memory_bound'),
  (12, 'Image Transformer Encoder (x12 반복)', '196x768', 348.6, 196.4, 'balanced'),
  (12, 'Image Projection Head', '1x512', 0.4, 1.8, 'memory_bound'),
  (12, 'Text Token Embedding', '77x512', 0.8, 1.2, 'memory_bound'),
  (12, 'Text Position Embedding', '77x512', 0.05, 0.6, 'memory_bound'),
  (12, 'Text Embedding Add', '77x512', 0.1, 1.2, 'memory_bound'),
  (12, 'Text Transformer Encoder (x12 반복)', '77x512', 68.4, 38.6, 'balanced'),
  (12, 'Text Projection Head', '1x512', 0.4, 1.8, 'memory_bound'),
  (12, 'Contrastive Similarity', '1x1', 0.001, 0.05, 'memory_bound');

INSERT INTO model_layer_edge (from_layer_id, to_layer_id) VALUES
  -- 1 BERT-base
  (1, 4), (2, 4), (3, 4), (4, 5), (4, 6), (5, 6), (6, 7), (6, 8), (7, 8), (8, 9), (9, 10), (10, 11),
  -- 2 GPT-2
  (12, 14), (13, 14), (14, 15), (15, 16), (14, 17), (16, 17), (17, 18), (18, 19), (17, 20), (19, 20), (20, 21), (21, 22), (22, 23),
  -- 3 RoBERTa-large
  (24, 26), (25, 26), (26, 27), (26, 28), (27, 28), (28, 29), (28, 30), (29, 30), (30, 31), (31, 32),
  -- 4 T5-base
  (33, 34), (33, 35), (34, 35), (35, 36), (35, 37), (36, 37), (37, 38),
  (39, 40), (39, 41), (40, 41), (41, 42), (38, 42), (41, 43), (42, 43), (43, 44), (43, 45), (44, 45), (45, 46), (46, 47),
  -- 5 LLaMA-7B
  (48, 49), (49, 50), (48, 51), (50, 51), (51, 52), (52, 53), (51, 54), (53, 54), (54, 55), (55, 56), (56, 57),
  -- 6 ResNet-50
  (58, 59), (58, 60), (59, 61), (60, 61), (61, 62), (61, 63), (62, 64), (63, 64), (64, 65), (64, 66),
  (65, 67), (66, 67), (67, 68), (67, 69), (68, 70), (69, 70), (70, 71), (71, 72),
  -- 7 ViT-Base
  (73, 76), (74, 76), (75, 76), (76, 77), (76, 78), (77, 78), (78, 79), (78, 80), (79, 80), (80, 81), (81, 82), (82, 83),
  -- 8 YOLOv8
  (84, 85), (85, 86), (86, 87), (87, 88), (88, 89), (89, 90), (90, 91), (87, 91), (91, 92), (92, 93),
  (86, 93), (93, 94), (94, 95), (91, 95), (95, 96), (96, 97), (89, 97), (93, 98), (95, 99), (97, 100),
  -- 9 EfficientNet-B4
  (101, 102), (102, 103), (103, 104), (104, 105), (103, 106), (105, 106), (106, 107),
  (101, 108), (107, 108), (108, 109), (109, 110), (110, 111), (111, 112),
  -- 10 Stable-Diffusion-v2
  (114, 115), (115, 116), (116, 117), (117, 118), (113, 118), (118, 119), (117, 119),
  (119, 120), (116, 120), (120, 121), (115, 121), (121, 122), (122, 123),
  -- 11 Whisper-base
  (124, 125), (125, 126), (126, 128), (127, 128), (128, 129), (128, 130), (129, 130), (130, 131), (130, 132), (131, 132), (132, 133),
  (134, 135), (134, 136), (135, 136), (136, 137), (133, 137), (136, 138), (137, 138), (138, 139), (138, 140), (139, 140), (140, 141), (141, 142),
  -- 12 CLIP-ViT
  (143, 145), (144, 145), (145, 146), (146, 147), (148, 150), (149, 150), (150, 151), (151, 152), (147, 153), (152, 153);

-- datasets paired to whichever model would plausibly train/eval on them.
-- Common-Crawl is left unlinked (model_id NULL) since dataset.model_id is nullable.
INSERT INTO dataset (name, model_id) VALUES
  ('SST-2', 1),
  ('GLUE-MNLI', 1),
  ('WikiText-103', 2),
  ('SQuAD-v2', 3),
  ('CNN-DailyMail', 4),
  ('Alpaca-52k', 5),
  ('ImageNet-1k', 6),
  ('CIFAR-100', 7),
  ('COCO-2017', 8),
  ('ImageNet-1k', 9),
  ('LAION-Aesthetics', 10),
  ('LibriSpeech', 11),
  ('LAION-400M', 12),
  ('Common-Crawl', NULL);

-- ============================================================
-- users (no real auth - CSC just fixes on csc-user-01; csc-demo-filler owns the
-- auto-generated jobs that keep the scheduler timeline busy, see
-- services/jobs.py _maintain_filler_jobs)
-- ============================================================
INSERT INTO "user" (name) VALUES
  ('csc-user-01'),
  ('csc-user-02'),
  ('csc-user-03'),
  ('csc-demo-filler');

-- ============================================================
-- resource tiers - attached to cluster 2 (khu-suwon-01), the only is_live cluster.
-- accelerator_model_id references accelerator_model.id directly (matching is by id,
-- not by string - see services/jobs.py _node_matches_requirement). "available" in
-- GET /resource-tiers is computed live from free node counts (kind + model + purpose
-- filtered), never stored.
--
-- tier 2 (train, A100 x1) is reserved for live demo submissions - _maintain_filler_jobs
-- excludes it and tier 4 (same A100 pool) so a demo submission against tier 2 is
-- always admitted immediately regardless of filler churn. tier 8 (infer, PIM x2) can
-- never be admitted at all (only 1 PIM node exists) - kept to demo permanent queuing.
-- tier 3 and tier 7's costs are deliberately not the cheapest despite being
-- lower-performing than tier 2/6, so priority_pref=balanced sorting actually diverges
-- from time/cost ordering instead of tying out to tier_no order.
-- ============================================================
INSERT INTO resource_tier (cluster_id, job_type, tier_no, cost_per_hour) VALUES
  (2, 'train', 1, 12.0),
  (2, 'train', 2, 5.0),
  (2, 'train', 3, 6.0),
  (2, 'train', 4, 2.0),
  (2, 'infer', 1, 8.0),
  (2, 'infer', 2, 4.0),
  (2, 'infer', 3, 6.0),
  (2, 'infer', 4, 2.0);

INSERT INTO resource_tier_requirement (tier_id, kind, accelerator_model_id, node_count) VALUES
  (1, 'GPU', 2, 2), (1, 'NPU', 3, 1),  -- train tier 1: H100 x2 + NPU x1, 고성능 혼합
  (2, 'GPU', 1, 1),                    -- train tier 2: A100 1대 (데모 예약)
  (3, 'GPU', 5, 1),                    -- train tier 3: A6000 1대 (가성비 나쁨)
  (4, 'GPU', 1, 3),                    -- train tier 4: A100 3대 전부 - 가끔만 available
  (5, 'NPU', 3, 1), (5, 'PIM', 4, 1),  -- infer tier 1: 저지연 혼합
  (6, 'NPU', 3, 1),                    -- infer tier 2: NPU 1대
  (7, 'GPU', 6, 1),                    -- infer tier 3: B200 1대 (가성비 나쁨)
  (8, 'PIM', 4, 2);                    -- infer tier 4: PIM 노드 1대뿐이라 항상 대기

-- ============================================================
-- jobs - only 7, all already 'done'. There's little point pre-seeding
-- running/queued jobs on a real server: with DURATION_SEC this short
-- (train=40s/infer=15s), anything seeded as running/queued will already have been
-- swept to done by the time anyone looks. Live running/queued state comes from real
-- submissions plus the demo-filler mechanism once the server is actually up.
-- Each "done" job still gets full assignment/event/optimization history so job
-- detail pages, the scheduler timeline, and node histories all have real data.
-- ============================================================
-- job 1: train, BERT-base + SST-2, tier 2 (A100 x1) on suwon-srv-01 (node 4)
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, dataset_id, selected_tier_id, submitted_at, started_at, finished_at) VALUES
  (1, 1, 'train', 'done', 128, 'time', 1, 2, now() - interval '6 hours', now() - interval '6 hours', now() - interval '6 hours' + interval '16 minutes');

-- job 2: infer, BERT-base, tier 6 (NPU x1) on suwon-srv-05 (node 8)
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, selected_tier_id, submitted_at, started_at, finished_at) VALUES
  (1, 1, 'infer', 'done', 32, 'cost', 6, now() - interval '5 hours 30 minutes', now() - interval '5 hours 30 minutes', now() - interval '5 hours 30 minutes' + interval '34 seconds');

-- job 3: train, ResNet-50 + ImageNet-1k, tier 4 (A100 x3) on suwon-srv-01/02/04 (4/5/7)
-- - donor in the reallocation below (donated node 4 back to job 1's story)
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, dataset_id, selected_tier_id, submitted_at, started_at, finished_at) VALUES
  (6, 2, 'train', 'done', 64, 'balanced', 7, 4, now() - interval '5 hours', now() - interval '5 hours', now() - interval '5 hours' + interval '28 minutes');

-- job 4: train, GPT-2 + WikiText-103, tier 1 (H100 x2 + NPU x1) on suwon-srv-07/08/03 (10/11/6)
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, dataset_id, selected_tier_id, submitted_at, started_at, finished_at) VALUES
  (2, 1, 'train', 'done', 32, 'time', 3, 1, now() - interval '4 hours', now() - interval '4 hours', now() - interval '4 hours' + interval '42 minutes');

-- job 5: infer, YOLOv8, tier 5 (NPU + PIM) on suwon-srv-05/06 (8/9)
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, selected_tier_id, submitted_at, started_at, finished_at) VALUES
  (8, 3, 'infer', 'done', 16, 'balanced', 5, now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours' + interval '19 seconds');

-- job 6: train, LLaMA-7B + Alpaca-52k, tier 3 (A6000 x1) on suwon-srv-09 (12)
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, dataset_id, selected_tier_id, submitted_at, started_at, finished_at) VALUES
  (5, 2, 'train', 'done', 16, 'cost', 6, 3, now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours' + interval '1 hour 5 minutes');

-- job 7: infer, CLIP-ViT, tier 7 (B200 x1) on suwon-srv-10 (13)
INSERT INTO job (model_id, user_id, type, status, batch, priority_pref, selected_tier_id, submitted_at, started_at, finished_at) VALUES
  (12, 1, 'infer', 'done', 8, 'time', 7, now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour' + interval '9 seconds');

INSERT INTO assignment (job_id, node_id, from_t, to_t) VALUES
  (1, 4, now() - interval '6 hours', now() - interval '6 hours' + interval '16 minutes'),
  (2, 8, now() - interval '5 hours 30 minutes', now() - interval '5 hours 30 minutes' + interval '34 seconds'),
  (3, 4, now() - interval '5 hours', now() - interval '5 hours' + interval '28 minutes'),
  (3, 5, now() - interval '5 hours', now() - interval '5 hours' + interval '28 minutes'),
  (3, 7, now() - interval '5 hours', now() - interval '5 hours' + interval '28 minutes'),
  (4, 10, now() - interval '4 hours', now() - interval '4 hours' + interval '42 minutes'),
  (4, 11, now() - interval '4 hours', now() - interval '4 hours' + interval '42 minutes'),
  (4, 6, now() - interval '4 hours', now() - interval '4 hours' + interval '42 minutes'),
  (5, 8, now() - interval '3 hours', now() - interval '3 hours' + interval '19 seconds'),
  (5, 9, now() - interval '3 hours', now() - interval '3 hours' + interval '19 seconds'),
  (6, 12, now() - interval '2 hours', now() - interval '2 hours' + interval '1 hour 5 minutes'),
  (7, 13, now() - interval '1 hour', now() - interval '1 hour' + interval '9 seconds');

INSERT INTO event (type, job_id, node_id, cluster_id, occurred_at) VALUES
  ('ARRIVAL', 1, NULL, NULL, now() - interval '6 hours'),
  ('START', 1, 4, 2, now() - interval '6 hours'),
  ('FINISH', 1, 4, 2, now() - interval '6 hours' + interval '16 minutes'),
  ('ARRIVAL', 2, NULL, NULL, now() - interval '5 hours 30 minutes'),
  ('START', 2, 8, 2, now() - interval '5 hours 30 minutes'),
  ('FINISH', 2, 8, 2, now() - interval '5 hours 30 minutes' + interval '34 seconds'),
  ('ARRIVAL', 3, NULL, NULL, now() - interval '5 hours'),
  ('START', 3, 4, 2, now() - interval '5 hours'),
  ('START', 3, 5, 2, now() - interval '5 hours'),
  ('START', 3, 7, 2, now() - interval '5 hours'),
  ('FINISH', 3, 4, 2, now() - interval '5 hours' + interval '28 minutes'),
  ('FINISH', 3, 5, 2, now() - interval '5 hours' + interval '28 minutes'),
  ('FINISH', 3, 7, 2, now() - interval '5 hours' + interval '28 minutes'),
  ('ARRIVAL', 4, NULL, NULL, now() - interval '4 hours'),
  ('START', 4, 10, 2, now() - interval '4 hours'),
  ('START', 4, 11, 2, now() - interval '4 hours'),
  ('START', 4, 6, 2, now() - interval '4 hours'),
  ('FINISH', 4, 10, 2, now() - interval '4 hours' + interval '42 minutes'),
  ('FINISH', 4, 11, 2, now() - interval '4 hours' + interval '42 minutes'),
  ('FINISH', 4, 6, 2, now() - interval '4 hours' + interval '42 minutes'),
  ('ARRIVAL', 5, NULL, NULL, now() - interval '3 hours'),
  ('START', 5, 8, 2, now() - interval '3 hours'),
  ('START', 5, 9, 2, now() - interval '3 hours'),
  ('FINISH', 5, 8, 2, now() - interval '3 hours' + interval '19 seconds'),
  ('FINISH', 5, 9, 2, now() - interval '3 hours' + interval '19 seconds'),
  ('ARRIVAL', 6, NULL, NULL, now() - interval '2 hours'),
  ('START', 6, 12, 2, now() - interval '2 hours'),
  ('FINISH', 6, 12, 2, now() - interval '2 hours' + interval '1 hour 5 minutes'),
  ('ARRIVAL', 7, NULL, NULL, now() - interval '1 hour'),
  ('START', 7, 13, 2, now() - interval '1 hour'),
  ('FINISH', 7, 13, 2, now() - interval '1 hour' + interval '9 seconds');

-- job overview cards - matches services/jobs.py METRIC_TEMPLATES exactly, same
-- template auto-seeded on every real submission.
INSERT INTO job_metric_profile (job_id, seq, label, unit, start_value, target_value, curve_shape, total_count, featured) VALUES
  (1, 1, '정확도', '%', 40, 92, 'exp_approach', NULL, true), (1, 2, '에포크', NULL, NULL, NULL, NULL, 100, false),
  (3, 1, '정확도', '%', 40, 92, 'exp_approach', NULL, true), (3, 2, '에포크', NULL, NULL, NULL, NULL, 100, false),
  (4, 1, '정확도', '%', 40, 92, 'exp_approach', NULL, true), (4, 2, '에포크', NULL, NULL, NULL, NULL, 100, false),
  (6, 1, '정확도', '%', 40, 92, 'exp_approach', NULL, true), (6, 2, '에포크', NULL, NULL, NULL, NULL, 100, false);

INSERT INTO job_metric_profile (job_id, seq, label, unit, start_value, target_value, curve_shape, total_count, featured) VALUES
  (2, 1, '처리량', 'req/s', 350, 420, 'exp_approach', NULL, true),
  (2, 2, '응답지연 p50', 'ms', NULL, 12, NULL, NULL, false),
  (2, 3, '응답지연 p99', 'ms', NULL, 38, NULL, NULL, false),
  (2, 4, '누적 요청 수', NULL, NULL, NULL, NULL, 12000, false),
  (2, 5, 'KV 캐시 적중률', '%', 45, 88, 'exp_approach', NULL, false),
  (2, 6, '요청당 전력', 'J', NULL, 0.42, NULL, NULL, false),
  (2, 7, 'Prefill 비율', '%', NULL, 35, NULL, NULL, false),
  (2, 8, 'Decode 비율', '%', NULL, 65, NULL, NULL, false),
  (5, 1, '처리량', 'req/s', 350, 420, 'exp_approach', NULL, true),
  (5, 2, '응답지연 p50', 'ms', NULL, 12, NULL, NULL, false),
  (5, 3, '응답지연 p99', 'ms', NULL, 38, NULL, NULL, false),
  (5, 4, '누적 요청 수', NULL, NULL, NULL, NULL, 12000, false),
  (5, 5, 'KV 캐시 적중률', '%', 45, 88, 'exp_approach', NULL, false),
  (5, 6, '요청당 전력', 'J', NULL, 0.42, NULL, NULL, false),
  (5, 7, 'Prefill 비율', '%', NULL, 35, NULL, NULL, false),
  (5, 8, 'Decode 비율', '%', NULL, 65, NULL, NULL, false),
  (7, 1, '처리량', 'req/s', 350, 420, 'exp_approach', NULL, true),
  (7, 2, '응답지연 p50', 'ms', NULL, 12, NULL, NULL, false),
  (7, 3, '응답지연 p99', 'ms', NULL, 38, NULL, NULL, false),
  (7, 4, '누적 요청 수', NULL, NULL, NULL, NULL, 12000, false),
  (7, 5, 'KV 캐시 적중률', '%', 45, 88, 'exp_approach', NULL, false),
  (7, 6, '요청당 전력', 'J', NULL, 0.42, NULL, NULL, false),
  (7, 7, 'Prefill 비율', '%', NULL, 35, NULL, NULL, false),
  (7, 8, 'Decode 비율', '%', NULL, 65, NULL, NULL, false);

-- caching: infer jobs 2, 5, 7
INSERT INTO job_cache_profile (job_id, latency_reduction_pct) VALUES
  (2, 33.0), (5, 28.5), (7, 41.0);

INSERT INTO job_cache_tier (job_id, tier_name, fill_pct, latency_ms) VALUES
  (2, 'VRAM', 82.0, 0.4), (2, 'DRAM', 55.0, 2.1), (2, 'SSD', 20.0, 18.0),
  (5, 'VRAM', 74.0, 0.5), (5, 'DRAM', 48.0, 2.4), (5, 'SSD', 15.0, 19.5),
  (7, 'VRAM', 90.0, 0.3), (7, 'DRAM', 62.0, 1.8), (7, 'SSD', 25.0, 16.0);

-- DART history: train jobs 1, 3, 4, 6
INSERT INTO hyperparam_adjustment (job_id, seq, t_offset_sec, param_name, from_value, to_value, reward) VALUES
  (1, 1, 300, '배치 크기', '512', '640', '+0.021'),
  (1, 2, 660, '데이터 shard', '4-way', '6-way', '+0.014'),
  (3, 1, 600, '학습률', '1e-3', '5e-4', '+0.018'),
  (4, 1, 600, '배치 크기', '256', '384', '+0.016'),
  (4, 2, 1560, '워커 수', '4', '8', '+0.009'),
  (6, 1, 1380, '학습률', '2e-4', '1e-4', '+0.011');

-- KQV benchmark: train jobs 1, 4, 6
INSERT INTO job_kqv_benchmark (job_id, kqv_gain_pct, kqv_even_makespan_sec, kqv_opt_makespan_sec) VALUES
  (1, 21.5, 77040, 60480),
  (4, 18.2, 54000, 44172),
  (6, 25.7, 96000, 71328);

-- reallocation: job 3 (done) donated node 4 to job 1 (done) mid-run
INSERT INTO reallocation (donor_job_id, receiver_job_id, node_id, at_t_offset_sec, downtime_sec, resume_delay_sec) VALUES
  (3, 1, 4, 840, 0, 5);

-- negotiation: job 1
INSERT INTO job_negotiation (job_id, rounds, agreement_pct) VALUES
  (1, 5, 96.0);

INSERT INTO job_negotiation_item (job_id, side, seq, text) VALUES
  (1, 'proposed', 1, '학습시간 18h'),
  (1, 'proposed', 2, '비용 $210'),
  (1, 'agreed', 1, '전력 2.4kW'),
  (1, 'agreed', 2, '활용률 78%'),
  (1, 'agreed', 3, 'SLA 99.1%');
