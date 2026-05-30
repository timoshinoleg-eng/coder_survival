import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';

const STEPS = [
  {
    title: '👋 Добро пожаловать в Coder Survival!',
    subtitle: 'Карьерный кликер для программистов',
    items: [
      { icon: '👆', title: 'Тапай, чтобы кодить', desc: 'Каждый тап = коммиты. Чем выше ранг, тем больше коммитов за тап.' },
      { icon: '⚡', title: 'Следи за энергией', desc: 'Энергия тратится на каждый тап. Не дай выгоранию победить!' }
    ]
  },
  {
    title: '📈 Прогрессия и ранги',
    subtitle: 'От Junior до CTO',
    items: [
      { icon: '🚀', title: 'Повышай ранг', desc: 'Набирай XP, повышай уровень и открывай новые звания.' },
      { icon: '💀', title: 'Контролируй стресс', desc: 'Высокий стресс снижает эффективность. Следи за индикатором.' }
    ]
  },
  {
    title: '🎯 Квесты и магазин',
    subtitle: 'Ежедневные задачи и бусты',
    items: [
      { icon: '📋', title: 'Ежедневные квесты', desc: 'Выполняй задания, получай награды и поддерживай стрик.' },
      { icon: '🛒', title: 'Магазин', desc: 'Покупай энергетики, терапию и бусты через Telegram Stars.' }
    ]
  }
];

export default function OnboardingOverlay({ visible, onDismiss }) {
  const [step, setStep] = useState(0);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onDismiss?.();
    }
  }, [step, onDismiss]);

  const handleSkip = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  if (!visible) return null;

  const current = STEPS[step];

  return h('div', {
    onClick: handleSkip,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      background: 'rgba(10, 16, 30, 0.92)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      animation: 'fade-in-up 0.35s ease-out'
    }
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      width: 'min(360px, 100%)',
      background: '#131d33',
      border: '1px solid #274267',
      borderRadius: '14px',
      padding: '22px 18px',
      color: '#e6edf7',
      textAlign: 'center',
      boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }
  }, [
    h('div', null, [
      h('div', { style: { fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' } }, current.title),
      h('div', { style: { fontSize: '12px', color: '#8ba1bb' } }, current.subtitle)
    ]),

    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' } },
      current.items.map((item, idx) => h('div', {
        key: idx,
        style: { display: 'flex', alignItems: 'flex-start', gap: '10px' }
      }, [
        h('span', { style: { fontSize: '22px', lineHeight: 1 } }, item.icon),
        h('div', null, [
          h('div', { style: { fontWeight: 600, fontSize: '13px' } }, item.title),
          h('div', { style: { fontSize: '12px', color: '#8ba1bb' } }, item.desc)
        ])
      ]))
    ),

    // Dots
    h('div', { style: { display: 'flex', justifyContent: 'center', gap: '6px' } },
      STEPS.map((_, idx) => h('div', {
        key: idx,
        style: {
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: idx === step ? '#4ade80' : '#274267',
          transition: 'background 0.25s ease'
        }
      }))
    ),

    h('div', { style: { display: 'flex', gap: '8px' } }, [
      h('button', {
        onClick: handleSkip,
        style: {
          flex: 1,
          padding: '10px',
          borderRadius: '10px',
          border: '1px solid #30527e',
          background: 'transparent',
          color: '#9eb6d2',
          fontWeight: 600,
          fontSize: '14px',
          cursor: 'pointer'
        }
      }, 'Пропустить'),
      h('button', {
        onClick: handleNext,
        style: {
          flex: 1,
          padding: '10px',
          borderRadius: '10px',
          border: 'none',
          background: '#4ade80',
          color: '#0a1f12',
          fontWeight: 'bold',
          fontSize: '14px',
          cursor: 'pointer'
        }
      }, step < STEPS.length - 1 ? 'Далее' : 'Начать кодить!')
    ])
  ]));
}
