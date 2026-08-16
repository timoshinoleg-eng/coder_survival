import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { adsManager } from '../utils/AdsManager.js';
import { trackEvent } from '../utils/analytics.js';

export default function RewardedVideo() {
  const { initData } = useTelegram();
  const { energy, maxEnergy, rewardedVideo, antiCheat, completeRewardedVideo, spendCoffeeCoin, inventory, showToast } = useGameState();
  const [waiting, setWaiting] = useState(false);
  const threshold = maxEnergy * 0.2;
  const remaining = rewardedVideo?.remainingToday ?? 0;
  const dailyLimit = rewardedVideo?.dailyLimit ?? 5;
  const adAvailability = rewardedVideo?.adAvailability || null;
  const provider = adsManager.provider;
  const coffeeCoins = Number(inventory?.coffee_coins || 0);

  if (energy > threshold || (remaining <= 0 && adAvailability?.allowed !== false && coffeeCoins <= 0)) return null;

  async function handleCoinClick() {
    if (waiting || coffeeCoins <= 0) return;
    setWaiting(true);
    try {
      const payload = await spendCoffeeCoin();
      showToast?.(`☕ Экстренный кофе: +${payload?.restored || 0} энергии`, 'success', 2000);
    } catch (err) {
      showToast?.(err?.message || 'Coffee Coin пока не сработал', 'error', 2000);
    } finally {
      setWaiting(false);
    }
  }

  async function handleClick() {
    if (waiting) return;
    setWaiting(true);
    let session = null;

    try {
      if (!adsManager.isAvailable()) {
        throw new Error('Реклама пока не настроена');
      }

      session = await adsManager.createAdSession(initData);
      trackEvent('ad_session_created', { provider: session.provider, source: 'rewarded_video' });
      const result = await adsManager.showRewardedAd(initData, session.nonce);
      if (result && result.done === false) {
        throw new Error('Реклама не была просмотрена до конца');
      }

      const proof = result?.proof || result?.signature || null;
      const reward = await completeRewardedVideo(session, proof);
      trackEvent('ad_reward_granted', {
        provider: session.provider,
        rewardEnergy: reward?.rewardEnergy,
        remainingToday: reward?.remainingToday,
      });
      const coinText = reward?.rewardCoffeeCoins || reward?.reward?.coffeeCoins || reward?.coffee_coins_granted || 0;
      showToast?.(`Кофе-брейк: +${reward.rewardEnergy} энергии${coinText ? ` · +${coinText} Coffee Coin` : ''}`, 'success', 2200);
    } catch (err) {
      trackEvent('ad_error', {
        provider: session?.provider || provider,
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
      left: '12px',
      right: '12px',
      bottom: '92px',
      zIndex: 35,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
    },
  }, [
    coffeeCoins > 0 && h('button', {
      type: 'button',
      onClick: handleCoinClick,
      disabled: waiting,
      style: {
        pointerEvents: 'auto',
        minHeight: '48px',
        border: '1px solid #8a6a10',
        borderRadius: '8px',
        background: '#2d2a1a',
        color: '#fde68a',
        padding: '8px 14px',
        fontWeight: 900,
        boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      },
    }, `☕ Использовать Coffee Coin · ${coffeeCoins}`),
    adAvailability?.allowed === false ? h('div', {
    style: {
      pointerEvents: 'auto',
      minHeight: '48px',
      border: '1px solid #f59e0b',
      borderRadius: '8px',
      background: '#2d2a1a',
      color: '#fde68a',
      padding: '8px 14px',
      fontWeight: 900,
      boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      textAlign: 'center',
    },
  }, adAvailability.reason === 'ftue_ads_blocked'
    ? '☕ Реклама откроется после первых 30 минут FTUE'
    : '☕ В FTUE доступен только 1 рекламный просмотр') : h('button', {
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
    h('div', null, waiting ? '☕ Проверяем просмотр...' : '☕ Кофе-брейк (энергия за рекламу)'),
    h('div', { style: { fontSize: '11px', color: '#fde68a', marginTop: '2px' } },
      `Осталось: ${remaining}/${dailyLimit}`
    ),
    h('div', { style: { fontSize: '10px', color: '#c7ddf5', marginTop: '2px' } },
      `Провайдер: ${provider}`
    ),
    antiCheat?.banScore >= 20 && h('div', { style: { fontSize: '10px', color: '#fca5a5', marginTop: '2px' } },
      `Anti-cheat tier ${antiCheat.sanctionTier}: награда сейчас снижена`
    ),
  ]),
  ]);
}
