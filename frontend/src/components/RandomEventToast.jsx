import { h } from "preact";
import { useEffect, useState, useCallback } from "preact/hooks";

const CLICK_EVENTS = ['legacy_code', 'bug_production', 'coffee_stain', 'deploy_friday'];

const EVENT_CHOICE_HINTS = {
  golden_commit: { solve: '+40 коммитов · −4 стресс', ignore: '+2 стресс' },
  open_source_contribution: { solve: '+20 коммитов · скин', ignore: 'без награды' },
  legacy_code: { solve: 'запустит мини-игру', ignore: '−10 коммитов · +8 стресс' },
  deploy_friday: { solve: 'запустит отмену deploy', ignore: '70% спокойно · 30% инцидент' },
  bug_production: { solve: 'запустит хотфикс', ignore: '+6 стресс' },
  code_review: { solve: '+10 коммитов · +2 стресс', ignore: '−5 коммитов · +4 стресс' },
  slack_huddle: { solve: '+12 коммитов · +2 стресс', ignore: '−3 коммита · −1 стресс' },
  scope_creep: { solve: '+8 коммитов · +3 стресс', ignore: '−2 коммита · −1 стресс' },
  merge_conflict: { solve: '+5 коммитов · +3 стресс', ignore: '−12 коммитов · +5 стресс' },
  canary_rollback: { solve: '−2 коммита · +1 стресс', ignore: '−8 коммитов · +5 стресс' },
  production_500_spike: { solve: '+4 коммита · +2 стресс', ignore: '−5 коммитов · +6 стресс' },
  ci_pipeline_red: { solve: '−1 коммит · +1 стресс', ignore: '−6 коммитов · +5 стресс' },
  slack_thread_storm: { solve: '+4 коммита · +1 стресс', ignore: '−3 коммита · +3 стресс' },
  friday_release_outage: { solve: '−3 коммита · +2 стресс', ignore: '−10 коммитов · +7 стресс' },
  coffee_stain: { solve: 'запустит мини-игру', ignore: 'без награды' },
};

function getChoiceHint(type, action) {
  return EVENT_CHOICE_HINTS[type]?.[action] || '';
}

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
    case 'slack_huddle': return '#38bdf8';
    case 'scope_creep': return '#e879f9';
    case 'merge_conflict': return '#fb7185';
    case 'canary_rollback': return '#facc15';
    case 'production_500_spike': return '#ef4444';
    case 'ci_pipeline_red': return '#f97316';
    case 'slack_thread_storm': return '#a78bfa';
    case 'friday_release_outage': return '#dc2626';
    case 'coffee_stain': return '#8B4513';
    case 'stack_overflow_down': return '#f43f5e';
    default: return '#fbbf24';
  }
}

export default function RandomEventToast({ event, onChoice, onTap, disabled = false }) {
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
    if (!event || disabled) return;
    onChoice(event.eventId, event.type, 'solve');
  }, [disabled, event, onChoice]);

  const handleIgnore = useCallback(() => {
    if (!event || disabled) return;
    onChoice(event.eventId, event.type, 'ignore');
  }, [disabled, event, onChoice]);

  const handleMiniGameTap = useCallback(() => {
    if (!event || disabled) return;
    onTap(event.eventId, event.type);
  }, [disabled, event, onTap]);

  if (!event) return null;

  const isClickEvent = CLICK_EVENTS.includes(event.type);
  const isAutoEvent = event.type === 'stack_overflow_down';
  const color = getEventColor(event.type);
  const clickKey = getClickKey(event.type);
  const clicksLeft = clickKey ? (event.state?.[clickKey] || 0) : 0;
  const solveHint = getChoiceHint(event.type, 'solve');
  const ignoreHint = getChoiceHint(event.type, 'ignore');

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
          disabled,
          onClick: handleMiniGameTap,
          style: {
            width: "100%",
            padding: "16px",
            fontSize: "14px",
            background: color,
            color: "#0f172a",
            opacity: disabled ? 0.65 : 1,
          },
        }, disabled ? "..." : "ТАП!"),
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
              disabled,
              onClick: handleSolve,
              style: { flex: 1, opacity: disabled ? 0.65 : 1 },
            }, [
              h('div', null, event.options.solve.label),
              solveHint && h('div', {
                style: { fontSize: '8px', opacity: 0.76, marginTop: '4px', lineHeight: 1.25 },
              }, solveHint),
            ]),
            event.options?.ignore && h("button", {
              className: "pixel-button pixel-button--danger",
              disabled,
              onClick: handleIgnore,
              style: { flex: 1, opacity: disabled ? 0.65 : 1 },
            }, [
              h('div', null, event.options.ignore.label),
              ignoreHint && h('div', {
                style: { fontSize: '8px', opacity: 0.76, marginTop: '4px', lineHeight: 1.25 },
              }, ignoreHint),
            ]),
          ]),
    ]
  );
}
