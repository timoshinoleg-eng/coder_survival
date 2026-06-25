import { h } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { startTelegramPurchase, startDealPurchase } from '../utils/purchases.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useGameState } from '../hooks/useGameState.js';
import { useTonWallet } from '../hooks/useTonWallet.js';
import { audioManager } from '../utils/AudioManager.js';
import { Analytics } from '../utils/analytics.js';
import PremiumPurchaseSuccess from './PremiumPurchaseSuccess.jsx';
import PurchaseSuccess from './PurchaseSuccess.jsx';

function getProductEffect(productId) {
  const effects = {
    energy_refill: { text: '+100 Energy', icon: '\u26a1' },
    depression_cure: { text: 'Depression cured', icon: '\ud83d\udc9a' },
    tier_boost: { text: 'Rank boosted', icon: '\u2b50' },
  };
  return effects[productId] || { text: 'Purchased!', icon: '\u2705' };
}

const CATEGORY_LABELS = {
  energy: '⚡ Энергия',
  stress: '🧘 Стресс',
  boost: '🚀 Бусты',
  pass: '🎟️ Pass'
};

const CATEGORY_ORDER = ['energy', 'stress', 'boost', 'pass'];

export default function ShopPanel() {
  const { initData } = useTelegram();
  const { contextOffer, showToast, shopOpen, closeShop } = useGameState();
  const { walletAddress, connect } = useTonWallet();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(null);
  const [buyResult, setBuyResult] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeSales, setActiveSales] = useState(null);
  const [showPremiumSuccess, setShowPremiumSuccess] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(null);

  useEffect(() => {
    if (!shopOpen) {
      setProducts([]);
      setError(null);
      setBuyResult(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    apiRequest('/api/shop/products')
      .then((payload) => {
        if (cancelled) return;
        setProducts(payload?.products || []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Не удалось загрузить магазин');
        setLoading(false);
      });

    apiRequest('/api/shop/active-sales')
      .then((payload) => {
        if (cancelled) return;
        setActiveSales(payload || null);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [shopOpen]);

  useEffect(() => {
    if (shopOpen) {
      Analytics.track('shop_opened');
      audioManager.play('modalOpen');
      audioManager.duckForModal();
    } else {
      audioManager.resumeFromModal();
    }
  }, [shopOpen]);

  const handleDealBuy = async (dealType) => {
    setBuying(`deal:${dealType}`);
    setBuyResult(null);
    try {
      const result = await startDealPurchase(dealType, initData);
      setBuyResult({
        success: result.success,
        productId: result.purchase?.itemType,
        purchase: result.purchase,
        invoiceStatus: result.status
      });
      if (result.success) {
        audioManager.play('purchase');
        showToast(result.status === 'opened' ? 'Invoice открыт. После оплаты товар поступит автоматически.' : 'Покупка завершена!', 'success', 3000);
        if (result.status !== 'opened') {
          const dealProduct = { id: result.purchase?.itemType, name: result.purchase?.itemType };
          setPurchaseSuccess({ product: dealProduct, effect: getProductEffect(result.purchase?.itemType) });
        }
        Analytics.track('purchase_completed', { product_id: result.purchase?.itemType, price: result.purchase?.starsAmount, currency: 'stars', deal_type: dealType });
      }
    } catch (err) {
      setBuyResult({ success: false, productId: dealType, error: err.payload?.error || err.message || 'Ошибка покупки' });
      showToast(err.payload?.error || 'Ошибка покупки', 'error', 2500);
      Analytics.track('purchase_failed', { error_code: err.status || err.code || 'unknown', product_id: dealType, stage: 'deal_checkout' });
    } finally {
      setBuying(null);
    }
  };

  const handleBuy = async (productId) => {
    setBuying(productId);
    setBuyResult(null);
    const product = products.find(p => p.id === productId);
    Analytics.track('purchase_intent', { product_id: productId, price: product?.stars });
    try {
      const result = await startTelegramPurchase(productId, initData);
      setBuyResult({
        success: result.success,
        productId,
        purchase: result.purchase,
        invoiceStatus: result.status
      });
      if (result.success) {
        audioManager.play('purchase');
        if (result.status === 'opened') {
          showToast('Invoice открыт. После оплаты товар поступит автоматически.', 'info', 3000);
        } else {
          showToast('Покупка завершена! Товар скоро будет выдан.', 'success', 3000);
          if (productId === 'premium_pass') {
            setShowPremiumSuccess(true);
          } else {
            setPurchaseSuccess({ product, effect: getProductEffect(productId) });
          }
        }
        Analytics.track('purchase_completed', { product_id: productId, price: product?.stars, currency: 'stars' });
      }
    } catch (err) {
      setBuyResult({ success: false, productId, error: err.payload?.error || err.message || 'Ошибка покупки' });
      showToast(err.payload?.error || 'Ошибка покупки', 'error', 2500);
      Analytics.track('purchase_failed', {
        error_code: err.status || err.code || 'unknown',
        product_id: productId,
        stage: 'checkout',
      });
    } finally {
      setBuying(null);
    }
  };

  const recommendedId = contextOffer?.productId || null;

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category === activeCategory);

  const categories = CATEGORY_ORDER.filter(c => products.some(p => p.category === c));

  if (!shopOpen) return null;

  return h('div', {
    onClick: closeShop,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'rgba(7, 12, 24, 0.78)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '16px 12px'
    }
  }, h('div', {
    onClick: (event) => event.stopPropagation(),
    style: {
      width: 'min(420px, 100%)',
      maxHeight: '70vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '8px',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)'
    }
  }, [
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552'
      }
    }, [
      h('strong', null, '🛒 Магазин'),
      h('button', {
        onClick: closeShop,
        style: {
          border: 'none',
          background: 'transparent',
          color: '#9eb6d2',
          fontSize: '18px',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1
        }
      }, '×')
    ]),

    // Category tabs
    products.length > 0 && h('div', {
      style: {
        display: 'flex',
        gap: '4px',
        padding: '10px 14px 0',
        borderBottom: '1px solid #1f3552'
      }
    }, [
      h('button', {
        onClick: () => setActiveCategory('all'),
        style: {
          flex: 1,
          padding: '6px 0',
          borderRadius: '6px 6px 0 0',
          border: 'none',
          background: activeCategory === 'all' ? '#1a3a5c' : 'transparent',
          color: activeCategory === 'all' ? '#dce9f9' : '#8ba1bb',
          fontWeight: activeCategory === 'all' ? 700 : 400,
          fontSize: '12px',
          cursor: 'pointer'
        }
      }, 'Все'),
      ...categories.map(cat => h('button', {
        key: cat,
        onClick: () => setActiveCategory(cat),
        style: {
          flex: 1,
          padding: '6px 0',
          borderRadius: '6px 6px 0 0',
          border: 'none',
          background: activeCategory === cat ? '#1a3a5c' : 'transparent',
          color: activeCategory === cat ? '#dce9f9' : '#8ba1bb',
          fontWeight: activeCategory === cat ? 700 : 400,
          fontSize: '12px',
          cursor: 'pointer'
        }
      }, CATEGORY_LABELS[cat] || cat))
    ]),

    loading
      ? h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Загрузка...')
      : error
        ? h('div', { style: { padding: '14px', color: '#fda4af' } }, error)
        : h('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 14px' }
        }, [
          recommendedId && h('div', {
            style: {
              background: 'linear-gradient(90deg, #1a3a5c, #274267)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#c7ddf5',
              marginBottom: '4px',
              border: '1px solid #30527e'
            }
          }, [
            h('div', { style: { fontWeight: 'bold', marginBottom: '2px', color: '#facc15' } }, '🎁 Рекомендуется'),
            h('div', null, 'На основе твоего текущего состояния')
          ]),

          activeSales?.dailyDeal && h('div', {
            style: {
              background: 'linear-gradient(90deg, #1a3a5c, #274267)',
              borderRadius: '8px',
              padding: '10px 12px',
              border: '1px solid #30527e',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }
          }, [
            h('span', { style: { fontSize: '22px' } }, activeSales.dailyDeal.product?.icon || '📅'),
            h('div', { style: { flex: 1 } }, [
              h('div', { style: { fontWeight: 700, fontSize: '12px', color: '#facc15' } }, '📅 Daily Deal'),
              h('div', { style: { fontSize: '11px', color: '#e6edf7' } },
                `${activeSales.dailyDeal.product?.name || activeSales.dailyDeal.item_slug} — ⭐ ${activeSales.dailyDeal.discounted_stars}`
              ),
              h('div', { style: { fontSize: '10px', color: '#9eb6d2', textDecoration: 'line-through' } },
                `⭐ ${activeSales.dailyDeal.original_stars}`
              )
            ]),
            h('button', {
              onClick: () => handleDealBuy('daily_deal'),
              disabled: buying === 'deal:daily_deal',
              style: {
                padding: '5px 12px',
                borderRadius: '6px',
                border: 'none',
                background: buying === 'deal:daily_deal' ? '#274267' : '#4ade80',
                color: buying === 'deal:daily_deal' ? '#8ba1bb' : '#0a1f12',
                fontWeight: 'bold',
                fontSize: '11px',
                cursor: buying === 'deal:daily_deal' ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap'
              }
            }, buying === 'deal:daily_deal' ? '...' : 'Купить')
          ]),

          activeSales?.flashSale && h('div', {
            style: {
              background: 'linear-gradient(90deg, #7c2d12, #9a3412)',
              borderRadius: '8px',
              padding: '10px 12px',
              border: '1px solid #f97316',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }
          }, [
            h('span', { style: { fontSize: '22px' } }, activeSales.flashSale.product?.icon || '⚡'),
            h('div', { style: { flex: 1 } }, [
              h('div', { style: { fontWeight: 700, fontSize: '12px', color: '#facc15' } }, '⚡ Flash Sale'),
              h('div', { style: { fontSize: '11px', color: '#e6edf7' } },
                `${activeSales.flashSale.product?.name || activeSales.flashSale.item_slug} — ${activeSales.flashSale.discount_percent}% off`
              )
            ]),
            h('button', {
              onClick: () => handleDealBuy('flash_sale'),
              disabled: buying === 'deal:flash_sale',
              style: {
                padding: '5px 12px',
                borderRadius: '6px',
                border: 'none',
                background: buying === 'deal:flash_sale' ? '#274267' : '#facc15',
                color: buying === 'deal:flash_sale' ? '#8ba1bb' : '#1a1a2e',
                fontWeight: 'bold',
                fontSize: '11px',
                cursor: buying === 'deal:flash_sale' ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap'
              }
            }, buying === 'deal:flash_sale' ? '...' : 'Купить')
          ]),

          filteredProducts.map((product) => {
            const isRecommended = product.id === recommendedId;
            return h('div', {
              key: product.id,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                background: isRecommended ? '#131d33' : '#0f1729',
                borderRadius: '8px',
                border: isRecommended ? '1px solid #facc15' : '1px solid #1f3552',
                transition: 'background 0.2s ease'
              }
            }, [
              h('span', { style: { fontSize: '24px' } }, product.icon),
              h('div', { style: { flex: 1 } }, [
                h('div', { style: { fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' } }, [
                  product.name,
                  isRecommended && h('span', {
                    style: {
                      fontSize: '9px',
                      background: '#facc15',
                      color: '#1a1a2e',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      fontWeight: 'bold'
                    }
                  }, 'REC')
                ]),
                h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, product.description)
              ]),
              h('div', { style: { textAlign: 'right' } }, [
                h('div', { style: { fontWeight: 'bold', color: '#facc15', fontSize: '13px' } }, `⭐ ${product.stars}`),
                h('button', {
                  onClick: () => handleBuy(product.id),
                  disabled: buying === product.id,
                  style: {
                    marginTop: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: buying === product.id ? '#274267' : '#4ade80',
                    color: buying === product.id ? '#8ba1bb' : '#0a1f12',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    cursor: buying === product.id ? 'not-allowed' : 'pointer'
                  }
                }, buying === product.id ? '...' : 'Купить'),
                h('button', {
                  onClick: async () => {
                    if (!walletAddress) {
                      await connect();
                      return;
                    }
                    // Placeholder TON payment flow
                    const tonPrice = (product.stars / 100).toFixed(2);
                    showToast(`TON Pay: ${product.name} — ${tonPrice} TON (placeholder)`, 'info', 3000);
                    Analytics.track('purchase_intent', { product_id: product.id, price: tonPrice, currency: 'ton' });
                  },
                  style: {
                    marginTop: '4px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #30527e',
                    background: '#1a3a5c',
                    color: '#dce9f9',
                    fontWeight: 'bold',
                    fontSize: '10px',
                    cursor: 'pointer',
                    display: 'block',
                    width: '100%'
                  }
                }, walletAddress ? '💎 Pay with TON' : '💎 Connect TON')
              ])
            ]);
          }),

          buyResult && h('div', {
            style: {
              padding: '8px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              background: buyResult.success ? '#1a3f25' : '#3f1a1a',
              color: buyResult.success ? '#4ade80' : '#ef4444',
              border: `1px solid ${buyResult.success ? '#2d5a3e' : '#5a2d2d'}`
            }
          }, buyResult.success
            ? `Покупка создана. Статус: ${buyResult.invoiceStatus || 'opened'}.`
            : buyResult.error)
        ]),

    showPremiumSuccess && h(PremiumPurchaseSuccess, {
      onClose: () => setShowPremiumSuccess(false)
    }),
    purchaseSuccess && h(PurchaseSuccess, {
      product: purchaseSuccess.product,
      effect: purchaseSuccess.effect,
      onClose: () => setPurchaseSuccess(null)
    })
  ]));
}
