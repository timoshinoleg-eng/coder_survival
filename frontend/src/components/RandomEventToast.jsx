import { h } from "preact";
import { useEffect, useState, useCallback } from "preact/hooks";

const CLICK_EVENTS = ['legacy_code', 'bug_production', 'coffee_stain', 'deploy_friday'];

function getClickKey(type) {
  if (type === 'legacy_code') return 'legacyCodeClicksRemaining';
  if (type === 'bug_production') return 'bugProductionClicksRemaining';
  if (type === 'coffee_stain') return 'coffeeStainClicksRemaining';
  if (type === 'deploy_friday') return 'deployFridayClicksRemaining';
  return null;
}

function getEventColor(type) {
  switch (type) {
    case 'golden_commit': return '#fbbf24';
    case 'open_source_contribution': return '#34d399';
    case 'bug_production': return '#ef4444';
    case 'deploy_friday': return '#f97316';
    case 'legacy_code': return '#a78bfa';
    case 'code_review': return '#60a5fa';
    case 'coffee_stain': return '#8B4513';
    case 'stack_overflow_down': return '#f43f5e';
    default: return '#fbbf24';
  }
}

export default function RandomEventToast({ event, onChoice, onTap }) {
  const [timeLeft, setTimeLeft] = useState(100);
  const [mode, setMode] = useState('choice'); // 'choice' | 'minigame'

  useEffect(() => {
    if (!event) {
      setMode('choice');
      return;
    }
    setTimeLeft(100);
    setMode('choice');
    const timeoutSeconds = Math.max(1, Number(event.timeout || 15));
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - (100 / timeoutSeconds);
        return next <= 0 ? 0 : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [event?.eventId]);

  useEffect(() => {
    if (!event?.state) return;
    const clickKey = getClickKey(event.type);
    if (clickKey && event.state[clickKey] > 0) {
      setMode('minigame');
    }
  }, [event?.state, event?.type]);

  useEffect(() => {
    if (timeLeft <= 0 && event && mode === 'choice') {
      onChoice(event.eventId, event.type, 'ignore');
    }
  }, [timeLeft, event, mode, onChoice]);

  const handleSolve = useCallback(() => {
    if (!event) return;
    onChoice(event.eventId, event.type, 'solve');
  }, [event, onChoice]);

  const handleIgnore = useCallback(() => {
    if (!event) return;
    onChoice(event.eventId, event.type, 'ignore');
  }, [event, onChoice]);

  const handleMiniGameTap = useCallback(() => {
    if (!event) return;
    onTap(event.eventId, event.type);
  }, [event, onTap]);

  if (!event) return null;

  const isClickEvent = CLICK_EVENTS.includes(event.type);
  const isAutoEvent = event.type === 'stack_overflow_down';
  const color = getEventColor(event.type);
  const clickKey = getClickKey(event.type);
  const clicksLeft = clickKey ? (event.state?.[clickKey] || 0) : 0;

  const baseStyle = {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "90vw",
    maxWidth: "420px",
    zIndex: 200,
    animation: "pixel-fade-in 150ms step-end forwards",
    background: "rgba(16, 25, 45, 0.96)",
    border: `2px solid ${color}`,
    borderRadius: "4px",
    padding: "12px",
  };

  if (mode === 'minigame' && isClickEvent) {
    return h(
      "div",
      { className: "pixel-toast", style: baseStyle },
      [
        h("div", {
          style: {
            fontFamily: "'Press Start 2P', 'Courier New', monospace",
            fontSize: "11px",
            color,
            textTransform: "uppercase",
            marginBottom: "8px",
            textShadow: "2px 2px 0 #0f172a",
          },
        }, event.title),
        h("div", {
          style: {
            fontFamily: "'Press Start 2P', 'Courier New', monospace",
            fontSize: "9px",
            color: "#e2e8f0",
            lineHeight: 1.5,
            marginBottom: "12px",
            textShadow: "2px 2px 0 #0f172a",
          },
        }, `Осталось кликов: ${clicksLeft}`),
        h("div", {
          style: {
            width: "100%",
            height: "2px",
            background: "#0f3460",
            marginBottom: "12px",
            overflow: "hidden",
          },
        }, h("div", {
          style: {
            width: `${timeLeft}%`,
            height: "100%",
            background: color,
            transition: "width 1s linear",
          },
        })),
        h("button", {
          className: "pixel-button",
          onClick: handleMiniGameTap,
          style: {
            width: "100%",
            padding: "16px",
            fontSize: "14px",
            background: color,
            color: "#0f172a",
          },
        }, "ТАП!"),
      ]
    );
  }

  return h(
    "div",
    { className: "pixel-toast", style: baseStyle },
    [
      h("div", {
        style: {
          fontFamily: "'Press Start 2P', 'Courier New', monospace",
          fontSize: "11px",
          color,
          textTransform: "uppercase",
          marginBottom: "8px",
          textShadow: "2px 2px 0 #0f172a",
        },
      }, event.title),
      h("div", {
        style: {
          fontFamily: "'Press Start 2P', 'Courier New', monospace",
          fontSize: "9px",
          color: "#e2e8f0",
          lineHeight: 1.5,
          marginBottom: "12px",
          textShadow: "2px 2px 0 #0f172a",
        },
      }, event.description),
      h("div", {
        style: {
          width: "100%",
          height: "2px",
          background: "#0f3460",
          marginBottom: "12px",
          overflow: "hidden",
        },
      }, h("div", {
        style: {
          width: `${timeLeft}%`,
          height: "100%",
          background: color,
          transition: "width 1s linear",
        },
      })),
      isAutoEvent
        ? h("div", {
            style: {
              fontFamily: "'Press Start 2P', 'Courier New', monospace",
              fontSize: "9px",
              color: "#94a3b8",
              textAlign: "center",
            },
          }, "Авто-закрытие...")
        : h("div", {
            style: {
              display: "flex",
              gap: "8px",
              justifyContent: "stretch",
            },
          }, [
            event.options?.solve && h("button", {
              className: "pixel-button",
              onClick: handleSolve,
              style: { flex: 1 },
            }, event.options.solve.label),
            event.options?.ignore && h("button", {
              className: "pixel-button pixel-button--danger",
              onClick: handleIgnore,
              style: { flex: 1 },
            }, event.options.ignore.label),
          ]),
    ]
  );
}
