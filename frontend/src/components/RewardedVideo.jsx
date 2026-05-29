import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';

export default function RewardedVideo() {
  const { energy, maxEnergy, rewardedVideo, completeRewardedVideo, showToast } = useGameState();
  const [waiting, setWaiting] = useState(false);
  const threshold = maxEnergy * 0.2;
  const remaining = rewardedVideo?.remainingToday ?? 0;

  if (energy > threshold || remaining <= 0) return null;

  async function handleClick() {
    if (waiting) return;
    setWaiting(true);
    const tg = window.Telegram?.WebApp;
    try {
      if (tg?.showRewardedVideo) {
        await new Promise((resolve) => tg.showRewardedVideo(resolve));
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 15000));
      }
      const result = await completeRewardedVideo();
      showToast?.(`Кофе-брейк: +${result.rewardEnergy} энергии`, 'success', 2000);
    } catch (err) {
      showToast?.(err?.message || 'Кофе-брейк пока недоступен', 'error', 2000);
    } finally {
      setWaiting(false);
    }
  }

  return h('div', {
    style: {
      position: 'fixed',
      left: '12px',
      right: '12px',
      bottom: '92px',
      zIndex: 35,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
    },
  }, h('button', {
    type: 'button',
    onClick: handleClick,
    disabled: waiting,
    style: {
      pointerEvents: 'auto',
      minHeight: '48px',
      border: '1px solid #facc15',
      borderRadius: '8px',
      background: waiting ? '#2d2a1a' : '#3b2f10',
      color: '#facc15',
      padding: '8px 14px',
      fontWeight: 900,
      boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
    },
  }, [
    h('div', null, waiting ? '☕ Перерыв...' : '☕ Кофе-брейк (+50% энергии)'),
    h('div', { style: { fontSize: '11px', color: '#fde68a', marginTop: '2px' } },
      `Осталось: ${remaining}/3`
    ),
  ]));
}
