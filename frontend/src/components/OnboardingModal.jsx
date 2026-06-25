import { h } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useClosingConfirmation } from '../hooks/useClosingConfirmation.js';
import { Analytics } from '../utils/analytics.js';

const STEPS = [
  { key: 'tap', title: 'Напиши код' },
  { key: 'energy', title: 'Следи за энергией' },
  { key: 'depression', title: 'Депрессия — реальность' },
  { key: 'quests', title: 'Задания дают бонусы' },
];

export default function OnboardingModal({ visible, onClose }) {
  const {
    tap,
    completeOnboarding,
    energy,
    depression,
    daily,
    loading,
  } = useGameState();
  const [step, setStep] = useState(0);
  const [tutorialTaps, setTutorialTaps] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const current = STEPS[step];
  const startRef = useRef(null);
  const prevStepRef = useRef(0);
  useClosingConfirmation(visible);

  useEffect(() => {
    if (visible) {
      Analytics.track('onboarding_started');
      startRef.current = Date.now();
      setStep(0);
      setTutorialTaps(0);
      setTooltipOpen(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && step > 0) {
      Analytics.track('onboarding_step_completed', { step: prevStepRef.current + 1, total_steps: STEPS.length });
    }
    prevStepRef.current = step;
  }, [step, visible]);

  const fakeDepression = useMemo(() => {
    const pct = Math.round(((depression || 0) / 200) * 100);
    if (step !== 2) return Math.min(100, pct);
    return Math.min(100, Math.max(pct, tutorialTaps * 2));
  }, [depression, step, tutorialTaps]);

  const handleTutorialTap = useCallback(() => {
    if (tutorialTaps >= 1 || energy <= 0) return;
    tap();
    const next = tutorialTaps + 1;
    setTutorialTaps(next);
    if (next >= 1) {
      window.setTimeout(() => setStep(1), 350);
    }
  }, [energy, tap, tutorialTaps]);

  const handleComplete = useCallback(async () => {
    if (completing || loading) return;
    setCompleting(true);
    try {
      await completeOnboarding();
      const duration_sec = startRef.current ? Math.round((Date.now() - startRef.current) / 1000) : 0;
      Analytics.track('onboarding_completed', { duration_sec });
      onClose?.({ completed: true });
    } finally {
      setCompleting(false);
    }
  }, [completeOnboarding, completing, loading, onClose]);

  const handleClose = useCallback(() => {
    console.log('onboarding_skipped');
    onClose?.({ completed: false });
  }, [onClose]);

  if (!visible) return null;

  return h('div', { className: 'onboarding-overlay' }, [
    h('style', null, `
      .onboarding-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.85);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
        backdrop-filter: blur(4px);
      }
      .onboarding-card {
        width: min(375px, 100%);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 12px;
        background: #111827;
        color: #f8fafc;
        box-shadow: 0 24px 70px rgba(0,0,0,0.45);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .onboarding-spotlight {
        border-radius: 12px;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.85);
      }
      .onboarding-primary {
        min-height: 44px;
        border: 0;
        border-radius: 10px;
        background: var(--accent-green);
        color: #052e16;
        font-weight: 800;
        font-size: 15px;
        cursor: pointer;
      }
      .onboarding-secondary {
        min-height: 44px;
        border: 1px solid var(--border-panel);
        border-radius: 10px;
        background: #172033;
        color: #dbeafe;
        font-weight: 700;
        cursor: pointer;
      }
      .onboarding-close {
        min-width: 44px;
        min-height: 44px;
        border: 0;
        background: transparent;
        color: var(--text-muted);
        font-size: 24px;
        cursor: pointer;
      }
      .onboarding-energy-flash {
        animation: onboardingEnergyFlash 700ms ease-out;
      }
      @keyframes onboardingEnergyFlash {
        0%, 100% { box-shadow: none; }
        50% { box-shadow: 0 0 18px rgba(239,68,68,0.9); }
      }
    `),
    h('div', { className: 'onboarding-card' }, [
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        },
      }, [
        h('div', null, [
          h('div', { style: { fontSize: 'var(--text-2xl)', fontWeight: 800 } }, current.title),
          h('div', { style: { fontSize: 'var(--text-base)', color: 'var(--text-muted)', marginTop: '3px' } },
            `${step + 1}/${STEPS.length}`
          ),
        ]),
        h('button', {
          type: 'button',
          className: 'onboarding-close',
          onClick: handleClose,
          title: 'Закрыть',
        }, '×'),
      ]),

      step === 0 && h('div', {
        className: 'onboarding-spotlight',
        style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      }, [
        h('div', { style: { fontSize: '15px', color: 'var(--text-primary)' } }, 'Тапай, чтобы кодить'),
        h('button', {
          type: 'button',
          className: 'onboarding-primary',
          onClick: handleTutorialTap,
          disabled: tutorialTaps >= 1 || energy <= 0,
          style: { opacity: tutorialTaps >= 1 || energy <= 0 ? 0.65 : 1 },
        }, '💻 КОДИТЬ'),
        h('div', { style: { textAlign: 'center', color: '#cbd5e1', fontWeight: 700 } },
          `${tutorialTaps}/1`
        ),
      ]),

      step === 1 && h('div', {
        className: 'onboarding-energy-flash',
        style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      }, [
        h('div', { style: { fontSize: '15px', color: 'var(--text-primary)' } },
          'Энергия тратится. Отдохни — восстановится'
        ),
        h('div', {
          style: {
            height: '10px',
            borderRadius: '999px',
            background: 'var(--border-subtle)',
            overflow: 'hidden',
          },
        }, h('div', {
          style: {
            width: `${Math.max(0, Math.min(100, Math.round(energy)))}%`,
            height: '100%',
            background: 'var(--danger)',
            transition: 'width 300ms ease',
          },
        })),
        h('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--text-md)' } },
          'Полное восстановление через 4:32'
        ),
        h('button', { type: 'button', className: 'onboarding-secondary', onClick: () => setStep(2) },
          'Понятно'
        ),
      ]),

      step === 2 && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '15px', color: 'var(--text-primary)' } },
          'Код без отдыха = стресс. Следи за шкалой'
        ),
        h('div', {
          style: {
            height: '10px',
            borderRadius: '999px',
            background: 'var(--border-subtle)',
            overflow: 'hidden',
          },
        }, h('div', {
          style: {
            width: `${fakeDepression}%`,
            height: '100%',
            background: fakeDepression >= 4 ? 'var(--accent-gold)' : 'var(--accent-green)',
            transition: 'width 450ms ease, background 450ms ease',
          },
        })),
        h('div', { style: { color: '#cbd5e1', fontWeight: 700 } }, `${fakeDepression}%`),
        h('button', {
          type: 'button',
          className: 'onboarding-secondary',
          onClick: () => setTooltipOpen((value) => !value),
        }, 'Как сбросить?'),
        tooltipOpen && h('div', {
          style: {
            padding: '10px',
            borderRadius: '8px',
            background: 'var(--bg-deep)',
            color: '#dbeafe',
            fontSize: 'var(--text-md)',
          },
        }, 'Отдыхай, энергия восстановится, стресс упадёт'),
        h('button', { type: 'button', className: 'onboarding-primary', onClick: () => setStep(3) },
          'Дальше'
        ),
      ]),

      step === 3 && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '15px', color: 'var(--text-primary)' } },
          'Выполняй 3 квеста в день — получай кофе и опыт'
        ),
        h('div', {
          className: 'onboarding-spotlight',
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '8px',
            alignItems: 'center',
            padding: '12px',
            borderRadius: '10px',
            background: '#172033',
            border: '1px solid var(--border-panel)',
          },
        }, [
          h('span', { style: { color: '#dbeafe', fontWeight: 700 } }, 'Дневные квесты'),
          h('span', { style: { color: 'var(--accent-green)', fontWeight: 800 } }, `${daily?.quests?.length || 3}/день`),
        ]),
        h('button', {
          type: 'button',
          className: 'onboarding-primary',
          onClick: handleComplete,
          disabled: completing,
          style: { opacity: completing ? 0.7 : 1 },
        }, completing ? 'Сохраняем...' : 'Начать выживание'),
      ]),
    ]),
  ]);
}
