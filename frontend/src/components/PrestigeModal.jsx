import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { apiRequest } from '../utils/api.js';
import { audioManager } from '../utils/AudioManager.js';
import Confetti from './Confetti.jsx';

const COLORS = {
  bg: '#0f1b30',
  panel: '#16213e',
  accent: '#f59e0b',
  green: '#34d399',
  red: '#f87171',
  blue: '#60a5fa',
  text: '#e6edf7',
  muted: '#8899aa',
  gold: '#facc15',
};

const STAGE = { PREVIEW: 'preview', CONFIRM: 'confirm', RESULT: 'result', SHOP: 'shop' };

function StatRow({ label, value, color = COLORS.text }) {
  return h('div', {
    style: {
      display: 'flex', justifyContent: 'space-between',
      padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
      fontSize: '14px',
    }
  }, [
    h('span', { style: { color: COLORS.muted } }, label),
    h('span', { style: { color, fontWeight: '600' } }, String(value)),
  ]);
}

export default function PrestigeModal() {
  const gameState = useGameState();
  const { haptic, initData } = useTelegram() || {};
  const [stage, setStage] = useState(STAGE.PREVIEW);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [resultData, setResultData] = useState(null);
  const [shopData, setShopData] = useState(null);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);
  const [shopBuying, setShopBuying] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const audioDuckedRef = useRef(false);

  const prestigeLevel = gameState?.prestige?.level || 0;
  const prestigeAvailable = gameState?.prestige?.available === true;
  const refreshState = gameState?.reset;

  function resumeModalAudio() {
    if (!audioDuckedRef.current) return;
    audioDuckedRef.current = false;
    audioManager.resumeFromModal();
  }

  useEffect(() => {
    if (!visible) return;
    haptic?.('medium');
    audioManager.duckForModal();
    audioDuckedRef.current = true;
    fetchPreview();
    return () => resumeModalAudio();
  }, [visible]);

  async function fetchPreview() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest('/api/prestige/preview', { initData });
      setPreviewData(data);
      setConfirmReady(false);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function executePrestige() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest('/api/prestige/execute', {
        method: 'POST',
        initData,
        body: { confirm: true },
      });
      haptic?.('heavy');
      audioManager.play('levelup');
      setShowConfetti(true);
      setResultData(data);
      setStage(STAGE.RESULT);
      setConfirmReady(false);
      setTimeout(() => setShowConfetti(false), 2000);
      await refreshState?.();
    } catch (e) {
      setError(e.message || 'Prestige failed');
    } finally {
      setLoading(false);
    }
  }

  async function loadShop() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest('/api/prestige/shop', { initData });
      setShopData(data);
      setStage(STAGE.SHOP);
      setConfirmReady(false);
    } catch (e) {
      setError(e.message || 'Shop load failed');
    } finally {
      setLoading(false);
    }
  }

  async function buyItem(itemKey) {
    setShopBuying(itemKey);
    setError(null);
    try {
      const data = await apiRequest('/api/prestige/shop/buy', {
        method: 'POST',
        initData,
        body: { itemKey }
      });
      haptic?.('medium');
      audioManager.play('check');
      setShopData(prev => ({
        ...prev,
        prestigeCurrency: data.prestigeCurrency,
        items: prev.items.map(item =>
          item.key === itemKey ? { ...item, purchased: true } : item
        ),
      }));
      await refreshState?.();
    } catch (e) {
      setError(e.message || 'Purchase failed');
    } finally {
      setShopBuying(null);
    }
  }

  function close() {
    resumeModalAudio();
    setVisible(false);
    setStage(STAGE.PREVIEW);
    setPreviewData(null);
    setResultData(null);
    setShopData(null);
    setError(null);
    setShowConfetti(false);
    setConfirmReady(false);
  }

  if (!visible) {
    return h('button', {
      onClick: () => setVisible(true),
      style: {
        position: 'fixed', top: '52px', right: '70px', zIndex: 100,
        padding: '6px 14px', borderRadius: '8px',
        border: `1px solid ${prestigeAvailable ? COLORS.accent : COLORS.muted}`,
        background: prestigeAvailable ? 'rgba(245, 158, 11, 0.12)' : 'rgba(136, 153, 170, 0.12)',
        color: prestigeAvailable ? COLORS.accent : COLORS.muted,
        fontSize: '13px', fontWeight: '700', cursor: 'pointer',
        animation: prestigeAvailable ? 'pulse-prestige 1.5s infinite' : 'none',
        touchAction: 'manipulation',
      },
    }, prestigeAvailable ? `Prestige P${prestigeLevel}` : 'PP shop');
  }

  return h('div', {
    onPointerDown: (e) => { if (e.target === e.currentTarget) close(); },
    style: {
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(7, 12, 24, 0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', pointerEvents: 'auto', touchAction: 'manipulation',
    }
  }, [
    showConfetti && h(Confetti, null),
    h('div', {
      onPointerDown: (e) => { e.preventDefault(); e.stopPropagation(); },
      style: {
        position: 'relative', width: 'min(380px, 100%)',
        maxHeight: 'min(85vh, calc(100vh - 32px))', overflowY: 'auto',
        background: `linear-gradient(180deg, ${COLORS.panel} 0%, ${COLORS.bg} 100%)`,
        border: `2px solid ${COLORS.accent}`, borderRadius: '14px',
        padding: '20px', color: COLORS.text,
        boxShadow: '0 0 30px rgba(245, 158, 11, 0.2)',
      }
    }, [
      h('button', {
        onClick: close,
        style: {
          position: 'absolute', top: '8px', right: '8px',
          background: 'none', border: 'none', color: COLORS.muted,
          fontSize: '20px', cursor: 'pointer', padding: '4px 8px',
          touchAction: 'manipulation',
        }
      }, '\u00D7'),

      stage === STAGE.PREVIEW && renderPreview(previewData, loading, error, fetchPreview, loadShop, () => setStage(STAGE.CONFIRM)),
      stage === STAGE.CONFIRM && renderConfirm(previewData, loading, error, confirmReady, close, () => setConfirmReady(true), executePrestige),
      stage === STAGE.RESULT && renderResult(resultData, close, loadShop),
      stage === STAGE.SHOP && renderShop(shopData, error, shopBuying, buyItem, close, loadShop),
    ]),
  ]);
}

