import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { useColdGameState } from '../hooks/useGameState.js';
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
  mu: '#8b5cf6',
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
  const gameState = useColdGameState();
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

  const prestigeCount = gameState?.prestige?.prestigeCount || 0;
  const muAvailable = gameState?.prestige?.muAvailable === true;
  const muCurrency = gameState?.prestige?.muCurrency || 0;
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
        border: `1px solid ${muAvailable ? COLORS.mu : COLORS.muted}`,
        background: muAvailable ? 'rgba(139, 92, 246, 0.12)' : 'rgba(136, 153, 170, 0.12)',
        color: muAvailable ? COLORS.mu : COLORS.muted,
        fontSize: '13px', fontWeight: '700', cursor: 'pointer',
        animation: muAvailable ? 'pulse-prestige 1.5s infinite' : 'none',
        touchAction: 'manipulation',
      },
    }, muAvailable ? `Prestige μ${muCurrency}` : 'μ shop');
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
        border: `2px solid ${COLORS.mu}`, borderRadius: '14px',
        padding: '20px', color: COLORS.text,
        boxShadow: '0 0 30px rgba(139, 92, 246, 0.2)',
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

  const symbol = `\u2192 P${(data.prestigeCount || 0) + 1}`;

  return h('div', null, [
    h('div', { style: { textAlign: 'center', marginBottom: '16px' } },
      h('div', { style: { fontSize: '26px', marginBottom: '4px' } }, '\uD83C\uDFAF'),
      h('div', { style: { fontSize: '20px', fontWeight: '700', color: COLORS.mu } }, '\u03bc Prestige'),
      h('div', { style: { fontSize: '13px', color: COLORS.muted, marginTop: '4px' } },
        `Prestige ${data.prestigeCount || 0} ${symbol}`
      ),
    ),

    data.available ? null : h('div', {
      style: {
        textAlign: 'center', padding: '12px', background: 'rgba(248, 113, 113, 0.1)',
        borderRadius: '8px', marginBottom: '12px', fontSize: '13px', color: COLORS.red,
      }
    }, `Need ${Number(data.requiredLoc).toLocaleString()} lifetime LOC (you have ${Number(data.lifetimeLoc).toLocaleString()})`),

    data.available && h('div', { style: { marginBottom: '16px' } }, [
      StatRow({ label: 'Lifetime LOC', value: Number(data.lifetimeLoc).toLocaleString(), color: COLORS.text }),
      StatRow({ label: 'Current \u03bc', value: data.muCurrency ?? 0, color: COLORS.mu }),
      StatRow({ label: 'Projected \u03bc', value: data.projectedMu ?? 0, color: COLORS.green }),
      StatRow({ label: '\u03bc earned this reset', value: `+${data.deltaMu ?? 0}`, color: COLORS.gold }),
      h('div', { style: { fontSize: '14px', fontWeight: '600', color: COLORS.mu, marginBottom: '8px', marginTop: '12px' } }, 'Bonuses this prestige:'),
      h('div', { style: { paddingLeft: '8px', borderLeft: `2px solid ${COLORS.green}` } },
        [
          h('div', { style: { fontSize: '13px', padding: '3px 0', color: COLORS.green } },
            `+ Passive LOC: ${((data.bonusesThisPrestige?.passiveLocMult || 1) * 100 - 100).toFixed(1)}%`
          ),
          h('div', { style: { fontSize: '13px', padding: '3px 0', color: COLORS.green } },
            `+ Click power: ${((data.bonusesThisPrestige?.clickPowerMult || 1) * 100 - 100).toFixed(1)}%`
          ),
        ]
      ),
    ]),

    h('button', {
      onClick: data.available ? onProceed : undefined,
      disabled: !data.available,
      style: {
        ...btnStyle(data.available ? COLORS.mu : COLORS.muted),
        width: '100%',
        marginTop: '8px',
        cursor: data.available ? 'pointer' : 'default',
        opacity: data.available ? 1 : 0.65,
      },
    }, data.available ? 'Prestige Now \u2705' : 'Prestige locked'),

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
      h('div', { style: { fontSize: '22px', fontWeight: '700', color: COLORS.mu } }, 'Are you sure?'),
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
        'lifetime LOC, commitsTotal, skins, inventory, streak, battle pass, squads, \u03bc currency'
      ),
      h('div', { style: { fontSize: '13px', fontWeight: '600', color: COLORS.mu, marginBottom: '6px', marginTop: '12px' } }, 'You will get:'),
      h('div', { style: { fontSize: '13px', color: COLORS.mu, paddingLeft: '12px', lineHeight: '1.8' } },
        `+${data?.deltaMu || 0} \u03bc currency, permanent passive LOC + click bonuses`
      ),
    ]),

    h('div', { style: { display: 'flex', gap: '10px' } }, [
      h('button', {
        onClick: onBack,
        style: { ...btnStyle(COLORS.muted), flex: 1 },
      }, 'Cancel'),
      h('button', {
        onClick: confirmReady ? onExecute : onArmConfirm,
        style: { ...btnStyle(confirmReady ? COLORS.red : COLORS.mu), flex: 1 },
      }, confirmReady ? 'Execute reset \uD83D\uDD25' : 'I understand'),
    ]),
  ]);
}

function renderResult(data, onClose, onShop) {
  if (!data) return null;
  return h('div', { style: { textAlign: 'center' } }, [
    h('div', { style: { fontSize: '48px', marginBottom: '8px' } }, '\uD83C\uDF89'),
    h('div', { style: { fontSize: '18px', fontWeight: '700', color: COLORS.mu, marginBottom: '16px' } },
      'Prestige complete!'
    ),
    h('div', { style: { fontSize: '13px', color: COLORS.text, marginBottom: '12px' } },
      `Prestige Count ${data.prestigeCount}`
    ),
    StatRow({ label: '\u03bc earned', value: `+${data.muEarned}`, color: COLORS.mu }),
    StatRow({ label: 'Total \u03bc', value: String(data.totalMu), color: COLORS.gold }),
    StatRow({ label: 'Passive LOC mult', value: `x${data.bonuses.passiveLocMult.toFixed(3)}`, color: COLORS.green }),
    StatRow({ label: 'Click power mult', value: `x${data.bonuses.clickPowerMult.toFixed(3)}`, color: COLORS.green }),

    h('div', { style: { display: 'flex', gap: '10px', marginTop: '16px' } }, [
      h('button', {
        onClick: onShop,
        style: { ...btnStyle(COLORS.mu), flex: 1 },
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
      h('div', { style: { fontSize: '18px', fontWeight: '700', color: COLORS.mu } }, 'Prestige shop'),
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
                ...btnStyle(COLORS.mu), padding: '4px 12px', fontSize: '12px',
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
