import { h } from 'preact';
import { useAdsGram } from '../hooks/useAdsGram.js';
import { trackEvent } from '../utils/analytics.js';

/**
 * Standalone AdsGram rewarded video button/component.
 *
 * Props:
 *   - blockId?: string        (falls back to VITE_ADSGRAM_BLOCK_ID)
 *   - label?: string
 *   - sublabel?: string
 *   - disabled?: boolean
 *   - onReward?: () => void   — called when user watches the ad to the end
 *   - onError?: (err) => void — called on skip/error
 *   - style?: object           — container inline style
 *   - buttonStyle?: object     — button inline style
 */
export default function AdsGramRewarded({
  blockId: propBlockId,
  label = '☕ Смотреть рекламу за +50 энергии',
  sublabel = null,
  disabled = false,
  onReward,
  onError,
  style = {},
  buttonStyle = {},
}) {
  const blockId = propBlockId || import.meta.env?.VITE_ADSGRAM_BLOCK_ID;
  const { isReady, isLoading, showAd } = useAdsGram(blockId);

  async function handleClick() {
    if (isLoading || disabled || !isReady) return;

    trackEvent('ad_watched', { provider: 'adsgram', source: 'adsgram_rewarded' });

    try {
      await showAd();
      trackEvent('ad_reward_granted', { provider: 'adsgram', source: 'adsgram_rewarded' });
      onReward?.();
    } catch (err) {
      trackEvent('ad_error', {
        provider: 'adsgram',
        source: 'adsgram_rewarded',
        error: err?.message || 'unknown',
      });
      onError?.(err);
    }
  }

  const isDisabled = isLoading || disabled || !isReady;

  return h('div', {
    style: {
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      ...style,
    },
  }, h('button', {
    type: 'button',
    onClick: handleClick,
    disabled: isDisabled,
    style: {
      pointerEvents: 'auto',
      minHeight: '48px',
      border: '1px solid #facc15',
      borderRadius: '8px',
      background: isDisabled ? '#2d2a1a' : '#3b2f10',
      color: '#facc15',
      padding: '8px 14px',
      fontWeight: 900,
      boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      ...buttonStyle,
    },
  }, [
    h('div', null, isLoading ? '☕ Перерыв...' : label),
    sublabel && h('div', { style: { fontSize: '11px', color: '#fde68a', marginTop: '2px' } }, sublabel),
    !isReady && !disabled && h('div', { style: { fontSize: '10px', color: '#fca5a5', marginTop: '2px' } },
      'Реклама загружается...'
    ),
  ]));
}
