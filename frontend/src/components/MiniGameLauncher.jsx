import { h } from 'preact';
import { useState, useCallback, useEffect } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { apiRequest } from '../utils/api.js';
import MiniGameHelloWorld from './MiniGameHelloWorld.jsx';
import MiniGameCodeReview from './MiniGameCodeReview.jsx';

const GAMES = [
  {
    id: 'hello_world',
    name: 'Hello World',
    emoji: '⌨️',
    requiredLevel: 2,
    cooldownHours: 4,
    reward: '+50 коммитов, −10 стресса',
  },
  {
    id: 'code_review',
    name: 'Code Review',
    emoji: '🔍',
    requiredLevel: 4,
    cooldownHours: 6,
    reward: '+100 коммитов, −20 стресса, +10% тап',
  },
];

export default function MiniGameLauncher({ open, onClose }) {
  const { levelInRank, initData } = useGameState();
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);

  const fetchStatuses = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    const next = {};
    for (const game of GAMES) {
      try {
        const payload = await apiRequest('/api/minigame/start', {
          method: 'POST',
          initData,
          body: { gameType: game.id }
        });
        next[game.id] = payload;
      } catch {
        next[game.id] = { canPlay: false, reason: 'error' };
      }
    }
    setStatuses(next);
    setLoading(false);
  }, [open, initData]);

  useEffect(() => {
    if (open) fetchStatuses();
  }, [open, fetchStatuses]);

  if (selectedGame === 'hello_world') {
    return h(MiniGameHelloWorld, { open: true, onClose: () => { setSelectedGame(null); fetchStatuses(); } });
  }
  if (selectedGame === 'code_review') {
    return h(MiniGameCodeReview, { open: true, onClose: () => { setSelectedGame(null); fetchStatuses(); } });
  }

  if (!open) return null;

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
      width: 'min(380px, 100%)',
      maxHeight: '70vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '8px',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
    },
  }, [
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552',
      },
    }, [
      h('strong', { className: 'pixel-text' }, '🎮 Мини-игры'),
      h('button', {
        onClick: onClose,
        style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '18px', cursor: 'pointer', lineHeight: 1 },
      }, '×'),
    ]),

    h('section', { style: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      GAMES.map((game) => {
        const status = statuses[game.id];
        const locked = (levelInRank || 1) < game.requiredLevel;
        const onCooldown = status?.reason === 'cooldown';
        const canPlay = status?.canPlay === true;
        const remainingMs = status?.remainingMs || 0;
        const remainingMin = Math.ceil(remainingMs / 60000);
        const remainingHours = Math.floor(remainingMin / 60);
        const remMin = remainingMin % 60;
        const cooldownText = remainingHours > 0
          ? `Через ${remainingHours}ч ${remMin}мин`
          : `Через ${remMin}мин`;

        return h('div', {
          key: game.id,
          style: {
            border: canPlay ? '1px solid #4ade80' : '1px solid #30527e',
            borderRadius: '8px',
            background: locked ? '#0f1b30' : canPlay ? '#1a3f25' : '#121d33',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          },
        }, [
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
              h('span', { style: { fontSize: '20px' } }, game.emoji),
              h('div', null, [
                h('div', { style: { fontWeight: 700, fontSize: '13px' } }, game.name),
                h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, game.reward),
              ]),
            ]),
            h('span', {
              style: {
                fontSize: '11px',
                fontWeight: 800,
                color: canPlay ? '#4ade80' : onCooldown ? '#facc15' : '#ef4444',
              },
            }, canPlay ? 'Готово' : onCooldown ? cooldownText : locked ? `🔒 Уровень ${game.requiredLevel}` : 'Недоступно'),
          ]),
          canPlay && h('button', {
            onClick: () => setSelectedGame(game.id),
            style: {
              minHeight: '40px',
              border: '1px solid #4ade80',
              borderRadius: '6px',
              background: '#052e16',
              color: '#4ade80',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
            },
          }, '▶ Играть'),
        ]);
      })
    ),
  ]));
}
