import { h } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useClosingConfirmation } from '../hooks/useClosingConfirmation.js';
import { Analytics } from '../utils/analytics.js';

const STEP_NAMES = ['welcome', 'tap', 'energy', 'burnout', 'quests', 'payoff'];
const TOTAL_STEPS = 6;

function formatEta(seconds) {
  if (seconds == null || seconds <= 0) return 'скоро';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function useTargetRect(step) {
  const [rect, setRect] = useState(null);

  const targetId = useMemo(() => {
    if (step === 1) return 'ftue-tap-area';
    if (step === 2) return 'ftue-energy-bar';
    if (step === 3) return 'ftue-burnout-meter';
    if (step === 4) return 'ftue-daily-quests';
    return null;
  }, [step]);

  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return undefined;
    }

    const measure = () => {
      const el = document.getElementById(targetId);
      setRect(el ? el.getBoundingClientRect() : null);
    };

    measure();
    window.addEventListener('resize', measure);
    const interval = setInterval(measure, 400);

    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(interval);
    };
  }, [targetId]);

  return { targetId, rect };
}

export default function OnboardingCoach({ visible, onClose }) {
  const {
    energy,
    maxEnergy,
    recoveryEtaSeconds,
    depression,
    totalTaps,
    daily,
    quests,
    rankName,
    completeOnboarding,
    skipOnboarding,
    showToast,
    loading,
  } = useGameState();

  const [step, setStep] = useState(0);
  const [startTaps, setStartTaps] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const startTimeRef = useRef(null);
  const trackedStepsRef = useRef(new Set());

  useClosingConfirmation(visible);

  useEffect(() => {
    if (visible) {
      setStep(0);
      setStartTaps(0);
      setCompleting(false);
      trackedStepsRef.current = new Set();
      startTimeRef.current = Date.now();
      Analytics.track('onboarding_started');
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (!trackedStepsRef.current.has(step)) {
      trackedStepsRef.current.add(step);
      Analytics.track('onboarding_step_seen', {
        step,
        name: STEP_NAMES[step],
        total_steps: TOTAL_STEPS,
      });
    }
  }, [step, visible]);

  useEffect(() => {
    if (visible && step === 1) {
      setStartTaps(totalTaps || 0);
    }
  }, [step, totalTaps, visible]);

  useEffect(() => {
    if (!visible || step !== 1) return;
    if (totalTaps - startTaps >= 3) {
      Analytics.track('onboarding_step_completed', {
        step: 1,
        name: STEP_NAMES[1],
        total_steps: TOTAL_STEPS,
      });
      setStep(2);
    }
  }, [step, startTaps, totalTaps, visible]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      Analytics.track('onboarding_step_completed', {
        step,
        name: STEP_NAMES[step],
        total_steps: TOTAL_STEPS,
      });
      setStep((s) => s + 1);
    }
  }, [step]);

  const handleSkip = useCallback(async () => {
    if (skipping || loading) return;
    Analytics.track('onboarding_skipped', {
      step,
      name: STEP_NAMES[step],
      total_steps: TOTAL_STEPS,
    });
    setSkipping(true);
    try {
      await skipOnboarding?.();
      onClose?.({ completed: false });
    } catch (err) {
      console.error('[Onboarding] skip failed', err);
      showToast?.('Не удалось сохранить выбор. Попробуй ещё раз.', 'error', 2000);
    } finally {
      setSkipping(false);
    }
  }, [skipping, loading, step, skipOnboarding, onClose, showToast]);

  const handleComplete = useCallback(async () => {
    if (completing || loading) return;
    setCompleting(true);
    try {
      await completeOnboarding?.();
      const durationSec = startTimeRef.current
        ? Math.round((Date.now() - startTimeRef.current) / 1000)
        : 0;
      Analytics.track('onboarding_completed', { duration_sec: durationSec });
      onClose?.({ completed: true });
    } catch (err) {
      console.error('[Onboarding] complete failed', err);
      showToast?.('Не удалось сохранить прогресс. Попробуй ещё раз.', 'error', 2000);
    } finally {
      setCompleting(false);
    }
  }, [completing, loading, completeOnboarding, onClose, showToast]);

  const { rect } = useTargetRect(step);

  const tooltipStyle = useMemo(() => {
    const base = {
      position: 'fixed',
      zIndex: 1001,
      maxWidth: 'min(320px, calc(100vw - 32px))',
      width: 'min(320px, calc(100vw - 32px))',
      background: '#111827',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: '12px',
      padding: '14px',
      color: '#f8fafc',
      boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
      pointerEvents: 'auto',
    };

    if (!rect) {
      return { ...base, left: 16, top: 80 };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const padding = 16;
    const maxWidth = Math.min(320, vw - padding * 2);
    const estimatedHeight = 160;

    let left = rect.left + rect.width / 2 - maxWidth / 2;
    left = Math.max(padding, Math.min(left, vw - maxWidth - padding));

    let top = rect.bottom + 12;
    if (top + estimatedHeight > vh - padding) {
      top = Math.max(padding, rect.top - estimatedHeight - 12);
    }

    return { ...base, left, top, width: `${maxWidth}px` };
  }, [rect]);

  if (!visible) return null;

  const isCentered = step === 0 || step === 5;
  const showDimOverlay = step >= 2 && step <= 4;
  const showTooltip = step >= 1 && step <= 4;

  const list = quests || daily?.quests || [];
  const completedQuests = daily?.completed || list.filter((q) => q.completed).length;
  const totalQuests = list.length || 0;

  const progressText = `Шаг ${step + 1} из ${TOTAL_STEPS}`;

  const primaryButtonStyle = {
    minHeight: '44px',
    border: '0',
    borderRadius: '10px',
    background: '#4ade80',
    color: '#052e16',
    fontWeight: 800,
    fontSize: '15px',
    cursor: 'pointer',
    opacity: 1,
  };

  const skipLinkStyle = {
    background: 'transparent',
    border: '0',
    color: '#94a3b8',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '8px 4px',
    textDecoration: 'underline',
  };

  const renderCardContent = () => {
    if (step === 0) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, [
        h('div', { style: { fontSize: '15px', color: '#e2e8f0', lineHeight: 1.45 } },
          'Тапай = кодишь. Следи за энергией и не сгори.'
        ),
        h('button', {
          type: 'button',
          style: primaryButtonStyle,
          onClick: goNext,
        }, 'Понял, начать'),
        h('button', {
          type: 'button',
          style: { ...skipLinkStyle, opacity: skipping ? 0.6 : 1 },
          onClick: handleSkip,
          disabled: skipping,
        }, skipping ? 'Сохраняем...' : 'Пропустить обучение'),
      ]);
    }

    if (step === 1) {
      const remaining = Math.max(0, 3 - (totalTaps - startTaps));
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '14px', color: '#e2e8f0', lineHeight: 1.4 } },
          'Тапай настоящую кнопку. Каждый тап — это строки кода и прогресс.'
        ),
        h('div', { style: { fontSize: '13px', color: '#4ade80', fontWeight: 700 } },
          `Осталось тапов: ${remaining}`
        ),
        h('button', {
          type: 'button',
          style: { ...skipLinkStyle, opacity: skipping ? 0.6 : 1 },
          onClick: handleSkip,
          disabled: skipping,
        }, skipping ? 'Сохраняем...' : 'Пропустить обучение'),
      ]);
    }

    if (step === 2) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '14px', color: '#e2e8f0', lineHeight: 1.4 } },
          'Каждый тап тратит 1 энергию. Когда энергия закончится — отдохни, она восстановится.'
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' } }, [
          h('span', { style: { color: '#facc15', fontWeight: 700 } }, '⚡'),
          h('span', null, `${Math.round(energy)}/${maxEnergy}`),
          h('span', { style: { color: '#94a3b8' } }, `• +1 через ${formatEta(recoveryEtaSeconds)}`),
        ]),
        h('button', { type: 'button', style: primaryButtonStyle, onClick: goNext }, 'Дальше'),
        h('button', {
          type: 'button',
          style: { ...skipLinkStyle, opacity: skipping ? 0.6 : 1 },
          onClick: handleSkip,
          disabled: skipping,
        }, skipping ? 'Сохраняем...' : 'Пропустить обучение'),
      ]);
    }

    if (step === 3) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '14px', color: '#e2e8f0', lineHeight: 1.4 } },
          'Без остановки растёт стресс. Высокий стресс снижает эффективность и может привести к выгоранию.'
        ),
        h('div', { style: { fontSize: '13px', color: '#f87171', fontWeight: 700 } },
          `Стресс: ${Math.round(depression || 0)}%`
        ),
        h('button', { type: 'button', style: primaryButtonStyle, onClick: goNext }, 'Дальше'),
        h('button', {
          type: 'button',
          style: { ...skipLinkStyle, opacity: skipping ? 0.6 : 1 },
          onClick: handleSkip,
          disabled: skipping,
        }, skipping ? 'Сохраняем...' : 'Пропустить обучение'),
      ]);
    }

    if (step === 4) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '14px', color: '#e2e8f0', lineHeight: 1.4 } },
          'Выполняй ежедневные квесты — получай кофе, опыт и бусты.'
        ),
        h('div', { style: { fontSize: '13px', color: '#60a5fa', fontWeight: 700 } },
          `Квестов выполнено: ${completedQuests}/${totalQuests}`
        ),
        h('button', { type: 'button', style: primaryButtonStyle, onClick: goNext }, 'Дальше'),
        h('button', {
          type: 'button',
          style: { ...skipLinkStyle, opacity: skipping ? 0.6 : 1 },
          onClick: handleSkip,
          disabled: skipping,
        }, skipping ? 'Сохраняем...' : 'Пропустить обучение'),
      ]);
    }

    // step === 5
    const nextRankByName = {
      Junior: 'Middle',
      Middle: 'Senior',
      Senior: 'Lead',
      Lead: 'CTO',
    };
    const goalText = rankName && nextRankByName[rankName]
      ? `Твоя цель: набрать достаточно коммитов, чтобы стать ${nextRankByName[rankName]}.`
      : 'Твоя цель: набирать коммиты и расти по карьерной лестнице.';

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, [
      h('div', { style: { fontSize: '15px', color: '#e2e8f0', lineHeight: 1.45 } },
        `${goalText} За обучение — бонус энергии и ☕ кофе.`
      ),
      h('button', {
        type: 'button',
        style: { ...primaryButtonStyle, opacity: completing ? 0.7 : 1 },
        onClick: handleComplete,
        disabled: completing,
      }, completing ? 'Сохраняем...' : 'Начать выживание'),
      h('button', {
        type: 'button',
        style: { ...skipLinkStyle, opacity: skipping ? 0.6 : 1 },
        onClick: handleSkip,
        disabled: skipping,
      }, skipping ? 'Сохраняем...' : 'Пропустить'),
    ]);
  };

  const cardHeader = h('div', { style: { marginBottom: '4px' } }, [
    h('div', { style: { fontSize: '12px', color: '#94a3b8', fontWeight: 600 } }, progressText),
  ]);

  const cardBody = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
    cardHeader,
    renderCardContent(),
  ]);

  return h('div', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Обучение Coder Survival',
  }, [
    showDimOverlay && h('div', {
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        pointerEvents: 'none',
      },
    }),

    isCentered && h('div', {
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: 'auto',
      },
    }, h('div', {
      style: {
        width: 'min(360px, 100%)',
        maxWidth: 'min(360px, calc(100vw - 32px))',
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '12px',
        padding: '18px',
        color: '#f8fafc',
        boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
        pointerEvents: 'auto',
      },
    }, cardBody)),

    showTooltip && h('div', { style: tooltipStyle }, cardBody),
  ]);
}
