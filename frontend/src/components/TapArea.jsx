import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';

export default function TapArea({ active }) {
  const { tap, drinkCoffee, energy, coffeeCups } = useGameState();
  const { haptic } = useTelegram();
  const [ripples, setRipples] = useState([]);

  const handleTap = useCallback((e) => {
    if (!active || energy <= 0) {
      haptic('error');
      return;
    }

    // Get tap position
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;

    // Haptic feedback
    haptic('light');

    // Game logic
    tap();

    // Bridge to Phaser
    if (window.__PHASER_GAME__) {
      window.__PHASER_GAME__.events.emit('tap', { x, y });
    }

    // Visual ripple
    const id = Date.now() + Math.random();
    setRipples(prev => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
  }, [active, energy, tap, haptic]);

  const handleCoffee = useCallback(() => {
    if (coffeeCups > 0 && energy < 100) {
      haptic('success');
      drinkCoffee();
    } else {
      haptic('error');
    }
  }, [coffeeCups, energy, drinkCoffee, haptic]);

  if (!active) return null;

  return h('div', {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      pointerEvents: 'none'
    }
  }, [
    // Coffee button
    h('button', {
      onClick: handleCoffee,
      disabled: coffeeCups <= 0 || energy >= 100,
      style: {
        pointerEvents: 'auto',
        padding: '8px 16px',
        borderRadius: '20px',
        border: '2px solid #8B4513',
        background: coffeeCups > 0 && energy < 100 ? '#6b3410' : '#3a3a3a',
        color: coffeeCups > 0 && energy < 100 ? '#fff' : '#666',
        fontSize: '14px',
        fontFamily: 'inherit',
        cursor: coffeeCups > 0 && energy < 100 ? 'pointer' : 'not-allowed',
        transition: 'all 0.15s',
        userSelect: 'none',
        touchAction: 'manipulation'
      }
    }, `☕ Кофе (${coffeeCups})`),

    // Tap zone
    h('div', {
      onTouchStart: handleTap,
      onClick: handleTap,
      style: {
        pointerEvents: 'auto',
        width: 'min(280px, 80vw)',
        height: 'min(280px, 80vw)',
        borderRadius: '50%',
        background: energy > 0 
          ? 'radial-gradient(circle at 40% 40%, #2d4a3e, #1a2f25)' 
          : 'radial-gradient(circle at 40% 40%, #3a3a3a, #2a2a2a)',
        border: `3px solid ${energy > 0 ? '#4ade80' : '#666'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        color: energy > 0 ? '#4ade80' : '#666',
        cursor: energy > 0 ? 'pointer' : 'not-allowed',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.05s, border-color 0.2s',
        userSelect: 'none',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent'
      }
    }, [
      h('span', { style: { pointerEvents: 'none', fontWeight: 'bold' } },
        energy > 0 ? 'КОДИТЬ' : 'НЕТ ЭНЕРГИИ'
      ),
      // Ripple effects
      ...ripples.map(r => h('div', {
        key: r.id,
        style: {
          position: 'absolute',
          left: r.x - 20,
          top: r.y - 20,
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'rgba(74, 222, 128, 0.3)',
          animation: 'ripple 0.6s ease-out forwards',
          pointerEvents: 'none'
        }
      }))
    ])
  ]);
}
