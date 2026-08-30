import { h } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useAchievements } from '../hooks/useAchievements.js';
import { audioManager } from '../utils/AudioManager.js';
import { Analytics } from '../utils/analytics.js';

const DEPRESSION_MAX = 200;
const DEPRESSION_AFFLICTION = 100;

export default function TapArea({ active }) {
  const {
    tap,
    energy,
    depression,
    isBurnout,
    isCrit,
    critTier,
    lastTapDelta,
    error: gameError,
    showToast,
    rank,
  } = useGameState();
  const { haptic } = useTelegram();
  const { queueToast } = useAchievements();
  const [ripples, setRipples] = useState([]);
  const [floatTexts, setFloatTexts] = useState([]);
  const [pressed, setPressed] = useState(false);
  const [luckArmed, setLuckArmed] = useState(true);
  const lastTapPosRef = useRef({ x: 0, y: 0 });
  const prevDeltaRef = useRef(null);
  const prevErrorRef = useRef(null);
  const energyBeforeRef = useRef(null);

  useEffect(() => {
    audioManager.init().catch(() => {});
  }, []);

  const addFloatText = useCallback((x, y, text, color, size = '16px', duration = 1000) => {
    const id = Date.now() + Math.random();
    setFloatTexts(prev => [...prev, { id, x, y, text, color, size }]);
    setTimeout(() => {
      setFloatTexts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const handlePointerDown = useCallback((e) => {
    audioManager.resumeOnGesture();
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
    setLuckArmed(false);
    window.setTimeout(() => setLuckArmed(true), 220);
    energyBeforeRef.current = energy;
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

    Analytics.track('tap', { energy_before: energyBeforeRef.current, energy_after: energy, rank });

    const { x, y } = lastTapPosRef.current;
    const { commits: deltaCommits, xp: deltaXp } = lastTapDelta;

    if (typeof deltaCommits === 'number' && deltaCommits > 0) {
      Analytics.track('score_earned', { amount: deltaCommits, source: 'tap' });
    }

    // Only show enhanced feedback when we have a real delta from the server
    if (typeof deltaCommits !== 'number') return;

    let textContent;
    let textColor;
    let textSize = '16px';
    if (lastTapDelta.critTier === 'gold') {
      textContent = `КРИТ! +${deltaCommits}!`;
      textColor = '#ffd700';
      textSize = '22px';
      haptic('success');
      showToast(`Критический коммит: +${deltaCommits}!`, 'success', 1200);
    } else if (lastTapDelta.critTier === 'silver') {
      textContent = `+${deltaCommits}!`;
      textColor = '#c0c0c0';
      textSize = '20px';
      haptic('success');
      showToast(`Сильный коммит: +${deltaCommits}`, 'success', 1000);
    } else if (deltaCommits > 1) {
      textContent = `+${deltaCommits} коммита`;
      textColor = 'var(--accent-green)';
      textSize = '15px';
    } else {
      textContent = '+1';
      textColor = 'var(--accent-green)';
      textSize = '16px';
    }

    addFloatText(x, y, textContent, textColor, textSize);

    // XP floater
    if (deltaXp > 0) {
      addFloatText(
        x + (Math.random() * 40 - 20),
        y - 30,
        `+${deltaXp} XP`,
        'var(--accent-blue)',
        '12px'
      );
    }

    // Re-emit Phaser event with real strength for particles/flash intensity
    if (window.__PHASER_GAME__) {
      window.__PHASER_GAME__.events.emit('tap', { x, y, strength: deltaCommits });
    }

    // Queue achievement toasts
    if (lastTapDelta.achievementsEarned?.length > 0) {
      queueToast(lastTapDelta.achievementsEarned);
    }
  }, [lastTapDelta, addFloatText, haptic, showToast, queueToast, energy, rank]);

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
  const depressionPercent = Math.min(100, Math.max(0, Math.round(((depression || 0) / DEPRESSION_MAX) * 100)));
  const tapZoneClass = [
    isCrit && critTier === 'silver' ? 'crit-flash-silver' : '',
    isCrit && critTier === 'gold' ? 'crit-flash-gold' : '',
    isBurnout ? 'pulse-red' : '',
  ].filter(Boolean).join(' ');
  const depressionClass =
    isBurnout ? 'depression-burnout'
      : depression >= 160 ? 'depression-critical'
        : depression >= DEPRESSION_AFFLICTION ? 'depression-high'
          : depression >= 60 ? 'depression-med'
            : 'depression-low';
  const buttonText = isExhausted
    ? 'НЕТ ЭНЕРГИИ'
    : isBurnout
      ? 'ПАУЗА · ВОССТАНОВЛЕНИЕ'
      : 'COMMIT КОДА';
  const buttonHint = isExhausted
    ? 'Дождись восстановления энергии'
    : isBurnout
      ? 'Безопаснее сделать паузу'
      : 'Тапни, чтобы отправить коммит';

  return h('div', {
    className: 'tap-area-v2',
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
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
        bottom: 'calc(min(172px, 38vw) + 28px)',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 14px',
        borderRadius: '20px',
        background: '#3f1a1a',
        color: 'var(--danger)',
        fontSize: 'var(--text-base)',
        fontWeight: 600,
        border: '1px solid #5a2d2d',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 30,
        animation: 'fade-in-up 0.2s ease-out'
      }
    }, gameError),

    h('style', null, `
      .crit-flash-silver { animation: flashSilver 300ms ease-out; }
      @keyframes flashSilver {
        0% { box-shadow: 0 0 0 rgba(192,192,192,0); }
        50% { box-shadow: 0 0 20px rgba(192,192,192,0.8); }
        100% { box-shadow: 0 0 0 rgba(192,192,192,0); }
      }
      .crit-flash-gold { animation: flashGold 400ms ease-out; }
      @keyframes flashGold {
        0% { transform: scale(1); box-shadow: 0 0 0 rgba(255,215,0,0); }
        50% { transform: scale(1.1); box-shadow: 0 0 30px rgba(255,215,0,0.9); }
        100% { transform: scale(1); box-shadow: 0 0 0 rgba(255,215,0,0); }
      }
      .pulse-red { animation: pulseRed 1.5s infinite; }
      @keyframes pulseRed { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      .depression-low { background: var(--signal-green); }
      .depression-med { background: var(--coffee-amber); }
      .depression-high { background: var(--incident-red); animation: pulseRed 2s infinite; }
      .depression-critical { background: var(--incident-red); animation: pulseRed 0.8s infinite; box-shadow: 0 0 12px rgba(255,94,102,0.45); }
      .depression-burnout { background: var(--ink-base); color: var(--incident-red); }
    `),

    h('div', {
      style: {
        width: 'min(320px, calc(100vw - 28px))',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        pointerEvents: 'none'
      }
    }, [
      h('div', {
        style: {
          height: '4px',
          width: '100%',
          borderRadius: '0',
          background: 'rgba(255,255,255,0.12)',
          overflow: 'hidden'
        }
      }, h('div', {
        style: {
          width: luckArmed ? '20%' : '0%',
          height: '100%',
          background: 'var(--electric-cyan)',
          transition: luckArmed ? 'width 180ms ease-out' : 'none'
        }
      })),
      h('div', {
        title: 'Депрессия растёт с каждым тапом. Отдохни — она снизится',
        style: {
          height: '6px',
          width: '100%',
          borderRadius: '0',
          background: 'rgba(255,255,255,0.12)',
          overflow: 'hidden'
        }
      }, h('div', {
        className: depressionClass,
        style: {
          width: `${depressionPercent}%`,
          height: '100%',
          transition: 'width 0.25s ease'
        }
      }))
    ]),

    // Tap zone
    h('div', {
      className: ['terminal-action', isExhausted ? 'terminal-action--exhausted' : '', isBurnout ? 'terminal-action--burnout' : '', tapZoneClass].filter(Boolean).join(' '),
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerUp,
      style: {
        pointerEvents: 'auto',
        width: 'min(320px, calc(100vw - 28px))',
        height: 'min(172px, 38vw)',
        borderRadius: '0',
        opacity: isExhausted ? 0.6 : 1,
        background: isExhausted || isBurnout ? 'var(--ink-base)' : 'var(--ink-base)',
        border: `3px solid ${isExhausted || isBurnout ? 'var(--incident-red)' : 'var(--signal-green)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "var(--font-pixel)",
        fontSize: 'var(--text-lg)',
        color: isExhausted || isBurnout ? '#ffe4dc' : 'var(--accent-green)',
        cursor: isExhausted ? 'not-allowed' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transform: 'translateZ(0)',
        transition: 'border-color 0.25s, background 0.3s, color 0.2s, box-shadow 0.12s ease-out',
        userSelect: 'none',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        boxShadow: pressed
          ? 'inset 0 0 0 2px var(--electric-cyan), 0 3px 0 rgba(0,0,0,0.45)'
          : isExhausted || isBurnout
            ? 'inset 0 0 0 2px var(--panel-ink), 0 3px 0 rgba(0,0,0,0.45)'
            : 'inset 0 0 0 2px var(--panel-ink), 0 5px 0 rgba(0,0,0,0.45)'
      }
    }, [
      h('div', { className: 'terminal-action__content' }, [
        h('span', { className: 'terminal-action__label' }, buttonText),
        h('span', { className: 'terminal-action__hint' }, buttonHint),
      ]),
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
          background: 'rgba(98, 240, 123, 0.22)',
          border: '2px solid rgba(98, 240, 123, 0.45)',
          animation: 'ripple 0.7s ease-out forwards',
          pointerEvents: 'none'
        }
      }))
    ])
  ]);
}
