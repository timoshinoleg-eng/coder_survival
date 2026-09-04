import { h } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useClosingConfirmation } from '../hooks/useClosingConfirmation.js';
import { Analytics } from '../utils/analytics.js';

const STEPS = [
  { key: 'tap', title: 'Коммит №1' },
  { key: 'energy', title: 'Кофе уже заканчивается' },
  { key: 'depression', title: 'Созвоны повышают стресс' },
  { key: 'quests', title: 'План на выживание' },
];

export default function OnboardingModal({ visible, onClose }) {
  const {
    tap,
    completeOnboarding,
    energy,
    depression,
    daily,
  } = useGameState();
  const [step, setStep] = useState(0);
  const [tutorialTaps, setTutorialTaps] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState('');
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
      setCompletionError('');
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
    if (completing) return;
    setCompleting(true);
    setCompletionError('');
    try {
      await completeOnboarding();
      const duration_sec = startRef.current ? Math.round((Date.now() - startRef.current) / 1000) : 0;
      Analytics.track('onboarding_completed', { duration_sec });
      onClose?.({ completed: true });
    } catch (err) {
      const message =
        err?.status === 401 || err?.status === 403
          ? 'Сессия Telegram устарела. Закройте и откройте игру заново.'
          : err?.isTimeout || err?.isNetwork
            ? 'Нет связи с игрой. Проверьте интернет и попробуйте ещё раз.'
            : 'Не удалось сохранить прогресс. Попробуйте ещё раз.';
      setCompletionError(message);
    } finally {
      setCompleting(false);
    }
  }, [completeOnboarding, completing, onClose]);

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
        background: rgba(5, 8, 18, 0.88);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
        backdrop-filter: none;
      }
      .onboarding-card {
        width: min(390px, 100%);
        border: 2px solid var(--electric-cyan);
        border-radius: 0;
        background: var(--panel-ink);
        color: var(--soft-paper);
        box-shadow: 6px 6px 0 var(--ink-base);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .onboarding-title {
        color: var(--electric-cyan);
        font-family: var(--font-pixel);
        line-height: 1.35;
      }
      .onboarding-spotlight {
        border-radius: 0;
        box-shadow: none;
      }
      .onboarding-primary {
        min-height: 48px;
        border: 1px solid var(--signal-green);
        border-radius: 0;
        background: var(--ink-base);
        color: var(--signal-green);
        font-family: var(--font-ui);
        font-weight: 800;
        font-size: var(--text-base);
        cursor: pointer;
      }
      .onboarding-secondary {
        min-height: 48px;
        border: 1px solid var(--electric-cyan);
        border-radius: 0;
        background: var(--ink-base);
        color: var(--electric-cyan);
        font-family: var(--font-ui);
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
      .onboarding-error {
        border: 1px solid var(--accent-red, #ff5c5c);
        background: rgba(127, 29, 29, 0.32);
        color: #fecaca;
        padding: 10px;
        font-size: var(--text-md);
        line-height: 1.35;
      }
      @keyframes onboardingEnergyFlash {
        0%, 100% { box-shadow: none; }
        50% { box-shadow: 0 0 12px rgba(244,166,42,0.65); }
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
          h('div', { className: 'onboarding-title', style: { fontSize: 'var(--text-xl)', fontWeight: 800 } }, current.title),
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
        h('div', { style: { fontSize: '15px', color: 'var(--text-primary)' } }, 'Сделай первый коммит. Да, без ревью и без «давай обсудим».'),
        h('button', {
          type: 'button',
          className: 'onboarding-primary',
          onClick: handleTutorialTap,
          disabled: tutorialTaps >= 1 || energy <= 0,
          style: { opacity: tutorialTaps >= 1 || energy <= 0 ? 0.65 : 1 },
        }, 'СДЕЛАТЬ КОММИТ'),
        h('div', { style: { textAlign: 'center', color: '#cbd5e1', fontWeight: 700 } },
          tutorialTaps >= 1 ? '✓ Продакшн пока не упал' : 'Один клик — один очень уверенный коммит'
        ),
      ]),

      step === 1 && h('div', {
        className: 'onboarding-energy-flash',
        style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      }, [
        h('div', { style: { fontSize: '15px', color: 'var(--text-primary)' } },
          'Энергия тратится на код, стендапы и фразу «маленькая правка».'
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
            background: 'var(--coffee-amber)',
            transition: 'width 300ms ease',
          },
        })),
        h('div', { style: { color: 'var(--text-muted)', fontSize: 'var(--text-md)' } },
          'Восстановится в паузе. Кофе — хороший план Б.'
        ),
        h('button', { type: 'button', className: 'onboarding-secondary', onClick: () => setStep(2) },
          'Понятно'
        ),
      ]),

      step === 2 && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '15px', color: 'var(--text-primary)' } },
          'Код без пауз повышает стресс. Шкала — твой ранний мониторинг инцидента.'
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
        }, 'Сделай паузу, потрать Coffee Coin в критический момент или переживи маленький рабочий апокалипсис.'),
        h('button', { type: 'button', className: 'onboarding-primary', onClick: () => setStep(3) },
          'Дальше'
        ),
      ]),

      step === 3 && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
        h('div', { style: { fontSize: '15px', color: 'var(--text-primary)' } },
          'Три квеста в день дают опыт, кофе и законное право сказать: «я сегодня был продуктивен».'
        ),
        h('div', {
          className: 'onboarding-spotlight',
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '8px',
            alignItems: 'center',
            padding: '12px',
            borderRadius: '0',
            background: 'var(--ink-base)',
            border: '1px solid var(--border-technical)',
          },
        }, [
          h('span', { style: { color: '#dbeafe', fontWeight: 700 } }, 'Дневные квесты'),
          h('span', { style: { color: 'var(--accent-green)', fontWeight: 800 } }, `${daily?.quests?.length || 3}/день`),
        ]),
        completionError && h('div', { className: 'onboarding-error', role: 'alert', 'aria-live': 'polite' }, completionError),
        h('button', {
          type: 'button',
          className: 'onboarding-primary',
          onClick: handleComplete,
          disabled: completing,
          'aria-busy': completing ? 'true' : 'false',
          style: { opacity: completing ? 0.7 : 1 },
        }, completing ? 'Сохраняем...' : 'Пережить первый рабочий день'),
      ]),
    ]),
  ]);
}
