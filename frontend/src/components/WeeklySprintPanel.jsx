import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';

const TIER_LABELS = {
  EASY: '🥉 Бронза',
  MEDIUM: '🥈 Серебро',
  HARD: '🥇 Золото'
};

const TIER_COLORS = {
  EASY: '#cd7f32',
  MEDIUM: '#c0c0c0',
  HARD: '#ffd700'
};

export default function WeeklySprintPanel() {
  const { weeklySprint, claimWeeklySprintTier, showToast } = useGameState();
  const [claiming, setClaiming] = useState(false);

  if (!weeklySprint) return null;

  const { progress, eligibleTier, tierClaimed, tiers } = weeklySprint;
  const tierEntries = Object.entries(tiers || {});

  async function handleClaim(tier) {
    if (claiming) return;
    setClaiming(true);
    try {
      const payload = await claimWeeklySprintTier(tier);
      if (payload?.claimedTier) {
        showToast(`Награда за спринт получена!`, 'success', 3000);
      } else {
        showToast('Не удалось получить награду', 'error', 2000);
      }
    } catch (err) {
      showToast('Ошибка получения награды', 'error', 2000);
    } finally {
      setClaiming(false);
    }
  }

  return h('section', {
    className: 'pixel-panel',
    style: {
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      color: '#e6edf7',
      marginTop: '8px',
    },
  }, [
    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    }, [
      h('strong', { className: 'pixel-text', style: { fontSize: '13px' } }, '🏃 Недельный спринт'),
      h('span', { style: { color: '#8ba1bb', fontSize: '11px' } }, `Неделя ${weeklySprint.weekStart || ''}`),
    ]),

    // Progress summary
    h('div', { style: { display: 'flex', gap: '12px', fontSize: '11px', color: '#8ba1bb', flexWrap: 'wrap' } }, [
      h('span', null, `Квестов: ${progress?.questsCompleted || 0}`),
      h('span', null, `Коммитов: ${progress?.commitsEarned || 0}`),
      h('span', null, `Мини-игр: ${progress?.minigamesCompleted || 0}`),
      h('span', null, `Мемов: ${progress?.memeShares || 0}`),
    ]),

    // Tier bars
    tierEntries.map(([tierName, config]) => {
      const isClaimed = tierClaimed === tierName;
      const isEligible = eligibleTier === tierName && !tierClaimed;
      const meetsCommits = (progress?.commitsEarned || 0) >= (config.targetCommits || 0);
      const meetsQuests = (progress?.questsCompleted || 0) >= (config.targetQuests || 0);
      const meetsMinigames = !config.targetMinigames || (progress?.minigamesCompleted || 0) >= config.targetMinigames;
      const meetsMemes = !config.targetMemeShares || (progress?.memeShares || 0) >= config.targetMemeShares;

      return h('div', {
        key: tierName,
        style: {
          border: isClaimed ? '1px solid #2d5a3e' : isEligible ? '1px solid #4ade80' : '1px solid #30527e',
          borderRadius: '8px',
          background: isClaimed ? '#101a24' : '#121d33',
          padding: '10px',
          opacity: isClaimed ? 0.65 : 1,
        },
      }, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } }, [
          h('span', { style: { fontWeight: 700, fontSize: '12px', color: TIER_COLORS[tierName] || '#c7ddf5' } }, TIER_LABELS[tierName] || tierName),
          h('span', { style: { fontSize: '11px', color: isClaimed ? '#4ade80' : isEligible ? '#4ade80' : '#8ba1bb' } },
            isClaimed ? '✓ Получено' : isEligible ? 'Готово к получению' : 'В процессе'
          ),
        ]),
        h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '6px' } },
          [
            `Коммиты: ${progress?.commitsEarned || 0}/${config.targetCommits || 0}`,
            config.targetQuests ? ` · Квесты: ${progress?.questsCompleted || 0}/${config.targetQuests}` : '',
            config.targetMinigames ? ` · Мини-игры: ${progress?.minigamesCompleted || 0}/${config.targetMinigames}` : '',
            config.targetMemeShares ? ` · Мемы: ${progress?.memeShares || 0}/${config.targetMemeShares}` : ''
          ].join('')
        ),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' } }, [
          h('span', { style: { color: meetsCommits ? '#4ade80' : '#ef4444' } }, meetsCommits ? '✓ Коммиты' : '○ Коммиты'),
          h('span', { style: { color: meetsQuests ? '#4ade80' : '#ef4444' } }, meetsQuests ? '✓ Квесты' : '○ Квесты'),
          config.targetMinigames && h('span', { style: { color: meetsMinigames ? '#4ade80' : '#ef4444' } }, meetsMinigames ? '✓ Мини-игры' : '○ Мини-игры'),
          config.targetMemeShares && h('span', { style: { color: meetsMemes ? '#4ade80' : '#ef4444' } }, meetsMemes ? '✓ Мемы' : '○ Мемы'),
        ]),
        isEligible && h('button', {
          onClick: () => handleClaim(tierName),
          disabled: claiming,
          style: {
            marginTop: '8px',
            minHeight: '36px',
            padding: '0 16px',
            border: '1px solid #4ade80',
            borderRadius: '6px',
            background: '#1a3f25',
            color: '#4ade80',
            fontWeight: 800,
            fontSize: '12px',
            cursor: 'pointer',
          },
        }, claiming ? 'Получаем...' : 'Забрать награду'),
      ]);
    }),
  ]);
}
