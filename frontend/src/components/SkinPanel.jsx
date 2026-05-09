import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';

const SKIN_CATALOG = [
  {
    skinId: 'legacy_archaeologist',
    name: 'Археолог legacy',
    description: 'Переписал 1000 строк легаси без единого бага',
    rarity: 'rare',
    color: '#60a5fa',
    bgGradient: ['#1a3a5c', '#0f1b30'],
    emoji: '🏛️'
  },
  {
    skinId: 'night_shift',
    name: 'Ночная смена',
    description: '7 дней подряд в игре',
    rarity: 'epic',
    color: '#c084fc',
    bgGradient: ['#2d1a4a', '#1a0f2e'],
    emoji: '🌙'
  },
  {
    skinId: 'burnout_survivor',
    name: 'Выживший после burnout',
    description: 'Воскресил персонажа после 100% стресса',
    rarity: 'legendary',
    color: '#facc15',
    bgGradient: ['#5a3e2d', '#3f2a1a'],
    emoji: '🔥'
  },
  {
    skinId: 'stack_overflow_guru',
    name: 'Stack Overflow Guru',
    description: 'Достиг ранга Senior',
    rarity: 'common',
    color: '#4ade80',
    bgGradient: ['#1a3f25', '#0f2a1a'],
    emoji: '📚'
  },
  {
    skinId: 'deploy_hero',
    name: 'Герой деплоя',
    description: 'Сделал 10 000 коммитов',
    rarity: 'legendary',
    color: '#ef4444',
    bgGradient: ['#5a2d2d', '#3f1a1a'],
    emoji: '🚀'
  },
  {
    skinId: 'coffee_addict',
    name: 'Кофеман',
    description: 'Выпил 50 чашек кофе',
    rarity: 'common',
    color: '#fb923c',
    bgGradient: ['#3f2a1a', '#2a1a0f'],
    emoji: '☕'
  }
];

const RARITY_LABELS = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный'
};

export default function SkinPanel({ open, onClose }) {
  const { skins, showToast } = useGameState();
  const { haptic } = useTelegram();
  const [selectedSkin, setSelectedSkin] = useState(null);

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
    } else {
      audioManager.resumeFromModal();
      setSelectedSkin(null);
    }
  }, [open]);

  if (!open) return null;

  const unlockedSet = new Set(skins?.unlocked || []);
  const equippedId = skins?.equipped || null;

  const handleSelect = (skin) => {
    haptic('light');
    setSelectedSkin(skin);
  };

  const isEquipped = (skinId) => skinId === equippedId;
  const isUnlocked = (skinId) => unlockedSet.has(skinId);

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 45,
      background: 'rgba(7, 12, 24, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 12px',
      animation: 'fade-in-up 0.25s ease-out'
    }
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      width: 'min(420px, 100%)',
      maxHeight: '85vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '8px',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, [
    // Header
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552'
      }
    }, [
      h('strong', null, '🎭 Скины'),
      h('button', {
        onClick: onClose,
        style: {
          border: 'none',
          background: 'transparent',
          color: '#9eb6d2',
          fontSize: '18px',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1
        }
      }, '×')
    ]),

    // Equipped indicator
    equippedId && h('div', {
      style: {
        padding: '10px 14px',
        fontSize: '12px',
        color: '#9eb6d2',
        borderBottom: '1px solid #1f3552'
      }
    }, [
      'Экипировано: ',
      h('span', { style: { color: '#facc15', fontWeight: 'bold' } },
        SKIN_CATALOG.find(s => s.skinId === equippedId)?.name || equippedId
      )
    ]),

    // Grid
    h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '10px',
        padding: '14px'
      }
    }, SKIN_CATALOG.map((skin) => {
      const unlocked = isUnlocked(skin.skinId);
      const equipped = isEquipped(skin.skinId);
      return h('div', {
        key: skin.skinId,
        onClick: () => handleSelect(skin),
        style: {
          background: equipped ? 'rgba(255,255,255,0.08)' : '#131d33',
          borderRadius: '8px',
          padding: '12px',
          border: equipped ? `2px solid ${skin.color}` : unlocked ? '1px solid #1f3552' : '1px solid #0f1b30',
          opacity: unlocked ? 1 : 0.5,
          cursor: unlocked ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
          textAlign: 'center'
        }
      }, [
        h('div', {
          style: {
            width: '56px',
            height: '56px',
            margin: '0 auto 8px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${skin.bgGradient[0]}, ${skin.bgGradient[1]})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            border: `2px solid ${unlocked ? skin.color : '#1f3552'}`
          }
        }, skin.emoji),
        h('div', {
          style: {
            fontSize: '12px',
            fontWeight: 600,
            color: unlocked ? '#e6edf7' : '#6b7f99',
            marginBottom: '2px'
          }
        }, skin.name),
        h('div', {
          style: {
            fontSize: '10px',
            color: skin.color,
            fontWeight: 'bold',
            marginBottom: '4px'
          }
        }, RARITY_LABELS[skin.rarity]),
        equipped && h('div', {
          style: {
            fontSize: '10px',
            color: '#4ade80',
            fontWeight: 'bold'
          }
        }, '✓ Экипировано'),
        !unlocked && h('div', {
          style: {
            fontSize: '10px',
            color: '#6b7f99'
          }
        }, '🔒 Заблокировано')
      ]);
    })),

    // Selected skin detail
    selectedSkin && isUnlocked(selectedSkin.skinId) && h('div', {
      style: {
        padding: '0 14px 14px',
        borderTop: '1px solid #1f3552',
        marginTop: '4px',
        paddingTop: '12px'
      }
    }, [
      h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: selectedSkin.color, marginBottom: '4px' } }, selectedSkin.name),
      h('div', { style: { fontSize: '11px', color: '#9eb6d2', marginBottom: '10px' } }, selectedSkin.description),
      !isEquipped(selectedSkin.skinId) && h('button', {
        onClick: () => {
          haptic('success');
          audioManager.play('questDone');
          // TODO: call API to equip skin when Model A provides endpoint
          showToast('Скин экипирован (локально)', 'success', 1500);
        },
        style: {
          width: '100%',
          padding: '8px 0',
          borderRadius: '6px',
          border: 'none',
          background: selectedSkin.color,
          color: '#0a0a0a',
          fontWeight: 'bold',
          fontSize: '12px',
          cursor: 'pointer'
        }
      }, 'Экипировать')
    ])
  ]));
}
