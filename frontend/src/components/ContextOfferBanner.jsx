import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { startTelegramPurchase } from '../utils/purchases.js';
import { arePaymentsEnabled } from '../utils/payments.js';
import { Analytics } from '../utils/analytics.js';
import PurchaseSuccess from './PurchaseSuccess.jsx';

function getOfferEffect(productId) {
  const effects = {
    energy_refill: { text: '+100 Energy', icon: '\u26a1' },
    depression_cure: { text: 'Depression cured', icon: '\ud83d\udc9a' },
    tier_boost: { text: 'Rank boosted', icon: '\u2b50' },
  };
  return effects[productId] || { text: 'Purchased!', icon: '\u2705' };
}

export default function ContextOfferBanner() {
  const {
    loading, contextOffer, dismissContextOffer, setShopOpen
  } = useGameState();
  const { initData } = useTelegram();
  const [buying, setBuying] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(null);

  const handleDismiss = useCallback(() => {
    if (contextOffer?.type) {
      dismissContextOffer(contextOffer.type).catch((err) => {
        console.warn('Context offer dismiss failed:', err);
      });
    }
  }, [contextOffer, dismissContextOffer]);

  const handleGoShop = useCallback(() => {
    if (contextOffer?.type) {
      try { Analytics.track('offer_clicked', { offerType: contextOffer.type, source: contextOffer.source || 'banner' }); } catch (_) {}
      dismissContextOffer(contextOffer.type).catch((err) => {
        console.warn('Context offer dismiss before shop failed:', err);
      });
    }
    setShopOpen(true);
  }, [contextOffer, dismissContextOffer, setShopOpen]);

  const handleBuy = useCallback(async () => {
    if (!contextOffer) return;
    try { Analytics.track('offer_clicked', { offerType: contextOffer.type, source: contextOffer.source || 'banner' }); } catch (_) {}
    setBuying(true);
    try {
      const result = await startTelegramPurchase(contextOffer.productId, initData);
      if (result.success) {
        await dismissContextOffer(contextOffer.type);
        setPurchaseSuccess({
          product: { id: contextOffer.productId, name: contextOffer.title },
          effect: getOfferEffect(contextOffer.productId)
        });
      }
    } catch (err) {
      console.warn('Context offer buy failed:', err);
    } finally {
      setBuying(false);
    }
  }, [contextOffer, dismissContextOffer, initData]);

  useEffect(() => {
    if (!contextOffer) {
      setBuying(false);
    }
  }, [contextOffer]);

  if (loading || !contextOffer) return null;

  // This banner exists solely to sell a product, so while payments are disabled
  // it is not rendered at all — there is no non-purchase content to keep.
  if (!arePaymentsEnabled()) return null;

  return h('div', {
    style: {
      position: 'absolute',
      top: '8px',
      left: '8px',
      right: '8px',
      zIndex: 45,
      background: 'linear-gradient(90deg, #1a3a5c, #274267)',
      border: '1px solid #30527e',
      borderRadius: '10px',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      animation: 'fade-in-up 0.3s ease-out'
    }
  }, [
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
      h('div', { style: { flex: 1, minWidth: 0 } }, [
        h('div', { style: { fontWeight: 700, fontSize: '12px', color: '#facc15', marginBottom: '2px' } }, contextOffer.title),
        h('div', { style: { fontSize: '11px', color: '#c7ddf5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, contextOffer.body)
      ]),
      h('button', {
        onClick: handleBuy,
        disabled: buying,
        style: {
          padding: '5px 10px',
          borderRadius: '6px',
          border: 'none',
          background: buying ? '#274267' : '#facc15',
          color: buying ? '#8ba1bb' : '#1a1a2e',
          fontWeight: 'bold',
          fontSize: '11px',
          cursor: buying ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap'
        }
      }, buying ? '...' : `${contextOffer.action} · ⭐ ${contextOffer.stars}`)
    ]),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, [
      h('button', {
        onClick: handleGoShop,
        style: {
          padding: '4px 10px',
          borderRadius: '6px',
          border: '1px solid #30527e',
          background: 'transparent',
          color: '#9eb6d2',
          fontSize: '11px',
          cursor: 'pointer'
        }
      }, 'Открыть магазин'),
      h('button', {
        onClick: handleDismiss,
        style: {
          padding: '4px 10px',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          color: '#6b7f99',
          fontSize: '11px',
          cursor: 'pointer'
        }
      }, 'Закрыть')
    ]),

    purchaseSuccess && h(PurchaseSuccess, {
      product: purchaseSuccess.product,
      effect: purchaseSuccess.effect,
      onClose: () => setPurchaseSuccess(null)
    })
  ]);
}
