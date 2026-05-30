import { h } from 'preact';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';
import { apiRequest } from '../utils/api.js';

const CARDS = [
  {
    scenario: 'CTO предлагает мигрировать всё на Rust',
    left: { label: 'Согласиться', deltas: { techDebt: -15, teamMood: -10, budget: -15 } },
    right: { label: 'Отказать', deltas: { techDebt: 10, teamMood: 10, budget: 5 } }
  },
  {
    scenario: 'Прод упал в пятницу вечером',
    left: { label: 'Фиксить срочно', deltas: { techDebt: -10, teamMood: -15, budget: -10 } },
    right: { label: 'Откатить', deltas: { techDebt: 5, teamMood: 5, budget: -5 } }
  },
  {
    scenario: 'Инвесторы требуют сократить команду',
    left: { label: 'Сократить', deltas: { techDebt: 5, teamMood: -20, budget: 15 } },
    right: { label: 'Убедить не трогать', deltas: { techDebt: -5, teamMood: 10, budget: -10 } }
  },
  {
    scenario: 'Нужно добавить AI в продукт',
    left: { label: 'Интегрировать', deltas: { techDebt: -10, teamMood: 5, budget: -15 } },
    right: { label: 'Отложить', deltas: { techDebt: 10, teamMood: -5, budget: 5 } }
  },
  {
    scenario: 'Техдолг достиг критической массы',
    left: { label: 'Рефакторинг', deltas: { techDebt: -20, teamMood: -5, budget: -10 } },
    right: { label: 'Игнорировать', deltas: { techDebt: 15, teamMood: 10, budget: 5 } }
  }
];

const SCALE_COLORS = {
  techDebt: '#ef4444',
  teamMood: '#4ade80',
  budget: '#60a5fa'
};

const SCALE_LABELS = {
  techDebt: 'Техдолг',
  teamMood: 'Команда',
  budget: 'Бюджет'
};

