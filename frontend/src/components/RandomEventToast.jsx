import { h } from "preact";
import { useEffect, useState, useCallback } from "preact/hooks";

const CLICK_EVENTS = ['legacy_code', 'bug_production', 'coffee_stain', 'deploy_friday'];
const INCIDENT_EVENTS = new Set([
  'bug_production',
  'deploy_friday',
  'production_500_spike',
  'ci_pipeline_red',
  'friday_release_outage',
  'stack_overflow_down',
]);

const EVENT_CHOICE_HINTS = {
  golden_commit: { solve: '+40 коммитов · −4 стресс', ignore: '+2 стресс' },
  open_source_contribution: { solve: '+20 коммитов · скин', ignore: 'без награды' },
  green_build: { solve: '+15 коммитов · −3 стресс', ignore: '+4 коммита' },
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
  if (INCIDENT_EVENTS.has(type)) return 'var(--incident-red)';
  if (type === 'green_build' || type === 'canary_rollback') return 'var(--signal-green)';
  if (type === 'coffee_stain' || type === 'golden_commit') return 'var(--coffee-amber)';
  return 'var(--electric-cyan)';
}

export default function RandomEventToast({ event, onChoice, onTap, disabled = false }) {
  const [timeLeft, setTimeLeft] = useState(100);
  const [mode, setMode] = useState('choice');

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
    if (clickKey && event.state[clickKey] > 0) setMode('minigame');
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
  const isIncident = INCIDENT_EVENTS.has(event.type);
  const color = getEventColor(event.type);
  const clickKey = getClickKey(event.type);
  const clicksLeft = clickKey ? (event.state?.[clickKey] || 0) : 0;
  const solveHint = getChoiceHint(event.type, 'solve');
  const ignoreHint = getChoiceHint(event.type, 'ignore');
  const secondsLeft = Math.max(0, Math.ceil((timeLeft / 100) * Math.max(1, Number(event.timeout || 15))));
  const cardClass = ['pixel-toast', 'event-card-v2', isIncident ? 'event-card-v2--incident' : ''].filter(Boolean).join(' ');
  const baseStyle = {
    '--event-signal': color,
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "90vw",
    maxWidth: "420px",
    animation: "pixel-fade-in 150ms step-end forwards",
  };

  const header = h('div', null, [
    h('div', { className: 'event-card-v2__eyebrow' }, `${isIncident ? 'АКТИВНЫЙ ИНЦИДЕНТ' : 'СИСТЕМНОЕ СОБЫТИЕ'} · ${secondsLeft}с`),
    h('h2', { className: 'event-card-v2__title' }, event.title),
  ]);

  const timer = h('div', { className: 'event-card-v2__timer-track', 'aria-label': `До автоматического выбора: ${secondsLeft} секунд` },
    h('div', {
      style: {
        width: `${timeLeft}%`,
        height: '100%',
        background: color,
        transition: "width 1s linear",
      },
    }),
  );

  if (mode === 'minigame' && isClickEvent) {
    return h('section', { className: cardClass, style: baseStyle, role: 'dialog', 'aria-live': 'assertive', 'aria-label': event.title }, [
      header,
      h('div', { className: 'event-card-v2__status' }, `Осталось действий: ${clicksLeft}`),
      timer,
      h('button', {
        className: 'event-card-v2__choice',
        disabled,
        onClick: handleMiniGameTap,
        style: { width: '100%', borderColor: color, color, opacity: disabled ? 0.65 : 1 },
      }, disabled ? 'ОБРАБОТКА…' : 'ВЫПОЛНИТЬ ДЕЙСТВИЕ'),
    ]);
  }

  return h('section', { className: cardClass, style: baseStyle, role: 'dialog', 'aria-live': 'assertive', 'aria-label': event.title }, [
    header,
    h('div', { className: 'event-card-v2__description' }, event.description),
    timer,
    isAutoEvent
      ? h('div', { className: 'event-card-v2__status' }, 'Событие завершится автоматически…')
      : h('div', { className: 'event-card-v2__choices', style: { display: 'flex', justifyContent: 'stretch' } }, [
          event.options?.solve && h('button', {
            className: 'event-card-v2__choice',
            disabled,
            onClick: handleSolve,
            style: { flex: 1, opacity: disabled ? 0.65 : 1 },
          }, [
            h('div', null, event.options.solve.label),
            solveHint && h('div', { className: 'event-card-v2__hint' }, solveHint),
          ]),
          event.options?.ignore && h('button', {
            className: 'event-card-v2__choice event-card-v2__choice--danger',
            disabled,
            onClick: handleIgnore,
            style: { flex: 1, opacity: disabled ? 0.65 : 1 },
          }, [
            h('div', null, event.options.ignore.label),
            ignoreHint && h('div', { className: 'event-card-v2__hint' }, ignoreHint),
          ]),
        ]),
  ]);
}
