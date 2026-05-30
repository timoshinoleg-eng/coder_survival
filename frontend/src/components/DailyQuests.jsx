import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';

function rewardText(reward = {}) {
  const parts = [];
  if (reward.energy) parts.push(`+${reward.energy} энергии`);
  if (reward.xp) parts.push(`+${reward.xp} XP`);
  if (reward.passXp) parts.push(`+${reward.passXp} pass`);
  if (reward.commitsCurrent) parts.push(`+${reward.commitsCurrent} LOC`);
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
    q_tap50: 'Разогнать IDE',
    q_tap300: 'Разогнать IDE',
    q_coffee: 'Кофейный спринт',
    q_bugfix: 'Поймать крит',
    q_commit50: 'Закрыть задачу',
    q_commit100: 'Закрыть задачу',
    q_earn10000: 'Выдать 10k LOC',
    q_review: 'Заглянуть на ревью',
    q_night30: 'Вечерний рывок',
    q_share: 'Поделиться прогрессом',
    q_bonus_tap: 'Бонус: тапы',
    q_bonus_crit: 'Бонус: крит',
    q_bonus_commit: 'Бонус: коммиты',
    q_bonus_watch_ad: 'Бонус: реклама',
    q_bonus_buy_generator: 'Бонус: генератор',
  };
  return titles[quest.id] || quest.id;
}

function questHint(quest) {
  if (quest.type === 'watch_ad') return 'Открой рекламную награду, когда энергия просядет.';
  if (quest.type === 'buy_generator') return 'Купи любого генератора в панели ⚙.';
  if (quest.type === 'commit_total') return 'Любой earned LOC идёт в прогресс этого задания.';
  return null;
}

export default function DailyQuests({ modal = false, open = true, onClose }) {
  const { daily, quests, antiCheat, claimQuests, claimFullClear } = useGameState();
  const [claiming, setClaiming] = useState(false);
  const [openingChest, setOpeningChest] = useState(false);
  const list = quests || daily?.quests || [];

  if (modal && !open) return null;

  async function handleClaim() {
    if (claiming) return;
    setClaiming(true);
    try {
      await claimQuests();
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

  const content = h('section', {
    className: modal ? '' : 'pixel-panel',
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
      h('strong', { className: 'pixel-text', style: { fontSize: '13px' } }, 'Дневные квесты'),
      h('span', { style: { color: '#8ba1bb', fontSize: '11px' } },
        `${daily?.completed || list.filter((quest) => quest.completed).length}/${list.length || 5}`
      ),
    ]),
    (daily?.avgDailyFarm || daily?.accountAgeDays) && h('div', {
      style: {
        fontSize: '11px',
        color: '#8ba1bb',
        padding: '6px 8px',
        borderRadius: '6px',
        background: '#0f1b30',
        border: '1px solid #1f3552',
      }
    }, [
      daily?.avgDailyFarm ? h('div', null, `Средний дневной фарм: ${daily.avgDailyFarm} LOC`) : null,
      daily?.accountAgeDays ? h('div', null, `Возраст аккаунта: ${daily.accountAgeDays} дн.`) : null,
    ]),
    antiCheat?.banScore >= 20 && h('div', {
      style: {
        fontSize: '11px',
        color: '#fca5a5',
        padding: '6px 8px',
        borderRadius: '6px',
        background: '#3f1a1a',
        border: '1px solid #5a2d2d',
      }
    }, `Anti-cheat penalty active: tier ${antiCheat.sanctionTier}. Часть наград сейчас снижена.`),
    list.map((quest) => {
      const progress = quest.target > 0 ? Math.round((quest.progress / quest.target) * 100) : 0;
      const claimable = quest.completed && !quest.claimed;
      const isBonus = quest.isBonus === true;
      return h('div', {
        key: quest.id,
        className: isBonus ? 'pixel-panel' : '',
        style: {
          border: isBonus ? '1px solid #facc15' : quest.isEvent ? '1px solid #facc15' : claimable ? '1px solid #facc15' : quest.claimed ? '1px solid #2d5a3e' : '1px solid #30527e',
          borderRadius: '8px',
          background: isBonus ? '#2b210d' : quest.isEvent ? '#2b210d' : quest.claimed ? '#101a24' : '#121d33',
          opacity: quest.claimed ? 0.65 : 1,
          padding: '10px',
          animation: claimable ? 'questGoldPulse 1.6s infinite' : 'none',
        },
      }, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } }, [
          h('div', null, [
            h('div', { style: { fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' } }, [
              questTitle(quest),
              isBonus && h('span', { style: { fontSize: '10px', color: '#facc15', fontWeight: 800 } }, '⭐ Бонус'),
            ]),
            h('div', { style: { color: '#8ba1bb', fontSize: '11px', marginTop: '2px' } }, rewardText(quest.reward)),
            questHint(quest) && h('div', { style: { color: '#60a5fa', fontSize: '10px', marginTop: '4px' } }, questHint(quest)),
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
      className: 'pixel-button',
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
      className: 'pixel-button',
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

  if (!modal) return content;

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'rgba(7, 12, 24, 0.78)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '16px 12px',
    },
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      width: 'min(420px, 100%)',
      maxHeight: '70vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '8px',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
    },
  }, [
    onClose && h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552',
      },
    }, [
      h('strong', { className: 'pixel-text' }, 'Дневные квесты'),
      h('button', {
        onClick: onClose,
        className: 'pixel-button',
        style: {
          border: 'none',
          background: 'transparent',
          color: '#9eb6d2',
          fontSize: '18px',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        },
      }, '×'),
    ]),
    content,
  ]));
}
