import { h } from 'preact';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';
import { apiRequest } from '../utils/api.js';

const GRID_SIZE = 9;
const BUG_COUNT = 3;
const GAME_DURATION_MS = 15000;

const SNIPPETS = [
  { text: 'if (x = 5)', bug: true },
  { text: 'return null;' },
  { text: 'const x = 42;' },
  { text: 'while (true)', bug: true },
  { text: 'console.log(x)' },
  { text: 'break;' },
  { text: 'if (!x)', bug: true },
  { text: 'throw err;' },
  { text: 'yield x;' },
  { text: 'await foo()' },
  { text: 'delete x;' },
  { text: 'typeof x' },
];

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateGrid() {
  const pool = shuffle(SNIPPETS);
  const selected = pool.slice(0, GRID_SIZE);
  // Ensure exactly BUG_COUNT bugs
  let bugIndices = [];
  selected.forEach((s, i) => { if (s.bug) bugIndices.push(i); });
  while (bugIndices.length < BUG_COUNT) {
    const idx = Math.floor(Math.random() * GRID_SIZE);
    if (!bugIndices.includes(idx)) {
      selected[idx] = { ...selected[idx], bug: true };
      bugIndices.push(idx);
    }
  }
  while (bugIndices.length > BUG_COUNT) {
    const remove = bugIndices.pop();
    selected[remove] = { ...selected[remove], bug: false };
  }
  return selected.map((s, i) => ({
    id: i,
    text: s.text,
    hasBug: s.bug || false,
    revealed: false,
    found: false,
  }));
}

export default function MiniGameCodeReview({ open, onClose }) {
  const { showToast } = useGameState();
  const { haptic, initData } = useTelegram();
  const [phase, setPhase] = useState('ready');
  const [grid, setGrid] = useState([]);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS);
  const [foundCount, setFoundCount] = useState(0);
  const [success, setSuccess] = useState(false);
  const [reward, setReward] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  const resetGame = useCallback(() => {
    setPhase('ready');
    setGrid([]);
    setTimeLeft(GAME_DURATION_MS);
    setFoundCount(0);
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
        body: { gameType: 'code_review' }
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
    setGrid(generateGrid());
    setFoundCount(0);
    setSuccess(false);
    setReward(null);
    startTimeRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining > 0 && rafRef.current !== null) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (remaining <= 0) {
        finishGame(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = setTimeout(() => {
      finishGame(false);
    }, GAME_DURATION_MS);
  }, [haptic, initData, showToast]);

  const finishGame = useCallback(async (won) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPhase('result');
    setSuccess(won);

    try {
      setClaiming(true);
      const payload = await apiRequest('/api/minigame/complete', {
        method: 'POST',
        initData,
        body: { gameType: 'code_review', score: won ? 3 : 0 }
      });
      setReward(payload?.reward || null);
      if (won) {
        showToast(`Все баги найдены! +${payload?.reward?.commits || 100} коммитов`, 'success', 3000);
      } else {
        showToast('Баги ушли в прод... Попробуй ещё через 6 часов', 'error', 2500);
      }
    } catch (err) {
      showToast('Ошибка сохранения результата', 'error', 2000);
    } finally {
      setClaiming(false);
    }
  }, [initData, showToast]);

  const handleReveal = useCallback((id) => {
    if (phase !== 'playing') return;
    setGrid(prev => {
      const cell = prev[id];
      if (cell.revealed) return prev;
      const next = prev.map((c, i) => i === id ? { ...c, revealed: true, found: c.hasBug } : c);
      const newFound = next.filter(c => c.found).length;
      setFoundCount(newFound);
      if (cell.hasBug) {
        audioManager.play('bugSuccess');
        haptic('success');
        if (newFound >= BUG_COUNT) {
          setTimeout(() => finishGame(true), 300);
        }
      } else {
        audioManager.play('tap');
        haptic('light');
      }
      return next;
    });
  }, [phase, finishGame, haptic]);

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
      h('strong', { style: { fontSize: '14px' } }, 'Code Review'),
      h('button', {
        onClick: onClose,
        style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }
      }, '×'),
    ]),

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
        'Найди 3 бага в коде за 15 секунд.\nКликай на подозрительные строки.'
      ),
      h('div', { style: { fontSize: '11px', color: '#60a5fa', marginBottom: '16px' } },
        'Награда: +100 коммитов, −20 стресса, +10% к тапу 10 мин'
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
      }, '▶ Начать ревью'),
    ]),

    phase === 'playing' && h('div', null, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
        h('span', { style: { fontSize: '12px', color: '#8ba1bb' } }, `Найдено: ${foundCount}/${BUG_COUNT}`),
        h('span', { style: { fontSize: '12px', color: '#facc15' } }, `${(timeLeft / 1000).toFixed(1)}с`),
      ]),
      h('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
        },
      }, grid.map((cell) => h('button', {
        key: cell.id,
        onClick: () => handleReveal(cell.id),
        disabled: cell.revealed,
        style: {
          minHeight: '64px',
          border: cell.revealed
            ? cell.hasBug ? '2px solid #ef4444' : '2px solid #4ade80'
            : '1px solid #30527e',
          borderRadius: '6px',
          background: cell.revealed
            ? cell.hasBug ? '#3f1a1a' : '#1a3f25'
            : '#121d33',
          color: cell.revealed
            ? cell.hasBug ? '#fca5a5' : '#dcfce7'
            : '#c7ddf5',
          fontSize: '11px',
          fontFamily: "'Courier New', monospace",
          cursor: cell.revealed ? 'default' : 'pointer',
          padding: '6px',
          textAlign: 'center',
          wordBreak: 'break-word',
        },
      }, cell.revealed
        ? cell.hasBug ? '🐛 ' + cell.text : '✓ ' + cell.text
        : cell.text
      ))),
    ]),

    phase === 'result' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '20px', marginBottom: '8px' } }, success ? '🎉' : '💥'),
      h('div', { style: { fontSize: '14px', fontWeight: 700, color: success ? '#4ade80' : '#ef4444', marginBottom: '8px' } },
        success ? 'Все баги исправлены! Ship it!' : 'Баги ушли в прод...'
      ),
      success && reward && h('div', { style: { fontSize: '12px', color: '#60a5fa', marginBottom: '16px' } },
        `+${reward.commits || 0} коммитов · −${reward.depressionRelief || 0} стресса` +
        (reward.tapBoostPercent ? ` · +${reward.tapBoostPercent}% к тапу` : '')
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
