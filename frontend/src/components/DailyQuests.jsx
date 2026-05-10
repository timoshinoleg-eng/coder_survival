import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';

function rewardText(reward = {}) {
  const parts = [];
  if (reward.energy) parts.push(`+${reward.energy} энергии`);
  if (reward.xp) parts.push(`+${reward.xp} XP`);
  if (reward.passXp) parts.push(`+${reward.passXp} pass`);
  if (reward.commitsCurrent) parts.push(`+${reward.commitsCurrent} коммитов`);
  if (reward.stars) parts.push(`+${reward.stars} Stars`);
  if (reward.inventory?.coffee_cups) parts.push(`+${reward.inventory.coffee_cups} кофе`);
  if (reward.skinFragment) parts.push('фрагмент скина');
  return parts.join(' · ') || 'Награда';
}

function questTitle(quest) {
  if (quest.isEvent || quest.id === 'q_event_bonus') return 'LiveOps бонус';
  const titles = {
    q_login: 'Открыть рабочий день',
    q_tap40: 'Разогнать IDE',
    q_coffee: 'Кофейный спринт',
    q_bugfix: 'Поймать крит',
    q_commit50: 'Закрыть задачу',
    q_review: 'Заглянуть на ревью',
    q_night30: 'Вечерний рывок',
    q_share: 'Поделиться прогрессом',
  };
  return titles[quest.id] || quest.id;
}

function windowLabel(quest) {
  if (quest.windowStart === '09:00') return 'Утренний';
  if (quest.windowStart === '12:00') return 'Дневной';
  if (quest.windowStart === '18:00') return 'Вечерний';
  return 'Весь день';
}

export default function DailyQuests() {
  const { daily, quests, claimQuests, claimFullClear, refreshQuests } = useGameState();
  const [claiming, setClaiming] = useState(false);
  const [openingChest, setOpeningChest] = useState(false);
  const list = quests || daily?.quests || [];

  async function handleClaim() {
    if (claiming) return;
    setClaiming(true);
    try {
      await claimQuests();
      await refreshQuests();
    } finally {
      setClaiming(false);
    }
  }

  async function handleFullClear() {
    if (openingChest) return;
    setOpeningChest(true);
    window.setTimeout(async () => {
      try {
        await claimFullClear();
      } finally {
        setOpeningChest(false);
      }
    }, 3000);
  }

  return h('section', {
    style: {
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      color: '#e6edf7',
    },
  }, [
    h('style', null, `
      @keyframes questGoldPulse { 0%, 100% { box-shadow: 0 0 0 rgba(250,204,21,0); } 50% { box-shadow: 0 0 18px rgba(250,204,21,0.45); } }
      @keyframes chestOpen { 0% { transform: scale(1) rotate(0); } 40% { transform: scale(1.08) rotate(-2deg); } 100% { transform: scale(1) rotate(0); } }
    `),
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
    }, [
      h('strong', { style: { fontSize: '13px' } }, 'Дневные квесты'),
      h('span', { style: { color: '#8ba1bb', fontSize: '11px' } },
        `${daily?.completed || list.filter((quest) => quest.completed).length}/${list.length || 5}`
      ),
    ]),
    list.map((quest) => {
      const progress = quest.target > 0 ? Math.round((quest.progress / quest.target) * 100) : 0;
      const claimable = quest.completed && !quest.claimed;
      return h('div', {
        key: quest.id,
        style: {
          border: quest.isEvent ? '1px solid #facc15' : claimable ? '1px solid #facc15' : quest.claimed ? '1px solid #2d5a3e' : '1px solid #30527e',
          borderRadius: '8px',
          background: quest.isEvent ? '#2b210d' : quest.claimed ? '#101a24' : '#121d33',
          opacity: quest.claimed ? 0.65 : 1,
          padding: '10px',
          animation: claimable ? 'questGoldPulse 1.6s infinite' : 'none',
        },
      }, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } }, [
            h('div', null, [
              h('div', { style: { fontWeight: 700, fontSize: '12px' } }, questTitle(quest)),
            h('div', { style: { color: '#8ba1bb', fontSize: '11px', marginTop: '2px' } }, rewardText(quest.reward)),
            h('div', { style: { color: '#60a5fa', fontSize: '10px', marginTop: '3px' } },
              quest.windowStart ? `${windowLabel(quest)} · ${quest.windowStart}-${quest.windowEnd}` : windowLabel(quest)
            ),
          ]),
          h('span', {
            style: {
              color: quest.claimed ? '#4ade80' : claimable ? '#facc15' : '#60a5fa',
              fontSize: '12px',
              fontWeight: 800,
            },
          }, quest.claimed ? '✓' : `${quest.progress}/${quest.target}`),
        ]),
        h('div', {
          style: {
            height: '6px',
            marginTop: '8px',
            borderRadius: '999px',
            background: '#0f3460',
            overflow: 'hidden',
          },
        }, h('div', {
          style: {
            width: `${Math.min(100, progress)}%`,
            height: '100%',
            background: quest.completed ? '#facc15' : '#60a5fa',
            transition: 'width 250ms ease',
          },
        })),
      ]);
    }),
    list.some((quest) => quest.completed && !quest.claimed) && h('button', {
      type: 'button',
      onClick: handleClaim,
      disabled: claiming,
      style: {
        minHeight: '44px',
        border: 'none',
        borderRadius: '8px',
        background: '#4ade80',
        color: '#052e16',
        fontWeight: 800,
      },
    }, claiming ? 'Забираем...' : 'Забрать награды'),
    daily?.fullClearAvailable && h('button', {
      type: 'button',
      onClick: handleFullClear,
      disabled: openingChest,
      style: {
        minHeight: '52px',
        border: '1px solid #facc15',
        borderRadius: '8px',
        background: 'linear-gradient(90deg, #5a3e00, #b7791f)',
        color: '#fff7d6',
        fontWeight: 900,
        animation: openingChest ? 'chestOpen 700ms infinite' : 'questGoldPulse 1.4s infinite',
      },
    }, openingChest ? '🎁 Открываем сундук...' : '🎁 Full Clear бонус'),
  ]);
}