function renderPreview(data, loading, error, onRetry, onShop, onProceed) {
  if (loading) return h('div', { style: { textAlign: 'center', padding: '24px' } },
    h('span', { style: { color: COLORS.muted } }, 'Loading...')
  );
  if (error) return h('div', { style: { textAlign: 'center', padding: '24px' } }, [
    h('div', { style: { color: COLORS.red, marginBottom: '12px' } }, error),
    h('button', { onClick: onRetry, style: btnStyle(COLORS.blue) }, 'Retry'),
  ]);

  if (!data) return null;

  const symbol = `\u2192 P${(data.prestigeLevel || 0) + 1}`;

  return h('div', null, [
    h('div', { style: { textAlign: 'center', marginBottom: '16px' } },
      h('div', { style: { fontSize: '26px', marginBottom: '4px' } }, '\uD83C\uDFAF'),
      h('div', { style: { fontSize: '20px', fontWeight: '700', color: COLORS.accent } }, 'You are being hunted!'),
      h('div', { style: { fontSize: '13px', color: COLORS.muted, marginTop: '4px' } },
        `Prestige ${data.prestigeLevel || 0} ${symbol}`
      ),
    ),

    data.available ? null : h('div', {
      style: {
        textAlign: 'center', padding: '12px', background: 'rgba(248, 113, 113, 0.1)',
        borderRadius: '8px', marginBottom: '12px', fontSize: '13px', color: COLORS.red,
      }
    }, `Need ${data.requiredXp} XP total (you have ${data.currentXp})`),

    data.available && h('div', { style: { marginBottom: '16px' } }, [
      h('div', { style: { fontSize: '14px', fontWeight: '600', color: COLORS.accent, marginBottom: '8px' } }, 'Bonuses this prestige:'),
      h('div', { style: { paddingLeft: '8px', borderLeft: `2px solid ${COLORS.green}` } },
        (data.bonuses || []).map((b, i) =>
          h('div', { key: i, style: { fontSize: '13px', padding: '3px 0', color: COLORS.green } },
            `+ ${b.name}: ${b.detail}`
          )
        )
      ),
      h('div', { style: { fontSize: '13px', color: COLORS.muted, marginTop: '10px' } },
        `Prestige currency: +${data.prestigeCurrencyEarned || 0} (total: ${data.totalPrestigeCurrency || 0})`
      ),
    ]),

    h('button', {
      onClick: data.available ? onProceed : undefined,
      disabled: !data.available,
      style: {
        ...btnStyle(data.available ? COLORS.accent : COLORS.muted),
        width: '100%',
        marginTop: '8px',
        cursor: data.available ? 'pointer' : 'default',
        opacity: data.available ? 1 : 0.65,
      },
    }, data.available ? 'Change job \u2705' : 'Prestige locked'),

    !data.available && h('button', {
      onClick: onShop,
      style: { ...btnStyle(COLORS.blue), width: '100%', marginTop: '10px' },
    }, 'Open prestige shop'),
  ]);
}

