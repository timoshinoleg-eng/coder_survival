import { h } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { startTelegramPurchase } from '../utils/purchases.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useGameState } from '../hooks/useGameState.js';
import { audioManager } from '../utils/AudioManager.js';

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
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(null);
  const [buyResult, setBuyResult] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');

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

    return () => { cancelled = true; };
  }, [shopOpen]);

  useEffect(() => {
    if (shopOpen) {
      audioManager.play('modalOpen');
      audioManager.duckForModal();
    } else {
      audioManager.resumeFromModal();
    }
  }, [shopOpen]);

  const handleBuy = async (productId) => {
    setBuying(productId);
    setBuyResult(null);
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
        if (productId === 'premium_pass') {
          showToast('Premium Pass покупка создана. После оплаты откроется premium track.', 'success', 3000);
        } else if (result.status === 'opened') {
          showToast('Invoice открыт. После оплаты товар поступит автоматически.', 'info', 3000);
        } else {
          showToast('Покупка завершена! Товар скоро будет выдан.', 'success', 3000);
        }
      }
    } catch (err) {
      setBuyResult({ success: false, productId, error: err.payload?.error || err.message || 'Ошибка покупки' });
      showToast(err.payload?.error || 'Ошибка покупки', 'error', 2500);
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
                }, buying === product.id ? '...' : 'Купить')
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
        ])
  ]));
}
