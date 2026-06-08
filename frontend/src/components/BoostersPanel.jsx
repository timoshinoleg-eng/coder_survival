import { h } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useGameState } from '../hooks/useGameState.js';
import { audioManager } from '../utils/AudioManager.js';
import { Analytics } from '../utils/analytics.js';

const BOOSTER_ICONS = {
  espresso: '☕',
  red_bull_mode: '🐂',
  git_push_force: '💥',
  stackoverflow_premium: '📚',
  dark_theme: '🌑',
  mechanical_keyboard: '⌨️',
  no_ads_pass: '🚫',
  senior_developer: '👴',
};

const BOOSTER_DESCRIPTIONS = {
  espresso: '-20 depression, +100% click speed, 5 min',
  red_bull_mode: '+3 max energy, infinite energy, 30 min',
  git_push_force: 'Prestige reset without loss, +50% μ next cycle',
  stackoverflow_premium: 'Auto-bug-fix, 10 uses',
  dark_theme: 'Permanent cosmetic IDE skin',
  mechanical_keyboard: '+25% LOC/click, unique animation, permanent',
  no_ads_pass: 'No interstitials 7 days, ×2 rewarded rewards',
  senior_developer: '+500 LOC/s, auto-refactor, 30 days',
};

export default function BoostersPanel() {
  const { initData } = useTelegram();
  const { boostersOpen, closeBoosters, showToast, reset } = useGameState();
  const [boosters, setBoosters] = useState([]);
  const [stars, setStars] = useState(0);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(null);
  const [activating, setActivating] = useState(null);

  useEffect(() => {
    if (!boostersOpen) {
      setBoosters([]);
      setStars(0);
      return;
    }
    setLoading(true);
    apiRequest('/api/boosters', { initData })
      .then((payload) => {
        setBoosters(payload?.boosters || []);
        setStars(payload?.stars || 0);
        setLoading(false);
      })
      .catch(() => {
        showToast('Не удалось загрузить бустеры', 'error', 2500);
        setLoading(false);
      });
  }, [boostersOpen, initData, showToast]);

  useEffect(() => {
    if (boostersOpen) {
      Analytics.track('boosters_opened');
      audioManager.play('modalOpen');
      audioManager.duckForModal();
    } else {
      audioManager.resumeFromModal();
    }
  }, [boostersOpen]);

  const handleBuy = async (boosterSlug) => {
    setBuying(boosterSlug);
    try {
      const result = await apiRequest('/api/boosters/purchase', {
        method: 'POST',
        initData,
        body: { boosterSlug },
      });
      const boughtName = boosters.find(b => b.slug === boosterSlug)?.name || boosterSlug;
      showToast(`Куплен бустер: ${boughtName}`, 'success', 2000);
      Analytics.track('booster_purchased', { booster_slug: boosterSlug });
      setBoosters((prev) => prev.map((b) => {
        if (b.slug !== boosterSlug) return b;
        const updated = { ...b, owned: true };
        if (result.effect?.usesRemaining !== undefined) updated.usesRemaining = result.effect.usesRemaining;
        return updated;
      }));
      setStars((s) => s - (boosters.find((b) => b.slug === boosterSlug)?.starsCost || 0));
      await reset();
    } catch (err) {
      showToast(err?.payload?.error || 'Ошибка покупки', 'error', 2500);
    } finally {
      setBuying(null);
    }
  };

  const handleActivate = async (boosterSlug) => {
    setActivating(boosterSlug);
    try {
      const result = await apiRequest('/api/boosters/activate', {
        method: 'POST',
        initData,
        body: { boosterSlug },
      });
      const activatedName = boosters.find(b => b.slug === boosterSlug)?.name || boosterSlug;
      showToast(`Активировано: ${activatedName}`, 'success', 2000);
      setBoosters((prev) => prev.map((b) => {
        if (b.slug !== boosterSlug) return b;
        const updated = { ...b };
        if (result.usesRemaining !== undefined && result.usesRemaining !== null) {
          updated.usesRemaining = result.usesRemaining;
        } else {
          updated.owned = false;
        }
        return updated;
      }));
      await reset();
    } catch (err) {
      showToast(err?.payload?.error || 'Ошибка активации', 'error', 2500);
    } finally {
      setActivating(null);
    }
  };

  const formatDuration = (sec) => {
    if (!sec) return '';
    if (sec < 60) return `${sec}с`;
    if (sec < 3600) return `${Math.floor(sec / 60)}мин`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}ч`;
    return `${Math.floor(sec / 86400)}д`;
  };

  const getCountdown = (until) => {
    if (!until) return null;
    const diff = Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));
    if (diff <= 0) return null;
    return formatDuration(diff);
  };

  if (!boostersOpen) return null;

  return h('div', {
    onClick: closeBoosters,
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
    onClick: (e) => e.stopPropagation(),
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
      h('strong', null, '🚀 Бустеры'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        h('span', { style: { color: '#facc15', fontSize: '13px', fontWeight: 'bold' } }, `⭐ ${stars}`),
        h('button', {
          onClick: closeBoosters,
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
      ])
    ]),
    loading
      ? h('div', { style: { padding: '14px', color: '#9eb6d2' } }, 'Загрузка...')
      : h('div', {
          style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 14px' }
        }, boosters.map((booster) => {
          const countdown = getCountdown(booster.activeUntil);
          const canBuy = stars >= booster.starsCost && (!booster.permanent || !booster.owned);
          return h('div', {
            key: booster.slug,
            style: {
              background: '#0f1729',
              border: booster.owned ? '1px solid #4ade80' : '1px solid #1f3552',
              borderRadius: '8px',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              opacity: booster.owned && !booster.usesRemaining && !countdown ? 0.7 : 1
            }
          }, [
            h('div', { style: { fontSize: '28px', textAlign: 'center' } }, BOOSTER_ICONS[booster.slug] || '✨'),
            h('div', { style: { fontWeight: 600, fontSize: '13px', textAlign: 'center' } }, booster.name),
            h('div', { style: { fontSize: '11px', color: '#8ba1bb', textAlign: 'center', minHeight: '28px' } }, BOOSTER_DESCRIPTIONS[booster.slug] || ''),
            h('div', { style: { fontSize: '11px', color: '#facc15', textAlign: 'center', fontWeight: 'bold' } }, `⭐ ${booster.starsCost}`),
            booster.permanent && booster.owned
              ? h('div', { style: { textAlign: 'center', fontSize: '11px', color: '#4ade80', fontWeight: 'bold' } }, 'Куплено')
              : countdown
                ? h('div', { style: { textAlign: 'center', fontSize: '11px', color: '#4ade80' } }, `Активно: ${countdown}`)
                : booster.usesRemaining !== null && booster.usesRemaining > 0
                  ? h('div', { style: { textAlign: 'center', fontSize: '11px', color: '#60a5fa' } }, `Использований: ${booster.usesRemaining}`)
                  : h('button', {
                      onClick: () => handleBuy(booster.slug),
                      disabled: !canBuy || buying === booster.slug,
                      style: {
                        marginTop: '4px',
                        padding: '5px 0',
                        borderRadius: '6px',
                        border: 'none',
                        background: !canBuy ? '#274267' : '#4ade80',
                        color: !canBuy ? '#8ba1bb' : '#0a1f12',
                        fontWeight: 'bold',
                        fontSize: '11px',
                        cursor: !canBuy ? 'not-allowed' : 'pointer'
                      }
                    }, buying === booster.slug ? '...' : 'Купить'),
            booster.usesRemaining !== null && booster.usesRemaining > 0 && h('button', {
              onClick: () => handleActivate(booster.slug),
              disabled: activating === booster.slug,
              style: {
                marginTop: '2px',
                padding: '5px 0',
                borderRadius: '6px',
                border: 'none',
                background: activating === booster.slug ? '#274267' : '#3b82f6',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '11px',
                cursor: activating === booster.slug ? 'not-allowed' : 'pointer'
              }
            }, activating === booster.slug ? '...' : 'Активировать')
          ]);
        }))
  ]));
}
