import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useAchievements } from '../hooks/useAchievements.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { apiRequest } from '../utils/api.js';

const RARITY_STYLES = {
  common:    { border: '#4a5568', glow: 'none', bg: '#1a202c' },
  rare:      { border: '#3182ce', glow: '0 0 8px rgba(49,130,206,0.3)', bg: '#1a365d' },
  epic:      { border: '#805ad5', glow: '0 0 12px rgba(128,90,213,0.4)', bg: '#2d1b4e' },
  legendary: { border: '#d69e2e', glow: '0 0 16px rgba(214,158,46,0.5)', bg: '#3d2a0a' },
};

const CATEGORY_LABELS = {
  taps: '👆 Тапы',
  coins: '💰 Монеты',
  rank: '📈 Ранг',
  skins: '👕 Скины',
  battles: '⚔️ Битвы',
  combo: '🔥 Комбо',
  special: '⭐ Особое',
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'Все' },
  { key: 'earned', label: 'Получено' },
  { key: 'progress', label: 'В прогрессе' },
  { key: 'locked', label: 'Заблокировано' },
];

function getCardState(ach) {
  if (ach.earned_at && ach.claimed_at) return 'claimed';
  if (ach.earned_at && !ach.claimed_at) return 'earned';
  if (ach.percent > 0 || (ach.current_value && ach.current_value > 0)) return 'progress';
  return 'locked';
}

function formatReward(reward) {
  if (!reward) return '';
  const parts = [];
  if (reward.coins) parts.push(`💰 ${reward.coins}`);
  if (reward.xp) parts.push(`⭐ ${reward.xp}`);
  if (reward.title) parts.push(`🏆 Титул`);
  if (reward.badge) parts.push(`🎖️ Бейдж`);
  if (reward.skin_unlock) parts.push(`👕 Скин`);
  return parts.join(' · ');
}

