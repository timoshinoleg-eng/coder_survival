import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';

export default function StreakCalendar() {
  const { streak, claimStreak } = useGameState();
  const [claiming, setClaiming] = useState(false);
  const days = streak?.calendar || [];
  const loggedInToday = streak?.loggedInToday === true;

  async function handleClaim() {
    if (claiming || loggedInToday) return;
    setClaiming(true);
    try {
      await claimStreak();
    } finally {
      setClaiming(false);
    }
  }

  return h('section', {
    style: {
      padding: '8px 12px 4px',
      background: '#0f1b30',
      borderBottom: '1px solid #1a3a5c',
      color: '#e6edf7',
    },
  }, [
    h('style', null, '@keyframes todayPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }'),
    h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'space-between' } },
      days.map((day) => {
        const isToday = day.status === 'today';
        const done = day.status === 'done';
        const missed = day.status === 'missed';
        return h('div', {
          key: day.date,
          title: day.date,
          style: {
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: isToday ? '2px solid #facc15' : done ? '2px solid #4ade80' : '1px solid #475569',
            background: done ? '#166534' : missed ? '#3f1a1a' : 'transparent',
            color: missed ? '#ef4444' : done ? '#dcfce7' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            animation: isToday && !loggedInToday ? 'todayPulse 1.2s infinite' : 'none',
          },
        }, missed ? '×' : done ? '✓' : '·');
      }),
    ),
    h('div', {
      style: {
        marginTop: '6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
      },
    }, [
      h('span', null, `Текущая серия: ${streak?.currentStreak || 0} дней`),
      h('span', { style: { color: '#60a5fa' } },
        `🛡 ${streak?.protection?.freeUsed ? 0 : 1}+${Math.max(0, 2 - Number(streak?.protection?.starSavesUsed || 0))}`
      ),
    ]),
    !loggedInToday && h('button', {
      type: 'button',
      onClick: handleClaim,
      disabled: claiming,
      style: {
        marginTop: '8px',
        width: '100%',
        minHeight: '44px',
        border: '1px solid #facc15',
        borderRadius: '8px',
        background: '#3b2f10',
        color: '#facc15',
        fontWeight: 800,
      },
    }, claiming ? 'Сохраняем серию...' : 'Зайди сегодня, чтобы продолжить!'),
  ]);
}
