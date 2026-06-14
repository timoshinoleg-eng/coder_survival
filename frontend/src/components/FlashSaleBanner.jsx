import { h } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { useGameState } from '../hooks/useGameState.js';

const Z_INDEX_BANNER = 30;

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function FlashSaleBanner({ suppressed = false }) {
  const { setShopOpen } = useGameState();
  const [sales, setSales] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);

  const fetchSales = useCallback(async () => {
    try {
      const payload = await apiRequest('/api/shop/active-sales');
      setSales({
        dailyDeal: payload?.dailyDeal || null,
        flashSale: payload?.flashSale || null
      });
    } catch (err) {
      console.warn('Failed to load active sales:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
    const interval = setInterval(fetchSales, 60_000);
    return () => clearInterval(interval);
  }, [fetchSales]);

  useEffect(() => {
    if (!sales) return;
    const active = sales.flashSale || sales.dailyDeal;
    if (!active) return;

    const endsAt = new Date(active.endsAt).getTime();
    const tick = () => {
      const remaining = endsAt - Date.now();
      setTimeLeft(Math.max(0, remaining));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sales]);

  if (loading || suppressed) return null;

  const active = sales?.flashSale || sales?.dailyDeal;
  if (!active) return null;

  const isFlash = !!sales?.flashSale;
  const discount = isFlash
    ? sales.flashSale.discount_percent
    : Math.round((1 - active.discounted_stars / active.original_stars) * 100);

  return h('div', {
    onClick: () => setShopOpen(true),
    style: {
      position: 'relative',
      margin: '8px 8px 0',
      zIndex: Z_INDEX_BANNER,
      background: isFlash
        ? 'linear-gradient(90deg, #7c2d12, #9a3412)'
        : 'linear-gradient(90deg, #1a3a5c, #274267)',
      border: isFlash ? '1px solid #f97316' : '1px solid #30527e',
      borderRadius: '10px',
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      cursor: 'pointer',
      animation: 'fade-in-up 0.3s ease-out'
    }
  }, [
    h('div', {
      style: {
        background: '#ef4444',
        color: '#fff',
        fontSize: '11px',
        fontWeight: 'bold',
        padding: '3px 8px',
        borderRadius: '6px',
        whiteSpace: 'nowrap'
      }
    }, `-${discount}%`),
    h('div', { style: { flex: 1, minWidth: 0 } }, [
      h('div', { style: { fontWeight: 700, fontSize: '12px', color: '#facc15' } },
        isFlash ? '⚡ Flash Sale' : '📅 Daily Deal'
      ),
      h('div', { style: { fontSize: '11px', color: '#e6edf7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
        active.product?.name || active.item_slug
      )
    ]),
    h('div', { style: { textAlign: 'right' } }, [
      h('div', { style: { fontSize: '11px', color: '#facc15', fontWeight: 'bold', fontFamily: 'monospace' } },
        formatCountdown(timeLeft)
      ),
      h('div', { style: { fontSize: '10px', color: '#9eb6d2' } },
        isFlash ? 'Осталось' : 'До сброса'
      )
    ])
  ]);
}
