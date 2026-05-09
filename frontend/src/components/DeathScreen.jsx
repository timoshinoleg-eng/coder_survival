import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';

export default function DeathScreen() {
  const { isDead, death, rankName, commits, streakDays, respawn, loading } = useGameState();
  const { haptic } = useTelegram();
  const [respawning, setRespawning] = useState(false);

  useEffect(() => {
    if (isDead) {
      audioManager.duckBGM(0.1, 2.0);
      audioManager.play('burnout');
    } else {
      audioManager.resumeBGM(1.0);
    }
  }, [isDead]);

  const handleRespawn = async () => {
    if (respawning || loading) return;
    setRespawning(true);
    haptic('heavy');
    await respawn?.();
    setRespawning(false);
  };

  if (!isDead) return null;

  const costText = death?.respawnCost?.energy
    ? `−${death.respawnCost.energy} энергии`
    : '';

  return h('div', {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 100,
      background: 'radial-gradient(circle at 50% 50%, #1a0a0a, #0a0505)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      color: '#e6edf7',
      textAlign: 'center',
      animation: 'fade-in-up 0.6s ease-out'
    }
  }, [
    h('div', {
      style: {
        fontSize: '56px',
        lineHeight: 1,
        marginBottom: '16px',
        animation: 'pulse 2s infinite'
      }
    }, '💀'),
    h('div', {
      style: {
        fontSize: '22px',
        fontWeight: 'bold',
        color: '#ef4444',
        marginBottom: '8px'
      }
    }, 'Burnout достигнут'),
    h('div', {
      style: {
        fontSize: '14px',
        color: '#9eb6d2',
        marginBottom: '24px',
        maxWidth: '320px'
      }
    }, 'Ты кодил слишком долго без отдыха. Депрессия достигла 100%. Время воскреснуть и начать с чистого листа.'),

    // Stats
    h('div', {
      style: {
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '10px',
        padding: '16px 24px',
        marginBottom: '24px',
        border: '1px solid #3f1a1a',
        minWidth: '220px'
      }
    }, [
      h('div', { style: { fontSize: '12px', color: '#8ba1bb', marginBottom: '8px' } }, 'Твоя статистика:'),
      h('div', { style: { fontSize: '14px', fontWeight: 600, marginBottom: '4px' } }, `${rankName || 'Junior'} — ${commits || 0} коммитов`),
      h('div', { style: { fontSize: '13px', color: '#9eb6d2' } }, `${streakDays || 0} дней подряд`)
    ]),

    // Respawn button
    death?.canRespawn && h('button', {
      onClick: handleRespawn,
      disabled: respawning,
      style: {
        padding: '14px 32px',
        borderRadius: '10px',
        border: 'none',
        background: respawning ? '#3f1a1a' : '#ef4444',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '16px',
        cursor: respawning ? 'wait' : 'pointer',
        boxShadow: respawning ? 'none' : '0 0 20px rgba(239,68,68,0.35)',
        transition: 'all 0.2s ease'
      }
    }, respawning ? 'Воскрешение...' : `Воскреснуть ${costText}`),

    !death?.canRespawn && h('div', {
      style: {
        fontSize: '13px',
        color: '#6b7f99',
        marginTop: '12px'
      }
    }, 'Воскрешение недоступно. Попробуй позже.')
  ]);
}
