import { h } from 'preact';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';
import { apiRequest } from '../utils/api.js';

const ROUNDS = [
  {
    question: 'Какой у вас TAM?',
    options: [
      { label: 'Очень большой', correct: false },
      { label: '12B$ с CAGR 24%', correct: true }
    ]
  },
  {
    question: 'Когда бизнес станет прибыльным?',
    options: [
      { label: 'Через 18 месяцев', correct: true },
      { label: 'Мы focused на growth', correct: false }
    ]
  },
  {
    question: 'Какая у вас moat?',
    options: [
      { label: 'Нет конкурентов', correct: false },
      { label: 'Патенты + сетевой эффект', correct: true }
    ]
  }
];

const TIME_PER_ROUND = 30;

export default function MiniGameIPO({ open, onClose }) {
  const { showToast } = useGameState();
  const { haptic, initData } = useTelegram();
  const [phase, setPhase] = useState('ready');
  const [roundIndex, setRoundIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timer, setTimer] = useState(TIME_PER_ROUND);
  const [reward, setReward] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const intervalRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetGame = useCallback(() => {
    clearTimer();
    setPhase('ready');
    setRoundIndex(0);
    setCorrectCount(0);
    setTimer(TIME_PER_ROUND);
    setReward(null);
  }, [clearTimer]);

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
      resetGame();
    } else {
      audioManager.resumeFromModal();
      resetGame();
    }
    return () => clearTimer();
  }, [open, resetGame, clearTimer]);

  const startGame = useCallback(async () => {
    try {
      const startPayload = await apiRequest('/api/minigame/start', {
        method: 'POST',
        initData,
        body: { gameType: 'ipo' }
      });
      if (!startPayload?.canPlay) {
        const reason = startPayload?.reason;
        if (reason === 'level_too_low') {
          showToast(`Доступно с уровня ${startPayload.requiredLevel}`, 'error', 2500);
        } else if (reason === 'cooldown') {
          const hours = Math.ceil((startPayload.remainingMs || 0) / 3600000);
          showToast(`Кулдаун: ${hours} ч`, 'error', 2500);
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
    setRoundIndex(0);
    setCorrectCount(0);
    setTimer(TIME_PER_ROUND);
  }, [haptic, initData, showToast]);

  useEffect(() => {
    if (phase === 'playing') {
      setTimer(TIME_PER_ROUND);
      intervalRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearTimer();
            finishGame(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearTimer();
  }, [phase, roundIndex, clearTimer]);

  const handleAnswer = useCallback((isCorrect) => {
    clearTimer();
    if (isCorrect) {
      haptic('light');
      setCorrectCount(prev => prev + 1);
    } else {
      haptic('error');
    }

    const nextIndex = roundIndex + 1;
    if (nextIndex >= ROUNDS.length) {
      const finalScore = isCorrect ? correctCount + 1 : correctCount;
      finishGame(finalScore);
    } else {
      setRoundIndex(nextIndex);
    }
  }, [roundIndex, correctCount, haptic, clearTimer]);

  const finishGame = useCallback(async (score) => {
    setPhase('result');
    try {
      setClaiming(true);
      const payload = await apiRequest('/api/minigame/complete', {
        method: 'POST',
        initData,
        body: { gameType: 'ipo', score }
      });
      setReward(payload?.reward || null);
      if (payload?.success) {
        showToast(`IPO одобрено! +${payload?.reward?.commits || 1000} коммитов`, 'success', 3000);
      } else {
        showToast('Инвесторы отказали. Попробуй через неделю!', 'error', 2500);
      }
    } catch (err) {
      showToast('Ошибка сохранения результата', 'error', 2000);
    } finally {
      setClaiming(false);
    }
  }, [initData, showToast]);

  if (!open) return null;

  const round = phase === 'playing' ? ROUNDS[roundIndex] : null;

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
      h('strong', { style: { fontSize: '14px' } }, '📈 IPO — Питч инвесторам'),
      h('button', {
        onClick: onClose,
        style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }
      }, '×'),
    ]),

    phase === 'ready' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '16px', lineHeight: 1.6 } },
        '3 вопроса инвесторов.\nТаймер 30 сек на вопрос.\nВсе ответы должны быть верными.'
      ),
      h('div', { style: { fontSize: '11px', color: '#60a5fa', marginBottom: '16px' } },
        'Награда: +1000 коммитов, −50 стресса, скин CTO'
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
      }, '▶ Начать питч'),
    ]),

    phase === 'playing' && round && h('div', null, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
        h('span', { style: { fontSize: '11px', color: '#8ba1bb' } }, `Вопрос ${roundIndex + 1} / ${ROUNDS.length}`),
        h('span', { style: { fontSize: '11px', color: timer <= 5 ? '#ef4444' : '#facc15' } }, `⏱ ${timer}с`)
      ]),
      h('div', {
        style: {
          width: '100%',
          height: '4px',
          background: '#0f3460',
          borderRadius: '2px',
          marginBottom: '16px',
          overflow: 'hidden'
        }
      }, h('div', {
        style: {
          width: `${(timer / TIME_PER_ROUND) * 100}%`,
          height: '100%',
          background: timer <= 5 ? '#ef4444' : '#60a5fa',
          transition: 'width 1s linear'
        }
      })),
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
      }, `Инвестор: «${round.question}»`),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        round.options.map((opt, idx) => h('button', {
          key: idx,
          onClick: () => handleAnswer(opt.correct),
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
        }, opt.label))
      )
    ]),

    phase === 'result' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '20px', marginBottom: '8px' } },
        reward?.skin ? '🎉' : '💥'
      ),
      h('div', { style: { fontSize: '14px', fontWeight: 700, color: reward?.skin ? '#4ade80' : '#ef4444', marginBottom: '8px' } },
        reward?.skin ? 'IPO одобрено!' : 'Инвесторы отказали...'
      ),
      h('div', { style: { fontSize: '12px', color: '#8ba1bb', marginBottom: '12px' } },
        `Правильных ответов: ${reward ? ROUNDS.length : correctCount} / ${ROUNDS.length}`
      ),
      reward && h('div', { style: { fontSize: '12px', color: '#60a5fa', marginBottom: '16px' } },
        `+${reward.commits || 0} коммитов · −${reward.depressionRelief || 0} стресса${reward.skin ? ` · скин ${reward.skin}` : ''}`
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
