import { h } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';

export default function TapArea({ active }) {
  const { tap, energy, lastTapDelta, error: gameError, showToast } = useGameState();
  const { haptic } = useTelegram();
  const [ripples, setRipples] = useState([]);
  const [floatTexts, setFloatTexts] = useState([]);
  const [pressed, setPressed] = useState(false);
  const lastTapPosRef = useRef({ x: 0, y: 0 });
  const prevDeltaRef = useRef(null);
  const prevErrorRef = useRef(null);

  const addFloatText = useCallback((x, y, text, color, size = '16px', duration = 1000) => {
    const id = Date.now() + Math.random();
    setFloatTexts(prev => [...prev, { id, x, y, text, color, size }]);
    setTimeout(() => {
      setFloatTexts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (!active || energy <= 0) {
      haptic('error');
      audioManager.play('energy0');
      return;
    }
    setPressed(true);
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastTapPosRef.current = { x, y };

    haptic('light');
    audioManager.play('tap');
    tap();

    // Ripple — immediate tactile feedback only
    const rippleId = Date.now() + Math.random();
    setRipples(prev => [...prev, { id: rippleId, x, y }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== rippleId));
    }, 700);
  }, [active, energy, tap, haptic]);

  // Exact feedback driven by actual server response — never stale
  useEffect(() => {
    if (!lastTapDelta || lastTapDelta === prevDeltaRef.current) return;
    prevDeltaRef.current = lastTapDelta;

    const { x, y } = lastTapPosRef.current;
    const { commits: deltaCommits, xp: deltaXp } = lastTapDelta;

    // Only show enhanced feedback when we have a real delta from the server
    if (typeof deltaCommits !== 'number') return;

    let textContent;
    let textColor;
    let textSize = '16px';
    if (deltaCommits >= 5) {
      textContent = `+${deltaCommits} коммитов`;
      textColor = '#facc15';
      textSize = '18px';
      haptic('success');
      showToast('Отличный коммит!', 'success', 1200);
    } else if (deltaCommits > 1) {
      textContent = `+${deltaCommits} коммита`;
      textColor = '#4ade80';
      textSize = '15px';
    } else {
      textContent = '+1';
      textColor = '#4ade80';
      textSize = '16px';
    }

    addFloatText(x, y, textContent, textColor, textSize);

    // XP floater
    if (deltaXp > 0) {
      addFloatText(
        x + (Math.random() * 40 - 20),
        y - 30,
        `+${deltaXp} XP`,
        '#60a5fa',
        '12px'
      );
    }

    // Re-emit Phaser event with real strength for particles/flash intensity
    if (window.__PHASER_GAME__) {
      window.__PHASER_GAME__.events.emit('tap', { x, y, strength: deltaCommits });
    }
  }, [lastTapDelta, addFloatText, haptic, showToast]);

  useEffect(() => {
    if (!gameError) {
      prevErrorRef.current = null;
      return;
    }
    if (gameError === prevErrorRef.current) return;
    prevErrorRef.current = gameError;
    audioManager.play('bugFail');
  }, [gameError]);

  const handlePointerUp = useCallback(() => {
    setPressed(false);
  }, []);

  if (!active) return null;

  const isExhausted = energy <= 0;

  return h('div', {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      pointerEvents: 'none'
    }
  }, [
    // Floating texts layer
    h('div', {
      style: {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden'
      }
    }, floatTexts.map(t => h('div', {
      key: t.id,
      style: {
        position: 'absolute',
        left: t.x - 40,
        top: t.y - 55,
        width: '80px',
        textAlign: 'center',
        fontSize: t.size,
        fontWeight: 'bold',
        color: t.color,
        textShadow: '0 2px 8px rgba(0,0,0,0.7)',
        animation: 'float-up 1s ease-out forwards',
        pointerEvents: 'none',
        zIndex: 30
      }
    }, t.text))),

    // Error toast under button
    gameError && h('div', {
      style: {
        position: 'absolute',
        bottom: 'calc(min(260px, 75vw) + 20px)',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 14px',
        borderRadius: '20px',
        background: '#3f1a1a',
        color: '#ef4444',
        fontSize: '12px',
        fontWeight: 600,
        border: '1px solid #5a2d2d',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 30,
        animation: 'fade-in-up 0.2s ease-out'
      }
    }, gameError),

    // Tap zone
    h('div', {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerUp,
      style: {
        pointerEvents: 'auto',
        width: 'min(260px, 75vw)',
        height: 'min(260px, 75vw)',
        borderRadius: '50%',
        background: isExhausted
          ? 'radial-gradient(circle at 40% 40%, #3a2a2a, #2a1a1a)'
          : 'radial-gradient(circle at 40% 40%, #2d5a3e, #1a3f25)',
        border: `3px solid ${isExhausted ? '#ef4444' : '#4ade80'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        color: isExhausted ? '#ef4444' : '#4ade80',
        cursor: isExhausted ? 'not-allowed' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transform: pressed ? 'scale(0.93)' : 'scale(1)',
        transition: 'transform 0.08s ease-out, border-color 0.25s, background 0.3s, color 0.2s',
        userSelect: 'none',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        animation: isExhausted ? 'pulse-red 1.4s infinite' : 'none',
        boxShadow: pressed
          ? '0 0 24px rgba(74,222,128,0.45) inset'
          : isExhausted
            ? '0 0 16px rgba(239,68,68,0.35)'
            : '0 4px 24px rgba(0,0,0,0.35)'
      }
    }, [
      h('span', { style: { pointerEvents: 'none', fontWeight: 'bold', letterSpacing: '1px' } },
        isExhausted ? 'НЕТ ЭНЕРГИИ' : 'КОДИТЬ'
      ),
      // Ripple effects
      ...ripples.map(r => h('div', {
        key: r.id,
        style: {
          position: 'absolute',
          left: r.x - 28,
          top: r.y - 28,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'rgba(74, 222, 128, 0.28)',
          border: '2px solid rgba(74, 222, 128, 0.4)',
          animation: 'ripple 0.7s ease-out forwards',
          pointerEvents: 'none'
        }
      }))
    ])
  ]);
}