function renderConfirm(data, loading, error, confirmReady, onBack, onArmConfirm, onExecute) {
  if (loading) return h('div', { style: { textAlign: 'center', padding: '24px' } },
    h('span', { style: { color: COLORS.muted } }, 'Processing...')
  );
  if (error) return h('div', { style: { textAlign: 'center', padding: '24px' } }, [
    h('div', { style: { color: COLORS.red, marginBottom: '12px' } }, error),
    h('button', { onClick: onBack, style: btnStyle(COLORS.muted) }, 'Back'),
  ]);

  return h('div', null, [
    h('div', { style: { textAlign: 'center', marginBottom: '16px' } },
      h('div', { style: { fontSize: '22px', fontWeight: '700', color: COLORS.accent } }, 'Are you sure?'),
      h('div', { style: { fontSize: '13px', color: COLORS.muted, marginTop: '4px' } },
        'You keep your skin, streak, inventory, and teams.'
      ),
    ),

    h('div', { style: { marginBottom: '16px' } }, [
      h('div', { style: { fontSize: '13px', fontWeight: '600', color: COLORS.red, marginBottom: '6px' } }, 'Will reset:'),
      h('div', { style: { fontSize: '13px', color: COLORS.red, paddingLeft: '12px', lineHeight: '1.8' } },
        'xp, level, rank, energy, generators, boosters, events'
      ),
      h('div', { style: { fontSize: '13px', fontWeight: '600', color: COLORS.green, marginBottom: '6px', marginTop: '12px' } }, 'Will keep:'),
      h('div', { style: { fontSize: '13px', color: COLORS.green, paddingLeft: '12px', lineHeight: '1.8' } },
        'commitsTotal, skins, inventory, streak, battle pass, squads'
      ),
      h('div', { style: { fontSize: '13px', fontWeight: '600', color: COLORS.accent, marginBottom: '6px', marginTop: '12px' } }, 'You will get:'),
      h('div', { style: { fontSize: '13px', color: COLORS.accent, paddingLeft: '12px', lineHeight: '1.8' } },
        `+${data?.prestigeCurrencyEarned || 0} prestige currency, permanent tap + energy + crit bonuses`
      ),
    ]),

    h('div', { style: { display: 'flex', gap: '10px' } }, [
      h('button', {
        onClick: onBack,
        style: { ...btnStyle(COLORS.muted), flex: 1 },
      }, 'Cancel'),
      h('button', {
        onClick: confirmReady ? onExecute : onArmConfirm,
        style: { ...btnStyle(confirmReady ? COLORS.red : COLORS.accent), flex: 1 },
      }, confirmReady ? 'Execute reset \uD83D\uDD25' : 'I understand'),
    ]),
  ]);
}

