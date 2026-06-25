import { h } from "preact";
import { useMemo } from "preact/hooks";
import { useGameState } from "../hooks/useGameState.js";

function formatCountdown(targetMs, nowMs) {
  const diff = Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}ч ${String(m).padStart(2, "0")}м`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function burnoutColor(value) {
  // Emerald (#2ECC71) -> Blood red (#E74C3C)
  const pct = Math.min(1, Math.max(0, value / 200));
  const r = Math.round(46 + (231 - 46) * pct);
  const g = Math.round(204 + (76 - 204) * pct);
  const b = Math.round(113 + (60 - 113) * pct);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function BurnoutMeter({ runtimeNow }) {
  const { depression, burnoutAffliction, forcedBreakUntil } = useGameState();
  const value = Number(depression ?? 0);
  const pct = Math.min(100, (value / 200) * 100);
  const color = burnoutColor(value);
  const isAfflicted = value >= 100 || burnoutAffliction;
  const isCritical = value >= 180;

  const breakActive = useMemo(() => {
    if (!forcedBreakUntil) return false;
    const now = runtimeNow || Date.now();
    return new Date(forcedBreakUntil).getTime() > now;
  }, [forcedBreakUntil, runtimeNow]);

  const breakUntilMs = breakActive
    ? new Date(forcedBreakUntil).getTime()
    : 0;

  return h(
    "div",
    { style: { position: "relative", width: "100%" } },
    [
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "6px" } },
        [
          h(
            "span",
            {
              style: {
                minWidth: "50px",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              },
            },
            [
              "💀",
              "Burnout",
              isAfflicted &&
                h(
                  "span",
                  {
                    title: "Resolve is tested...",
                    style: {
                      marginLeft: "2px",
                      fontSize: "var(--text-sm)",
                      cursor: "help",
                      color: "var(--accent-gold)",
                    },
                  },
                  "⚠️"
                ),
              isCritical &&
                h(
                  "span",
                  {
                    title: "Heart attack imminent!",
                    style: {
                      marginLeft: "2px",
                      fontSize: "var(--text-sm)",
                      cursor: "help",
                      color: "var(--danger)",
                    },
                  },
                  "❤️"
                ),
            ]
          ),
          h(
            "div",
            {
              style: {
                flex: 1,
                height: "8px",
                background: "var(--bg-button)",
                borderRadius: "0",
                overflow: "hidden",
                position: "relative",
              },
            },
            h("div", {
              style: {
                width: `${pct}%`,
                height: "100%",
                background: color,
                transition: "width 0.25s ease, background 0.3s ease",
                boxShadow: isCritical
                  ? "0 0 10px rgba(231,76,60,0.55)"
                  : isAfflicted
                    ? "0 0 8px rgba(243,156,18,0.45)"
                    : "none",
              },
            })
          ),
          h(
            "span",
            {
              style: {
                minWidth: "46px",
                textAlign: "right",
                fontWeight: "bold",
                color,
                fontSize: "11px",
              },
            },
            `${Math.round(value)}/200`
          ),
        ]
      ),

      breakActive &&
        h(
          "div",
          {
            style: {
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(10, 20, 38, 0.92)",
              border: "1px solid #5a2d2d",
              padding: "6px 10px",
              fontSize: "11px",
              color: "var(--danger)",
              fontWeight: 700,
              gap: "8px",
              zIndex: 5,
            },
          },
          [
            "🛑",
            `Forced break: ${formatCountdown(
              breakUntilMs,
              runtimeNow || Date.now()
            )}`,
          ]
        ),
    ]
  );
}