export default function MiniGameArchitecturalCommittee({ open, onClose }) {
  const { showToast } = useGameState();
  const { haptic, initData } = useTelegram();
  const [phase, setPhase] = useState('ready');
  const [scales, setScales] = useState({ techDebt: 50, teamMood: 50, budget: 50 });
  const [cardIndex, setCardIndex] = useState(0);
  const [reward, setReward] = useState(null);
  const [claiming, setClaiming] = useState(false);

  const resetGame = useCallback(() => {
    setPhase('ready');
    setScales({ techDebt: 50, teamMood: 50, budget: 50 });
    setCardIndex(0);
    setReward(null);
  }, []);

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
      resetGame();
    } else {
      audioManager.resumeFromModal();
      resetGame();
    }
  }, [open, resetGame]);

  const startGame = useCallback(async () => {
    try {
      const startPayload = await apiRequest('/api/minigame/start', {
        method: 'POST',
        initData,
        body: { gameType: 'architectural_committee' }
      });
      if (!startPayload?.canPlay) {
        const reason = startPayload?.reason;
        if (reason === 'level_too_low') {
          showToast(`Доступно с уровня ${startPayload.requiredLevel}`, 'error', 2500);
        } else if (reason === 'cooldown') {
          const mins = Math.ceil((startPayload.remainingMs || 0) / 60000);
          showToast(`Кулдаун: ${mins} мин`, 'error', 2500);
        } else {
          showToast('Мини-игра недоступна', 'error', 2500);
        }
        return;
      }
    } catch (err) {
      showToast('Не удалось начать игру', 'error', 2000);
      return;
    }

    haptic('heavy');
    setPhase('playing');
    setScales({ techDebt: 50, teamMood: 50, budget: 50 });
    setCardIndex(0);
    setReward(null);
  }, [haptic, initData, showToast]);

  const handleChoice = useCallback((deltas) => {
    haptic('light');
    const nextScales = {
      techDebt: Math.max(0, Math.min(100, scales.techDebt + deltas.techDebt)),
      teamMood: Math.max(0, Math.min(100, scales.teamMood + deltas.teamMood)),
      budget: Math.max(0, Math.min(100, scales.budget + deltas.budget))
    };
    const nextIndex = cardIndex + 1;
    if (nextIndex >= CARDS.length) {
      const success = Object.values(nextScales).every(v => v >= 20 && v <= 80);
      finishGame(success);
    } else {
      setScales(nextScales);
      setCardIndex(nextIndex);
    }
  }, [scales, cardIndex, haptic]);

  const finishGame = useCallback(async (success) => {
    setPhase('result');
    try {
      setClaiming(true);
      const payload = await apiRequest('/api/minigame/complete', {
        method: 'POST',
        initData,
        body: { gameType: 'architectural_committee', score: success ? 1 : 0 }
      });
      setReward(payload?.reward || null);
      if (payload?.success) {
        showToast(`Комитет одобрил архитектуру! +${payload?.reward?.commits || 500} коммитов`, 'success', 3000);
      } else {
        showToast('Комитет развалился. Попробуй завтра!', 'error', 2500);
      }
    } catch (err) {
      showToast('Ошибка сохранения результата', 'error', 2000);
    } finally {
      setClaiming(false);
    }
  }, [initData, showToast]);

  if (!open) return null;

  const card = phase === 'playing' ? CARDS[cardIndex] : null;

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'rgba(7, 12, 24, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 12px',
    },
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      width: 'min(400px, 100%)',
      background: '#0f1b30',
      border: '1px solid #1a3a5c',
      borderRadius: '10px',
      color: '#e6edf7',
      padding: '20px',
      boxShadow: '0 18px 48px rgba(0,0,0,0.4)',
      fontFamily: "'Press Start 2P', 'Courier New', monospace",
    },
  }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } }, [
      h('strong', { style: { fontSize: '14px' } }, '🏛️ Архитектурный комитет'),
      h('button', {
        onClick: onClose,
        style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }
      }, '×'),
    ]),

    // Scales
    phase !== 'ready' && h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' } },
      Object.entries(scales).map(([key, value]) => h('div', { key, style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        h('span', { style: { fontSize: '10px', color: '#8ba1bb', minWidth: '80px' } }, SCALE_LABELS[key]),
        h('div', {
          style: { flex: 1, height: '8px', background: '#0f3460', borderRadius: '4px', overflow: 'hidden' }
        }, h('div', {
          style: {
            width: `${value}%`,
            height: '100%',
            background: SCALE_COLORS[key],
            transition: 'width 0.4s ease'
          }
        })),
        h('span', { style: { fontSize: '10px', color: SCALE_COLORS[key], minWidth: '28px', textAlign: 'right' } }, value)
      ]))
    ),

    phase === 'ready' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '16px', lineHeight: 1.6 } },
        '5 решений. 3 шкалы.\nДержи баланс между 20 и 80.'
      ),
      h('div', { style: { fontSize: '11px', color: '#60a5fa', marginBottom: '16px' } },
        'Награда: +500 коммитов, −40 стресса, ачивка'
      ),
      h('button', {
        onClick: startGame,
        style: {
          minHeight: '48px',
          padding: '0 24px',
          border: '1px solid #4ade80',
          borderRadius: '8px',
          background: '#1a3f25',
          color: '#4ade80',
          fontWeight: 800,
          fontSize: '13px',
          cursor: 'pointer',
        },
      }, '▶ Созвать комитет'),
    ]),

    phase === 'playing' && card && h('div', null, [
      h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '12px' } },
        `Решение ${cardIndex + 1} / ${CARDS.length}`
      ),
      h('div', {
        style: {
          fontSize: '13px',
          fontWeight: 700,
          marginBottom: '20px',
          lineHeight: 1.5,
          padding: '12px',
          background: '#131d33',
          borderRadius: '8px',
          border: '1px solid #30527e'
        }
      }, card.scenario),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        h('button', {
          onClick: () => handleChoice(card.left.deltas),
          style: {
            minHeight: '52px',
            padding: '10px 14px',
            border: '1px solid #30527e',
            borderRadius: '8px',
            background: '#122642',
            color: '#c7ddf5',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
            textAlign: 'left'
          }
        }, [
          h('div', null, card.left.label),
          h('div', { style: { fontSize: '10px', color: '#8ba1bb', marginTop: '4px' } },
            `ТД ${card.left.deltas.techDebt > 0 ? '+' : ''}${card.left.deltas.techDebt} · К ${card.left.deltas.teamMood > 0 ? '+' : ''}${card.left.deltas.teamMood} · Б ${card.left.deltas.budget > 0 ? '+' : ''}${card.left.deltas.budget}`
          )
        ]),
        h('button', {
          onClick: () => handleChoice(card.right.deltas),
          style: {
            minHeight: '52px',
            padding: '10px 14px',
            border: '1px solid #30527e',
            borderRadius: '8px',
            background: '#122642',
            color: '#c7ddf5',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
            textAlign: 'left'
          }
        }, [
          h('div', null, card.right.label),
          h('div', { style: { fontSize: '10px', color: '#8ba1bb', marginTop: '4px' } },
            `ТД ${card.right.deltas.techDebt > 0 ? '+' : ''}${card.right.deltas.techDebt} · К ${card.right.deltas.teamMood > 0 ? '+' : ''}${card.right.deltas.teamMood} · Б ${card.right.deltas.budget > 0 ? '+' : ''}${card.right.deltas.budget}`
          )
        ])
      ])
    ]),

    phase === 'result' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '20px', marginBottom: '8px' } },
        Object.values(scales).every(v => v >= 20 && v <= 80) ? '🎉' : '💥'
      ),
      h('div', { style: { fontSize: '14px', fontWeight: 700, color: Object.values(scales).every(v => v >= 20 && v <= 80) ? '#4ade80' : '#ef4444', marginBottom: '8px' } },
        Object.values(scales).every(v => v >= 20 && v <= 80) ? 'Архитектура одобрена!' : 'Комитет развалился...'
      ),
      h('div', { style: { fontSize: '12px', color: '#8ba1bb', marginBottom: '12px' } },
        `Итоги: ТД ${scales.techDebt} · Команда ${scales.teamMood} · Бюджет ${scales.budget}`
      ),
      reward && h('div', { style: { fontSize: '12px', color: '#60a5fa', marginBottom: '16px' } },
        `+${reward.commits || 0} коммитов · −${reward.depressionRelief || 0} стресса`
      ),
      h('button', {
        onClick: onClose,
        style: {
          minHeight: '44px',
          padding: '0 20px',
          border: '1px solid #30527e',
          borderRadius: '8px',
          background: '#122642',
          color: '#c7ddf5',
          fontWeight: 700,
          cursor: 'pointer',
        },
      }, 'Закрыть'),
    ]),
  ]));
}