function renderResult(data, onClose, onShop) {
  if (!data) return null;
  return h('div', { style: { textAlign: 'center' } }, [
    h('div', { style: { fontSize: '48px', marginBottom: '8px' } }, '\uD83C\uDF89'),
    h('div', { style: { fontSize: '18px', fontWeight: '700', color: COLORS.accent, marginBottom: '16px' } },
      'Welcome to the new team!'
    ),
    h('div', { style: { fontSize: '13px', color: COLORS.text, marginBottom: '12px' } },
      `Prestige Level ${data.prestigeLevel}`
    ),
    StatRow({ label: 'Prestige currency earned', value: `+${data.prestigeCurrencyEarned}`, color: COLORS.accent }),
    StatRow({ label: 'Total currency', value: String(data.totalPrestigeCurrency), color: COLORS.gold }),
    StatRow({ label: 'Tap multiplier', value: `x${data.bonuses.tapMult.toFixed(2)}`, color: COLORS.green }),
    StatRow({ label: 'Max energy add', value: `+${data.bonuses.maxEnergyAdd}`, color: COLORS.green }),
    StatRow({ label: 'Crit chance add', value: `+${Math.round(data.bonuses.critAdd * 100)}%`, color: COLORS.green }),

    h('div', { style: { display: 'flex', gap: '10px', marginTop: '16px' } }, [
      h('button', {
        onClick: onShop,
        style: { ...btnStyle(COLORS.accent), flex: 1 },
      }, 'Prestige shop'),
      h('button', {
        onClick: onClose,
        style: { ...btnStyle(COLORS.muted), flex: 1 },
      }, 'Close'),
    ]),
  ]);
}

function renderShop(data, error, buying, onBuy, onClose, onRefresh) {
  if (!data) {
    return h('div', { style: { textAlign: 'center', padding: '24px' } }, [
      h('span', { style: { color: COLORS.muted } }, 'Loading...'),
      error && h('button', { onClick: onRefresh, style: btnStyle(COLORS.blue) }, 'Retry'),
    ]);
  }

  return h('div', null, [
    h('div', { style: { textAlign: 'center', marginBottom: '12px' } },
      h('div', { style: { fontSize: '18px', fontWeight: '700', color: COLORS.accent } }, 'Prestige shop'),
      h('div', { style: { fontSize: '13px', color: COLORS.gold } },
        `\uD83D\uDCB0 ${data.prestigeCurrency} pro points`
      ),
    ),
    error && h('div', { style: { color: COLORS.red, fontSize: '12px', textAlign: 'center', marginBottom: '8px' } }, error),
    ...data.items.map(item =>
      h('div', {
        key: item.id,
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
          opacity: item.purchased ? 0.5 : 1,
        }
      }, [
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontSize: '13px', fontWeight: '600' } }, item.desc),
          h('div', { style: { fontSize: '11px', color: COLORS.muted } }, item.id),
        ]),
        item.purchased
          ? h('span', { style: { fontSize: '12px', color: COLORS.green } }, 'Owned')
          : h('button', {
              onClick: () => onBuy(item.key),
              disabled: buying === item.key || data.prestigeCurrency < item.cost,
              style: {
                ...btnStyle(COLORS.accent), padding: '4px 12px', fontSize: '12px',
                opacity: buying === item.key ? 0.5 : 1,
              },
            }, `${item.cost} PP`),
      ])
    ),
    h('button', {
      onClick: onClose,
      style: { ...btnStyle(COLORS.muted), width: '100%', marginTop: '16px' },
    }, 'Close'),
  ]);
}

function btnStyle(color) {
  return {
    background: `rgba(${hexToRgb(color)}, 0.15)`,
    border: `1px solid ${color}`,
    borderRadius: '8px',
    color,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    touchAction: 'manipulation',
  };
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
