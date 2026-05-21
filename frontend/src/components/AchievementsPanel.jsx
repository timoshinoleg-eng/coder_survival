import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const ACHIEVEMENT_ICONS = {
  tap_master: '👆',
  commit_king: '👑',
  legacy_zone: '🏛️',
  night_shift_30: '🌙',
  burnout_first: '🔥',
  coffee_addict: '☕',
  meme_lord: '🎭',
  bug_hunter: '🐛',
  referral_god: '🤝',
  prod_survivor: '💥',
};

const SEEN_STORAGE_KEY = 'cs_seen_achievements';

function achievementIcon(id) {
  return ACHIEVEMENT_ICONS[id] || '🏆';
}

export default function AchievementsPanel({ open, onClose }) {
  const { achievements, rankName, commits, streakDays, depression } = useGameState();
  const { shareText, haptic } = useTelegram();
  const [sharingId, setSharingId] = useState(null);

  if (!open) return null;

  async function handleShare(achievement) {
    if (sharingId) return;
    setSharingId(achievement.id);
    haptic('success');
    try {
      const url = `${API_BASE_URL}/api/meme/achievement?achievementId=${achievement.id}`;
      const text = `🏆 Разблокировано: «${achievement.name}» в Coder Survival!\n${achievement.description}\n${rankName || 'Junior'} | ${commits || 0} коммитов`;
      shareText(text + '\n' + url);
    } finally {
      setSharingId(null);
    }
  }

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
      h('strong', { className: 'pixel-text' }, 'Достижения'),
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
    h('section', {
      style: {
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      },
    }, [
      (achievements || []).map((ach) => {
        const progress = ach.target > 0 ? Math.round((ach.progress / ach.target) * 100) : 0;
        const completed = ach.completed === true;
        return h('div', {
          key: ach.id,
          style: {
            border: completed ? '1px solid #facc15' : '1px solid #30527e',
            borderRadius: '8px',
            background: completed ? '#2b210d' : '#121d33',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          },
        }, [
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
              h('span', { style: { fontSize: '20px' } }, achievementIcon(ach.achievement_id)),
              h('div', null, [
                h('div', { style: { fontWeight: 700, fontSize: '12px' } }, ach.name),
                h('div', { style: { color: '#8ba1bb', fontSize: '11px', marginTop: '2px' } }, ach.description),
              ]),
            ]),
            h('span', {
              style: {
                color: completed ? '#facc15' : '#60a5fa',
                fontSize: '12px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              },
            }, completed ? '✅' : `${ach.progress}/${ach.target}`),
          ]),
          h('div', {
            style: {
              height: '6px',
              borderRadius: '999px',
              background: '#0f3460',
              overflow: 'hidden',
            },
          }, h('div', {
            style: {
              width: `${Math.min(100, progress)}%`,
              height: '100%',
              background: completed ? '#facc15' : '#60a5fa',
              transition: 'width 250ms ease',
            },
          })),
          completed && h('button', {
            type: 'button',
            onClick: () => handleShare(ach),
            disabled: sharingId === ach.id,
            style: {
              marginTop: '4px',
              minHeight: '36px',
              border: '1px solid #facc15',
              borderRadius: '6px',
              background: '#3b2f10',
              color: '#facc15',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            },
          }, sharingId === ach.id ? 'Открываем Telegram...' : '🎭 Позориться'),
        ]);
      }),
      (!achievements || achievements.length === 0) && h('div', {
        style: { color: '#8ba1bb', fontSize: '12px', textAlign: 'center', padding: '20px' }
      }, 'Достижения загружаются...'),
    ]),
  ]));
}
