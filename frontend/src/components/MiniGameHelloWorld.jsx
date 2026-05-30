import { h } from 'preact';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';
import { apiRequest } from '../utils/api.js';

const KEYS = ['W', 'A', 'S', 'D', 'Enter'];
const GAME_DURATION_MS = 3000;

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MiniGameHelloWorld({ open, onClose }) {
  const { showToast, levelInRank } = useGameState();
  const { haptic, initData } = useTelegram();
  const [phase, setPhase] = useState('ready'); // ready | playing | result
  const [sequence, setSequence] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS);
  const [success, setSuccess] = useState(false);
  const [reward, setReward] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  const resetGame = useCallback(() => {
    setPhase('ready');
    setSequence([]);
    setCurrentIndex(0);
    setTimeLeft(GAME_DURATION_MS);
    setSuccess(false);
    setReward(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
      resetGame();
    } else {
      audioManager.resumeFromModal();
      resetGame();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, resetGame]);

  const startGame = useCallback(async () => {
    try {
      const startPayload = await apiRequest('/api/minigame/start', {
        method: 'POST',
        initData,
        body: { gameType: 'hello_world' }
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
    audioManager.play('typing');
    setPhase('playing');
    setSequence(shuffle(KEYS));
    setCurrentIndex(0);
    setSuccess(false);
    setReward(null);
    startTimeRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        finishGame(false, currentIndexRef.current);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = setTimeout(() => {
      finishGame(false, currentIndexRef.current);
    }, GAME_DURATION_MS);
  }, [haptic, initData, showToast]);

  const currentIndexRef = useRef(0);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const finishGame = useCallback(async (won, finalScore) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase('result');
    setSuccess(won);

    try {
      setClaiming(true);
      const payload = await apiRequest('/api/minigame/complete', {
        method: 'POST',
        initData,
        body: { gameType: 'hello_world', score: won ? 5 : finalScore }
      });
      setReward(payload?.reward || null);
      if (won) {
        showToast(`Hello World скомпилирован! +${payload?.reward?.commits || 50} коммитов`, 'success', 3000);
      } else {
        showToast('Segmentation fault... Попробуй ещё через 4 часа', 'error', 2500);
      }
    } catch (err) {
      showToast('Ошибка сохранения результата', 'error', 2000);
    } finally {
      setClaiming(false);
    }
  }, [initData, showToast]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const handleKeyDown = (e) => {
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const expected = sequence[currentIndexRef.current];
      if (key === expected || (expected === 'Enter' && key === 'Enter')) {
        audioManager.play('tap');
        haptic('light');
        const nextIndex = currentIndexRef.current + 1;
        setCurrentIndex(nextIndex);
        currentIndexRef.current = nextIndex;
        if (nextIndex >= sequence.length) {
          finishGame(true, sequence.length);
        }
      } else {
        // Wrong key — fail immediately
        finishGame(false, currentIndexRef.current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, sequence, finishGame, haptic]);

  if (!open) return null;

  const progressPct = phase === 'playing' ? Math.max(0, (timeLeft / GAME_DURATION_MS) * 100) : 100;

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
      width: 'min(380px, 100%)',
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
      h('strong', { style: { fontSize: '14px' } }, 'Hello World'),
      h('button', {
        onClick: onClose,
        style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }
      }, '×'),
    ]),

    // Timer bar
    h('div', {
      style: { height: '6px', background: '#0f3460', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }
    }, h('div', {
      style: {
        width: `${progressPct}%`,
        height: '100%',
        background: progressPct > 50 ? '#4ade80' : progressPct > 20 ? '#facc15' : '#ef4444',
        transition: phase === 'playing' ? 'none' : 'width 0.3s ease',
      }
    })),

    phase === 'ready' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '16px', lineHeight: 1.6 } },
        'Набери 5 клавиш за 3 секунды.\nОшибка = мгновенный провал.'
      ),
      h('div', { style: { fontSize: '11px', color: '#60a5fa', marginBottom: '16px' } },
        'Награда: +50 коммитов, −10 стресса'
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
      }, '▶ Начать компиляцию'),
    ]),

    phase === 'playing' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '12px', color: '#8ba1bb', marginBottom: '12px' } },
        `Время: ${(timeLeft / 1000).toFixed(2)}с`
      ),
      h('div', {
        style: {
          display: 'flex',
          gap: '10px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '12px',
        },
      }, sequence.map((key, i) => h('div', {
        key: i,
        style: {
          width: '48px',
          height: '48px',
          borderRadius: '8px',
          border: i === currentIndex ? '2px solid #facc15' : i < currentIndex ? '2px solid #4ade80' : '2px solid #30527e',
          background: i < currentIndex ? '#1a3f25' : '#0f1b30',
          color: i === currentIndex ? '#facc15' : i < currentIndex ? '#4ade80' : '#8ba1bb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '14px',
          animation: i === currentIndex ? 'pulse 0.8s infinite' : 'none',
        },
      }, key))),
    ]),

    phase === 'result' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '20px', marginBottom: '8px' } }, success ? '🎉' : '💥'),
      h('div', { style: { fontSize: '14px', fontWeight: 700, color: success ? '#4ade80' : '#ef4444', marginBottom: '8px' } },
        success ? 'Hello World скомпилирован!' : 'Segmentation fault...'
      ),
      success && reward && h('div', { style: { fontSize: '12px', color: '#60a5fa', marginBottom: '16px' } },
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
