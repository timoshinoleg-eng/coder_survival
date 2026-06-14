import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useAdsGram } from '../hooks/useAdsGram.js';
import { trackEvent } from '../utils/analytics.js';

export default function RewardedVideo({ suppressed = false, compact = false }) {
  const { energy, maxEnergy, rewardedVideo, antiCheat, completeRewardedVideo, showToast } = useGameState();
  const [waiting, setWaiting] = useState(false);
  const [compactMode, setCompactMode] = useState(() => {
    if (typeof window === 'undefined') return compact;
    return compact || window.innerWidth <= 520;
  });
  const threshold = maxEnergy * 0.2;
  const remaining = rewardedVideo?.remainingToday ?? 0;
  const dailyLimit = rewardedVideo?.dailyLimit ?? 5;
  const adAvailability = rewardedVideo?.adAvailability || null;

  const blockId = import.meta.env?.VITE_ADSGRAM_BLOCK_ID;
  const { isReady: adsGramReady, showAd: showAdsGramAd } = useAdsGram(blockId);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateCompactMode = () => setCompactMode(compact || window.innerWidth <= 520);
    updateCompactMode();
    window.addEventListener('resize', updateCompactMode);
    return () => window.removeEventListener('resize', updateCompactMode);
  }, [compact]);

  if (suppressed) return null;
  if (energy > threshold || (remaining <= 0 && adAvailability?.allowed !== false)) return null;

  async function handleClick() {
    if (waiting) return;
    setWaiting(true);

    const tg = window.Telegram?.WebApp;
    let provider = 'mock';

    try {
      if (tg?.showRewardedVideo) {
        provider = 'telegram_native';
        trackEvent('ad_watched', { provider, source: 'rewarded_video' });
        await new Promise((resolve) => tg.showRewardedVideo(resolve));
      } else if (adsGramReady && showAdsGramAd) {
        provider = 'adsgram';
        trackEvent('ad_watched', { provider, source: 'rewarded_video' });
        await showAdsGramAd();
      } else {
        provider = 'mock';
        trackEvent('ad_watched', { provider, source: 'rewarded_video' });
        await new Promise((resolve) => window.setTimeout(resolve, 15000));
      }

      const result = await completeRewardedVideo();
      trackEvent('ad_reward_granted', {
        provider,
        rewardEnergy: result?.rewardEnergy,
        remainingToday: result?.remainingToday,
      });
      showToast?.(`Кофе-брейк: +${result.rewardEnergy} энергии`, 'success', 2000);
    } catch (err) {
      trackEvent('ad_error', {
        provider,
        source: 'rewarded_video',
        error: err?.message || 'unknown',
      });
      showToast?.(err?.message || 'Кофе-брейк пока недоступен', 'error', 2000);
    } finally {
      setWaiting(false);
    }
  }

  return h('div', {
    style: {
      position: 'fixed',
      left: compactMode ? 'auto' : '12px',
      right: 'max(12px, env(safe-area-inset-right))',
      bottom: compactMode ? 'max(76px, env(safe-area-inset-bottom))' : 'max(92px, env(safe-area-inset-bottom))',
      zIndex: 35,
      display: 'flex',
      justifyContent: compactMode ? 'flex-end' : 'center',
      pointerEvents: 'none',
    },
  }, adAvailability?.allowed === false ? h('div', {
    style: {
      pointerEvents: 'auto',
      minHeight: compactMode ? '42px' : '48px',
      width: compactMode ? 'min(240px, calc(100vw - 24px))' : 'auto',
      border: '1px solid #f59e0b',
      borderRadius: '8px',
      background: '#2d2a1a',
      color: '#fde68a',
      padding: compactMode ? '7px 10px' : '8px 14px',
      fontWeight: 900,
      boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      textAlign: 'center',
      fontSize: compactMode ? '12px' : '14px',
    },
  }, adAvailability.reason === 'ftue_ads_blocked'
    ? '☕ Реклама откроется после первых 30 минут FTUE'
    : '☕ В FTUE доступен только 1 рекламный просмотр') : h('button', {
    type: 'button',
    onClick: handleClick,
    disabled: waiting,
    style: {
      pointerEvents: 'auto',
      minHeight: compactMode ? '42px' : '48px',
      width: compactMode ? 'min(240px, calc(100vw - 24px))' : 'auto',
      border: '1px solid #facc15',
      borderRadius: '8px',
      background: waiting ? '#2d2a1a' : '#3b2f10',
      color: '#facc15',
      padding: compactMode ? '7px 10px' : '8px 14px',
      fontWeight: 900,
      boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      fontSize: compactMode ? '12px' : '14px',
    },
  }, [
    h('div', null, waiting ? '☕ Перерыв...' : compactMode ? '☕ Кофе-брейк' : '☕ Кофе-брейк (энергия за рекламу)'),
    h('div', { style: { fontSize: '11px', color: '#fde68a', marginTop: '2px' } },
      `Осталось: ${remaining}/${dailyLimit}`
    ),
    antiCheat?.banScore >= 20 && h('div', { style: { fontSize: '10px', color: '#fca5a5', marginTop: '2px' } },
      `Anti-cheat tier ${antiCheat.sanctionTier}: награда сейчас снижена`
    ),
  ]));
}
