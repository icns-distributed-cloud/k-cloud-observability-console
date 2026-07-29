"use client";
import { TIMELINE_SPAN_SEC, useTime } from "@/lib/TimeContext";

export default function TimelineScrubber() {
  const { nowSec, isLive, offsetSec, setOffsetSec, goLive } = useTime();

  // 슬라이더는 왼쪽이 과거, 오른쪽이 현재가 되도록 뒤집어서 다룬다
  const sliderValue = TIMELINE_SPAN_SEC - offsetSec;

  const label = (() => {
    if (nowSec === null) return "";
    if (isLive) return "LIVE";
    const m = Math.round(offsetSec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분 전` : `${m}분 전`;
  })();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 28px",
        borderBottom: "1px solid var(--line)",
        background: "var(--panel-2)",
      }}
    >
      <button
        onClick={goLive}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          border: `1px solid ${isLive ? "var(--accent)" : "var(--line)"}`,
          background: isLive ? "rgba(99,102,241,.14)" : "transparent",
          color: isLive ? "var(--accent)" : "var(--sub)",
          borderRadius: 8,
          padding: "5px 11px",
          cursor: "pointer",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".06em",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: isLive ? "var(--accent)" : "#64748B",
          }}
        />
        LIVE
      </button>

      <input
        type="range"
        min={0}
        max={TIMELINE_SPAN_SEC}
        step={60}
        value={sliderValue}
        onChange={(e) => setOffsetSec(TIMELINE_SPAN_SEC - Number(e.target.value))}
        style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
      />

      <span
        style={{
          fontSize: 11.5,
          color: isLive ? "var(--accent)" : "var(--ink)",
          fontFamily: "'IBM Plex Mono', monospace",
          minWidth: 84,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
    </div>
  );
}