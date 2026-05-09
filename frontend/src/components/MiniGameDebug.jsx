import { h } from 'preact';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';
import { apiRequest } from '../utils/api.js';

const GAME_DURATION_MS = 3000;
const BUG_COUNT = 6;

function randomPosition(containerWidth, containerHeight, bugSize) {
  const padding = 40;
  return {
    x: padding + Math.random() * (containerWidth - padding * 2 - bugSize),
    y: padding + Math.random() * (containerHeight - padding * 2 - bugSize)
  };
}

export default function MiniGameDebug({ open, onClose }) {
  const { showToast, depression } = useGameState();
  const { haptic } = useTelegram();
  const [phase, setPhase] = useState('ready'); // ready | playing | result
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS);
  const [bugs, setBugs] = useState([]);
  const [claimed, setClaimed] = useState(false);
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  const resetGame = useCallback(() => {
    setPhase('ready');
    setScore(0);
    setTimeLeft(GAME_DURATION_MS);
    setBugs([]);
    setClaimed(false);
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

  const startGame = useCallback(() => {
    haptic('heavy');
    audioManager.play('typing');
    setPhase('playing');
    setScore(0);
    setClaimed(false);
    startTimeRef.current = Date.now();

    // Spawn bugs
    const container = containerRef.current;
    const w = container?.clientWidth || 300;
    const h = container?.clientHeight || 300;
    const newBugs = Array.from({ length: BUG_COUNT }, (_, i) => ({
      id: i,
      ...randomPosition(w, h, 44),
      visible: false,
      caught: false,
      spawnAt: 200 + i * 350
    }));
    setBugs(newBugs);

    // Reveal bugs progressively
    newBugs.forEach((bug) => {
      setTimeout(() => {
        setBugs(prev => prev.map(b => b.id === bug.id ? { ...b, visible: true } : b));
      }, bug.spawnAt);
    });

    // Game timer
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPhase('result');
        audioManager.play('bugSuccess');
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [haptic]);

  const catchBug = useCallback((bugId) => {
    if (phase !== 'playing') return;
    haptic('light');
    audioManager.play('tap');
    setBugs(prev => prev.map(b => b.id === bugId ? { ...b, caught: true, visible: false } : b));
    setScore(s => s + 1);
  }, [phase, haptic]);

  const handleClaim = useCallback(async () => {
    if (claimed) return;
    setClaimed(true);

    // Try backend API first; fallback to local toast if endpoint doesn't exist yet
    try {
      const payload = await apiRequest('/api/minigame/debug', {
        method: 'POST',
        initData: window.Telegram?.WebApp?.initData || ''
      });
      if (payload?.success) {
        showToast(`Отладка завершена! Награда получена`, 'success', 2000);
        onClose();
        return;
      }
    } catch (_e) {
      // Backend endpoint not available yet — show local reward
    }

    // Local fallback reward
    const rewardText = score >= 3
      ? `−5 стресса, +10 коммитов (локально)`
      : `+${score * 2} коммитов (локально)`;
    showToast(`Отладка завершена! ${rewardText}`, 'success', 2000);
    onClose();
  }, [claimed, score, showToast, onClose]);

  if (!open) return null;

  const timePct = phase === 'playing' ? (timeLeft / GAME_DURATION_MS) * 100 : 0;
  const rewardAvailable = score >= 3;

  return h('div', {
    onClick: phase !== 'playing' ? onClose : undefined,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      background: 'rgba(7, 12, 24, 0.88)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      animation: 'fade-in-up 0.25s ease-out'
    }
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    ref: containerRef,
    style: {
      position: 'relative',
      width: 'min(380px, 100%)',
      height: 'min(380px, 60vh)',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0,0,0,0.4)'
    }
  }, [
    // Ready screen
    phase === 'ready' && [
      h('div', { style: { fontSize: '40px', marginBottom: '12px' } }, '🐛'),
      h('div', { style: { fontSize: '18px', fontWeight: 'bold', marginBottom: '6px' } }, 'Debugger QTE'),
      h('div', { style: { fontSize: '12px', color: '#9eb6d2', marginBottom: '16px', textAlign: 'center', padding: '0 20px' } },
        `У тебя ${GAME_DURATION_MS / 1000} секунды, чтобы поймать как можно больше багов. Нажимай на них!`
      ),
      h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '20px' } }, 'Награда: −5 стресса, +10 коммитов'),
      h('button', {
        onClick: startGame,
        style: {
          padding: '10px 28px',
          borderRadius: '8px',
          border: 'none',
          background: '#4ade80',
          color: '#0a1f12',
          fontWeight: 'bold',
          fontSize: '14px',
          cursor: 'pointer'
        }
      }, 'Начать отладку')
    ],

    // Playing screen
    phase === 'playing' && [
      // Timer bar
      h('div', {
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: '#0f3460'
        }
      }, h('div', {
        style: {
          width: `${timePct}%`,
          height: '100%',
          background: timePct < 30 ? '#ef4444' : '#4ade80',
          transition: 'width 0.05s linear'
        }
      })),

      // Score
      h('div', {
        style: {
          position: 'absolute',
          top: '10px',
          right: '14px',
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#facc15'
        }
      }, `Поймано: ${score}`),

      // Bugs
      ...bugs.filter(b => b.visible && !b.caught).map(bug => h('button', {
        key: bug.id,
        onClick: () => catchBug(bug.id),
        style: {
          position: 'absolute',
          left: bug.x,
          top: bug.y,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: '2px solid #ef4444',
          background: '#3f1a1a',
          color: '#ef4444',
          fontSize: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          animation: 'pulse 0.8s infinite',
          userSelect: 'none',
          touchAction: 'manipulation',
          zIndex: 10
        }
      }, '🐛'))
    ],

    // Result screen
    phase === 'result' && [
      h('div', { style: { fontSize: '48px', marginBottom: '10px' } }, score >= 4 ? '🎯' : score >= 2 ? '👍' : '😐'),
      h('div', { style: { fontSize: '18px', fontWeight: 'bold', marginBottom: '6px' } }, 'Отладка завершена'),
      h('div', { style: { fontSize: '14px', color: '#c7ddf5', marginBottom: '4px' } }, `Поймано багов: ${score} / ${BUG_COUNT}`),
      h('div', { style: { fontSize: '12px', color: '#9eb6d2', marginBottom: '16px' } },
        rewardAvailable ? 'Отличный результат! Полагается награда.' : 'Неплохо, но до награды не дотянуло.'
      ),
      rewardAvailable && h('button', {
        onClick: handleClaim,
        disabled: claimed,
        style: {
          padding: '10px 24px',
          borderRadius: '8px',
          border: 'none',
          background: claimed ? '#274267' : '#4ade80',
          color: claimed ? '#8ba1bb' : '#0a1f12',
          fontWeight: 'bold',
          fontSize: '14px',
          cursor: claimed ? 'not-allowed' : 'pointer'
        }
      }, claimed ? 'Получено' : 'Забрать награду'),
      h('button', {
        onClick: resetGame,
        style: {
          marginTop: '10px',
          padding: '8px 20px',
          borderRadius: '8px',
          border: '1px solid #30527e',
          background: '#131d33',
          color: '#9eb6d2',
          fontSize: '12px',
          cursor: 'pointer'
        }
      }, 'Ещё раз')
    ]
  ]));
}