export default function AchievementsPanel({ open, onClose }) {
  const { initData } = useTelegram();
  const {
    achievements,
    loading,
    error,
    claiming,
    fetchAchievements,
    claimAchievement,
  } = useAchievements(initData);

  const [filter, setFilter] = useState('all');
  const [claimError, setClaimError] = useState(null);

  useEffect(() => {
    if (open) {
      fetchAchievements();
    }
  }, [open, fetchAchievements]);

  const filtered = useMemo(() => {
    if (!achievements?.length) return [];
    switch (filter) {
      case 'earned':
        return achievements.filter((a) => a.earned_at && !a.claimed_at);
      case 'progress':
        return achievements.filter((a) => !a.earned_at && (a.percent > 0 || a.current_value > 0));
      case 'locked':
        return achievements.filter((a) => !a.earned_at && (!a.percent || a.percent === 0));
      default:
        return achievements;
    }
  }, [achievements, filter]);

  const handleClaim = async (slug) => {
    setClaimError(null);
    try {
      await claimAchievement(slug);
    } catch (err) {
      setClaimError(err.message || 'Не удалось забрать награду');
      setTimeout(() => setClaimError(null), 3000);
    }
  };

  if (!open) return null;

  return h('div', {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      background: 'rgba(7, 12, 24, 0.85)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '12px',
      overflowY: 'auto',
    },
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      width: 'min(480px, 100%)',
      maxHeight: '90vh',
      overflowY: 'auto',
      background: '#0f172a',
      border: '1px solid #1e3a5f',
      borderRadius: '12px',
      color: '#e2e8f0',
      display: 'flex',
      flexDirection: 'column',
    },
  }, [
    // Header
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 16px',
        borderBottom: '1px solid #1e3a5f',
        position: 'sticky',
        top: 0,
        background: '#0f172a',
        zIndex: 2,
      },
    }, [
      h('div', null, [
        h('strong', { className: 'pixel-text', style: { fontSize: '16px' } }, '🏆 Достижения'),
        h('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '2px' } },
          `${achievements.filter((a) => a.earned_at).length} / ${achievements.length}`
        ),
      ]),
      h('button', {
        onClick: onClose,
        style: {
          border: 'none',
          background: 'transparent',
          color: '#94a3b8',
          fontSize: '22px',
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
        },
      }, '×'),
    ]),

    // Filters
    h('div', {
      style: {
        display: 'flex',
        gap: '6px',
        padding: '10px 12px',
        borderBottom: '1px solid #1e3a5f',
        overflowX: 'auto',
      },
    }, FILTER_OPTIONS.map((f) => h('button', {
      key: f.key,
      onClick: () => setFilter(f.key),
      style: {
        padding: '6px 12px',
        borderRadius: '6px',
        border: filter === f.key ? '1px solid #60a5fa' : '1px solid #334155',
        background: filter === f.key ? '#1e3a5f' : '#1e293b',
        color: filter === f.key ? '#60a5fa' : '#94a3b8',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
    }, f.label))),

    // Error
    claimError && h('div', {
      style: {
        margin: '8px 12px 0',
        padding: '8px 12px',
        background: '#450a0a',
        border: '1px solid #7f1d1d',
        borderRadius: '6px',
        color: '#fca5a5',
        fontSize: '12px',
      },
    }, claimError),

    // Grid
    h('div', {
      style: {
        padding: '10px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '8px',
      },
    }, [
      loading && h('div', {
        style: { gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' },
      }, 'Загрузка...'),

      error && !loading && h('div', {
        style: { gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#ef4444', fontSize: '13px' },
      }, `Ошибка: ${error}`),

      !loading && filtered.map((ach) => {
        const state = getCardState(ach);
        const rarity = RARITY_STYLES[ach.rarity] || RARITY_STYLES.common;
        const isSecretLocked = ach.is_secret && !ach.earned_at;

        return h('div', {
          key: ach.slug,
          style: {
            border: `1.5px solid ${state === 'earned' ? '#fbbf24' : rarity.border}`,
            borderRadius: '10px',
            background: state === 'claimed' ? '#0f172a' : rarity.bg,
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            opacity: state === 'locked' ? 0.55 : 1,
            boxShadow: state === 'earned' ? '0 0 12px rgba(251,191,36,0.3)' : rarity.glow,
            transition: 'all 200ms ease',
            minHeight: '140px',
          },
        }, [
          // Rarity + State badge
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            h('span', {
              style: {
                fontSize: '9px',
                textTransform: 'uppercase',
                fontWeight: 800,
                color: rarity.border,
                letterSpacing: '0.5px',
              },
            }, ach.rarity),
            state === 'earned' && h('span', { style: { fontSize: '16px' } }, '🎁'),
            state === 'claimed' && h('span', { style: { fontSize: '14px', color: '#22c55e' } }, '✓'),
            state === 'locked' && isSecretLocked && h('span', { style: { fontSize: '14px' } }, '🔒'),
          ]),

          // Name
          h('div', {
            style: {
              fontWeight: 700,
              fontSize: '12px',
              lineHeight: 1.3,
              color: state === 'locked' && isSecretLocked ? '#475569' : '#e2e8f0',
            },
          }, isSecretLocked ? '???' : ach.name),

          // Description
          !isSecretLocked && h('div', {
            style: { fontSize: '10px', color: '#94a3b8', lineHeight: 1.3 },
          }, ach.description),

          // Progress bar (progressive or in-progress)
          (state === 'progress' || (ach.is_progressive && !ach.earned_at)) && h('div', null, [
            h('div', {
              style: {
                height: '5px',
                borderRadius: '999px',
                background: '#1e293b',
                overflow: 'hidden',
                marginTop: '2px',
              },
            }, h('div', {
              style: {
                width: `${Math.min(100, ach.percent || 0)}%`,
                height: '100%',
                background: '#60a5fa',
                transition: 'width 300ms ease',
              },
            })),
            h('div', {
              style: { fontSize: '10px', color: '#64748b', marginTop: '2px', textAlign: 'right' },
            }, `${ach.current_value || 0} / ${ach.target_value || ach.criteria?.target || '?'}`),
          ]),

          // Reward preview
          state !== 'locked' && h('div', {
            style: { fontSize: '10px', color: '#fbbf24', marginTop: 'auto' },
          }, formatReward(ach.reward)),

          // Claim button
          state === 'earned' && h('button', {
            onClick: () => handleClaim(ach.slug),
            disabled: claiming === ach.slug,
            style: {
              marginTop: '4px',
              padding: '6px 0',
              borderRadius: '6px',
              border: '1px solid #fbbf24',
              background: '#451a03',
              color: '#fbbf24',
              fontWeight: 700,
              fontSize: '11px',
              cursor: 'pointer',
              opacity: claiming === ach.slug ? 0.6 : 1,
            },
          }, claiming === ach.slug ? '...' : 'Забрать'),
        ]);
      }),

      !loading && !error && filtered.length === 0 && h('div', {
        style: { gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' },
      }, 'Нет достижений в этой категории'),
    ]),
  ]));
}
