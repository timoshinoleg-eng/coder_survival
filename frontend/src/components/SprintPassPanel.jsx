import { h } from 'preact';
import { useState } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { startTelegramPurchase } from '../utils/purchases.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useGameState } from '../hooks/useGameState.js';
import { formatRewardPayload } from '../utils/rewardFormatting.js';

export default function SprintPassPanel({ open, onClose }) {
  const { initData } = useTelegram();
  const { pass, showToast, reset } = useGameState();
  const [claiming, setClaiming] = useState(null);
  const [unlockingPremium, setUnlockingPremium] = useState(false);

  if (!open) return null;

  if (!pass) {
    return h('div', {
      onClick: onClose,
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
        background: '#10192d',
        border: '1px solid #274267',
        borderRadius: '8px',
        color: '#e6edf7',
        padding: '14px'
      }
    }, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        h('strong', null, '🎯 Спринт-Пасс'),
        h('button', { onClick: onClose, style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '18px', cursor: 'pointer', padding: 0, lineHeight: 1 } }, '×')
      ]),
      h('div', { style: { padding: '14px 0', color: '#9eb6d2', fontSize: '13px' } }, 'Сейчас нет активного сезона.')
    ]));
  }

  const { pass: passMeta, playerPass, rewards, premiumPassProduct } = pass;
  const hasPremium = Boolean(playerPass?.isPremium);
  const premiumPassPrice = premiumPassProduct?.stars ?? null;
  const currentReward = rewards.find((reward) => reward.level === playerPass.currentLevel) || null;
  const currentLevelRequiredXp = currentReward?.requiredXp || 0;
  const isMaxLevel = playerPass.currentLevel >= rewards.length;
  const currentLevelProgress = isMaxLevel || currentLevelRequiredXp <= 0
    ? 100
    : Math.min(100, Math.round((playerPass.currentXp / currentLevelRequiredXp) * 100));

  async function handleClaim(level, track) {
    setClaiming(`${level}:${track}`);
    try {
      const payload = await apiRequest('/api/pass/claim', {
        method: 'POST',
        initData,
        body: { level, track }
      });
      if (payload?.success) {
        showToast('Награда получена!', 'success', 2000);
        window.location.reload();
      }
    } catch (err) {
      showToast(err?.message || 'Не удалось забрать награду', 'error', 2000);
    } finally {
      setClaiming(null);
    }
  }

  async function handleUnlockPremium() {
    setUnlockingPremium(true);
    try {
      const result = await startTelegramPurchase('premium_pass', initData);
      if (result.success) {
        showToast('Premium Pass покупка создана. После оплаты трек обновится.', 'success', 3000);
        setTimeout(() => {
          reset();
        }, 1200);
      }
    } catch (err) {
      showToast(err?.message || 'Не удалось купить Premium Pass', 'error', 2500);
    } finally {
      setUnlockingPremium(false);
    }
  }

  return h('div', {
    onClick: onClose,
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
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #1f3552' }
    }, [
      h('strong', null, `🎯 ${passMeta.seasonName || 'Спринт-Пасс'}`),
      h('button', { onClick: onClose, style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '18px', cursor: 'pointer', padding: 0, lineHeight: 1 } }, '×')
    ]),

    h('div', { style: { padding: '10px 14px', borderBottom: '1px solid #1f3552', background: '#131d33' } }, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#8ba1bb' } }, [
        h('span', null, `Уровень ${playerPass.currentLevel} / ${rewards.length}`),
        h('span', null, isMaxLevel ? 'MAX' : `XP: ${playerPass.currentXp} / ${currentLevelRequiredXp}`)
      ]),
      h('div', {
        style: { flex: 1, height: '8px', background: '#0f3460', borderRadius: '4px', overflow: 'hidden', marginTop: '6px' }
      }, h('div', {
        style: {
          width: `${currentLevelProgress}%`,
          height: '100%',
          background: '#facc15',
          transition: 'width 0.4s ease'
        }
      })),
      !hasPremium && h('div', {
        style: {
          marginTop: '10px',
          padding: '10px',
          borderRadius: '8px',
          border: '1px solid #5b4a0a',
          background: 'linear-gradient(90deg, rgba(250, 204, 21, 0.12), rgba(250, 204, 21, 0.04))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px'
        }
        }, [
        h('div', null, [
          h('div', { style: { color: '#facc15', fontWeight: 'bold', fontSize: '12px' } }, 'Premium Track закрыт'),
          h('div', { style: { color: '#c7ddf5', fontSize: '11px' } }, `Открой premium-награды текущего сезона${premiumPassPrice ? ` за ⭐ ${premiumPassPrice}` : ''}`)
        ]),
        h('button', {
          onClick: handleUnlockPremium,
          disabled: unlockingPremium,
          style: {
            padding: '6px 10px',
            borderRadius: '6px',
            border: 'none',
            background: unlockingPremium ? '#6b7280' : '#facc15',
            color: '#1a1a2e',
            fontWeight: 'bold',
            fontSize: '11px',
            cursor: unlockingPremium ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap'
          }
        }, unlockingPremium ? '...' : 'Купить Premium')
      ])
    ]),

    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 14px' } },
      rewards.map((r) => {
        const unlocked = r.unlocked;
        return h('div', {
          key: r.level,
          style: {
            display: 'grid',
            gridTemplateColumns: '36px 1fr 1fr',
            gap: '8px',
            alignItems: 'center',
            padding: '8px',
            background: unlocked ? '#131d33' : '#0f1729',
            borderRadius: '8px',
            border: unlocked ? '1px solid #30527e' : '1px solid #1f3552',
            opacity: unlocked ? 1 : 0.6
          }
        }, [
          h('div', { style: { fontWeight: 'bold', fontSize: '13px', color: unlocked ? '#facc15' : '#8ba1bb' } }, r.level),

          // Free track
          h('div', null, [
            h('div', { style: { fontSize: '10px', color: '#8ba1bb', marginBottom: '2px' } }, 'Free'),
            h('div', { style: { fontSize: '11px', color: '#c7ddf5' } }, formatRewardPayload(r.freeReward)),
            unlocked && !r.freeClaimed && h('button', {
              onClick: () => handleClaim(r.level, 'free'),
              disabled: claiming === `${r.level}:free`,
              style: {
                marginTop: '4px',
                padding: '3px 8px',
                borderRadius: '5px',
                border: 'none',
                background: claiming === `${r.level}:free` ? '#274267' : '#4ade80',
                color: claiming === `${r.level}:free` ? '#8ba1bb' : '#0a1f12',
                fontWeight: 'bold',
                fontSize: '10px',
                cursor: 'pointer'
              }
            }, claiming === `${r.level}:free` ? '...' : 'Забрать'),
            r.freeClaimed && h('span', { style: { fontSize: '10px', color: '#4ade80' } }, '✅')
          ]),

          // Premium track
          h('div', null, [
            h('div', { style: { fontSize: '10px', color: '#facc15', marginBottom: '2px' } }, 'Premium'),
            h('div', { style: { fontSize: '11px', color: '#c7ddf5' } }, formatRewardPayload(r.premiumReward)),
            unlocked && hasPremium && !r.premiumClaimed && h('button', {
              onClick: () => handleClaim(r.level, 'premium'),
              disabled: claiming === `${r.level}:premium`,
              style: {
                marginTop: '4px',
                padding: '3px 8px',
                borderRadius: '5px',
                border: 'none',
                background: claiming === `${r.level}:premium` ? '#274267' : '#facc15',
                color: claiming === `${r.level}:premium` ? '#8ba1bb' : '#1a1a2e',
                fontWeight: 'bold',
                fontSize: '10px',
                cursor: 'pointer'
              }
            }, claiming === `${r.level}:premium` ? '...' : 'Забрать'),
            unlocked && !hasPremium && !r.premiumClaimed && h('span', { style: { fontSize: '10px', color: '#facc15' } }, '🔒 Premium'),
            r.premiumClaimed && h('span', { style: { fontSize: '10px', color: '#4ade80' } }, '✅')
          ])
        ]);
      })
    )
  ]));
}
