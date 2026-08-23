"use client";
import Card from "@/components/Card";
import SchedulingTimeline from "@/components/SchedulingTimeline";
import { computeDominanceBands, buildTimeAxisTicks } from "@/lib/schedulingBands";
import { formatTick } from "@/lib/timeline";
import { generateMetricSeries, findMetricProfile } from "@/lib/metrics";
import { COLOR_PREFILL, COLOR_DECODE, COLOR_KV, COLOR_MODEL } from "@/lib/schedulingColors";
import { useTime } from "@/lib/TimeContext";
import type { MetricType, NodeDetail } from "@/app/types";

interface NodeSchedulingPanelProps {
    node: NodeDetail;
}

/** 개요 탭의 "실시간 모니터링" 섹션에 이어붙는 5행 스케줄링 타임라인 차트.
 *  Prefill/Decode Backlog 자체는 (색만 맞춰서) 위쪽 스파크라인 그리드에 다른
 *  지표들과 한 줄로 같이 나간다 - 여긴 그 아래 타임라인만 그린다.
 *  창은 AllocationTimeline과 같은 2분(120초) 슬라이딩 창 - 처음엔 목업처럼
 *  30분(1800초)으로 뒀는데, 앱 전역 시계가 2초마다만 도니 30분 창 대비 한 틱의
 *  이동량이 0.1% 남짓이라 거의 안 움직이는 것처럼 보였다. seed.sql의
 *  period_sec도 이 창 길이에 맞춰 같이 줄여뒀다. */
const TIMELINE_SPAN_SEC = 120;
const TIMELINE_POINTS = 60;

export default function NodeSchedulingPanel({ node }: NodeSchedulingPanelProps) {
    const { nowSec } = useTime();

    if (nowSec === null) return null;
    const toSec = nowSec;

    const timelineSeries = (type: MetricType) => {
        const p = findMetricProfile(node.metric_profiles, type);
        return p ? generateMetricSeries(p, toSec, TIMELINE_SPAN_SEC, TIMELINE_POINTS) : [];
    };

    const prefillLine = timelineSeries("prefill_backlog");
    const decodeLine = timelineSeries("decode_backlog");

    const bands = computeDominanceBands(
        prefillLine,
        decodeLine,
        (n) => `Prefill ${String.fromCharCode(64 + n)}`,
        (n) => `D${n}`
    );
    // 2분짜리 짧은 창이라 분 단위(HH:mm)만 찍으면 눈금 여러 개가 같은 라벨로
    // 겹쳐 보인다 - AllocationTimeline이 짧은 창에서 초 단위를 켜는 것과 같은 이유.
    const ticks = buildTimeAxisTicks(toSec - TIMELINE_SPAN_SEC, toSec, (ms) => formatTick(ms, true), 6);

    return (
        <Card>
            <SchedulingTimeline
                prefill={{ label: "Prefill", color: COLOR_PREFILL, values: prefillLine }}
                decode={{ label: "Decode", color: COLOR_DECODE, values: decodeLine }}
                kvVram={{ label: "KV", color: COLOR_KV, values: timelineSeries("kv_vram") }}
                modelVram={{ label: "Model", color: COLOR_MODEL, values: timelineSeries("model_vram") }}
                kvDram={{ label: "KV", color: COLOR_KV, values: timelineSeries("kv_dram") }}
                modelDram={{ label: "Model", color: COLOR_MODEL, values: timelineSeries("model_dram") }}
                kvDisk={{ label: "KV", color: COLOR_KV, values: timelineSeries("kv_disk") }}
                modelDisk={{ label: "Model", color: COLOR_MODEL, values: timelineSeries("model_disk") }}
                bands={bands}
                ticks={ticks}
            />
        </Card>
    );
}
