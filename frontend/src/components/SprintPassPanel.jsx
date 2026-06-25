import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useColdGameState } from '../hooks/useGameState.js';
import { startTelegramPurchase } from '../utils/purchases.js';
import { formatRewardPayload } from '../utils/rewardFormatting.js';

function premiumRewardHasPendingCosmetics(payload = {}) {
  return Boolean(payload?.skin || payload?.avatarFrame);
}

function formatPremiumReward(payload = {}) {
  const parts = [];
  if (payload.energy) parts.push(`+${payload.energy} эн`);
  if (payload.commits) parts.push(`+${payload.commits} коммитов`);
  if (payload.commitsCurrent) parts.push(`+${payload.commitsCurrent} прог`);
  if (payload.xpTotal) parts.push(`+${payload.xpTotal} XP`);
  if (payload.xp) parts.push(`+${payload.xp} XP`);
  if (payload.stars) parts.push(`+${payload.stars} Stars`);
  if (payload.muCurrency) parts.push(`+${payload.muCurrency} μ`);
  if (payload.skin) parts.push('скин скоро');
  if (payload.avatarFrame) parts.push('рамка скоро');
  if (payload.depressionRelief) parts.push(`-${payload.depressionRelief} стресс`);
  if (payload.inventory?.coffee_cups) parts.push(`+${payload.inventory.coffee_cups} кофе`);
  if (payload.booster) parts.push(`бустер ${payload.booster}`);
  if (payload.title) parts.push(`титул ${payload.title}`);
  if (payload.skinFragment) parts.push(`фрагмент ${payload.skinFragment}`);
  return parts.join(', ') || 'Награда';
}

export default function SprintPassPanel({ open, onClose }) {
  const { initData } = useTelegram();
  const { pass, showToast, refreshPass, claimPassReward } = useColdGameState();
  const [claiming, setClaiming] = useState(null);
  const [unlockingPremium, setUnlockingPremium] = useState(false);
  const [xpSources, setXpSources] = useState(null);
  const rewards = pass?.rewards || [];
  const hasPremium = Boolean(pass?.playerPass?.isPremium);

  // Premium proximity nudge — find next premium reward within 2 levels
  const nextPremiumLevel = !hasPremium
    ? rewards
        .filter(r => r.level > playerPass?.currentLevel && r.level <= playerPass?.currentLevel + 2 && r.premiumReward)
        .find(() => true)
    : null;

  // Find next unclaimed free reward above current level
  const nextFreeReward = rewards.find(r => r.level > (playerPass?.currentLevel || 0) && !r.freeClaimed);

  // Completion percentage
  const completionPct = Math.round(((playerPass?.currentLevel || 0) / rewards.length) * 100);

  useEffect(() => {
    if (!open) return;
    apiRequest('/api/pass/xp-sources', { initData }).then(setXpSources).catch(() => null);
  }, [open, initData]);

  // Auto-scroll to current level on open
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`sprint-level-${playerPass?.currentLevel}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open, playerPass?.currentLevel]);

  useEffect(() => {
    if (!open || !rewards) return undefined;
    const handleKeyDown = (event) => {
      if (event.key < '1' || event.key > '9') return;
      const index = Number(event.key) - 1;
      const claimables = rewards.flatMap((reward) => {
        const entries = [];
        if (reward.unlocked && !reward.freeClaimed) entries.push({ level: reward.level, track: 'free' });
        if (reward.unlocked && hasPremium && !reward.premiumClaimed) entries.push({ level: reward.level, track: 'premium' });
        return entries;
      });
      const target = claimables[index];
      if (!target || claiming) return;
      handleClaim(target.level, target.track);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, rewards, hasPremium, claiming]);

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

  const { pass: passMeta, playerPass, premiumPassProduct } = pass;
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
      const payload = await claimPassReward(level, track);
      if (payload?.level || payload?.pass) {
        showToast('Награда получена!', 'success', 2000);
        await refreshPass();
      }
    } catch (err) {
      showToast(err?.message || 'Не удалось забрать награду', 'error', 2000);
    } finally {
      setClaiming(null);
    }
  }

  async function handleUnlockPremium() {
    if (unlockingPremium) return;
    setUnlockingPremium(true);
    try {
      const result = await startTelegramPurchase('premium_pass', initData);
      if (result.success) {
        showToast(result.status === 'opened' ? 'Invoice открыт. После оплаты Premium Pass активируется автоматически.' : 'Premium Pass куплен!', 'success', 3000);
        await refreshPass();
      }
    } catch (err) {
      showToast(err?.payload?.error || err?.message || 'Ошибка покупки', 'error', 2500);
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
    h('style', null, '@keyframes premiumPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1.0; } }\n.premium-nudge-star { animation: premiumPulse 2s infinite; color: #FFD700; font-size: 14px; }'),

    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #1f3552' }
    }, [
      h('strong', null, `🎯 ${passMeta.seasonName || 'Спринт-Пасс'} · ${completionPct}%`),
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
      nextFreeReward && h('div', { style: { marginTop: '6px', fontSize: '11px', color: '#8ba1bb' } }, [
        h('span', { style: { color: '#4ade80', marginRight: '4px' } }, '→'),
        h('span', { style: { color: '#4ade80' } }, 'Next: '),
        h('span', null, formatRewardPayload(nextFreeReward.freeReward)),
        h('span', { style: { color: '#8ba1bb', marginLeft: '4px' } }, `(ур. ${nextFreeReward.level})`),
      ]),
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
          h('div', { style: { color: '#facc15', fontWeight: 'bold', fontSize: '12px' } }, 'Premium Track'),
          h('div', { style: { color: '#c7ddf5', fontSize: '11px' } }, `Откройте эксклюзивные награды${premiumPassPrice ? ` · плановая цена ⭐ ${premiumPassPrice}` : ''}`)
        ]),
        h('button', {
          onClick: handleUnlockPremium,
          disabled: unlockingPremium,
          style: {
            padding: '6px 10px',
            borderRadius: '6px',
            border: 'none',
            background: unlockingPremium ? '#274267' : '#facc15',
            color: unlockingPremium ? '#8ba1bb' : '#1a1a2e',
            fontWeight: 'bold',
            fontSize: '11px',
            cursor: unlockingPremium ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap'
          }
        }, unlockingPremium ? '...' : `⭐ ${premiumPassPrice || 499} Купить`)
      ])
    ]),

    pass.catchUp && h('div', {
      style: {
        padding: '8px 14px',
        fontSize: '11px',
        color: '#c7ddf5',
        borderBottom: '1px solid #1f3552',
        background: '#12203a'
      }
    }, `Catch-up: +${pass.catchUp.catchUpXp} XP за ${pass.catchUp.missedDays} пропущ. дн. (avg ${pass.catchUp.avgDailyXP}/день)`),

    h('div', { style: { padding: '8px 14px', fontSize: '11px', color: '#8ba1bb', borderBottom: '1px solid #1f3552' } }, [
      h('div', null, 'Desktop shortcuts: клавиши 1-9 быстро забирают доступные награды.'),
      h('div', { style: { color: pass.weekendDoubleXpActive ? '#4ade80' : '#8ba1bb' } }, `Weekend x2: tap_xp, quest_xp, generator_xp, event_xp.${pass.weekendDoubleXpActive ? ' Активно сейчас.' : ''} Catch-up и ad_xp не удваиваются.`),
    ]),

    passMeta?.refund && h('div', {
      style: {
        padding: '8px 14px',
        fontSize: '11px',
        color: '#c7ddf5',
        borderBottom: '1px solid #1f3552',
        background: '#101a2d'
      }
    }, `Premium refund: ${Math.round((passMeta.refund.totalRefundPercent || 0) * 100)}% · stars ${Math.round(((passMeta.refund.currencySplit?.stars || 0) * 100))}% · ton ${Math.round(((passMeta.refund.currencySplit?.ton || 0) * 100))}% · ${passMeta.refund.distribution}`),

    xpSources && h('div', { style: { padding: '8px 14px', fontSize: '11px', color: '#8ba1bb' } }, [
      h('div', { style: { fontWeight: 700, marginBottom: '4px', color: '#c7ddf5' } }, 'Источники XP пасса'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        Object.entries(xpSources).map(([source, amount]) => {
          const labels = { quest: 'Квесты', minigame: 'Мини-игры', social: 'Соц.', tap: 'Тапы', other: 'Другое' };
          return h('span', { key: source, style: { background: '#131d33', padding: '3px 8px', borderRadius: '4px', border: '1px solid #1f3552' } }, `${labels[source] || source}: ${amount}`);
        })
      )
    ]),

    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 14px' } },
      rewards.map((r) => {
        const unlocked = r.unlocked;
        const isMilestone = r.level % 5 === 0;
        const isBigMilestone = r.level === 25 || r.level === 50;
        return h('div', {
          key: r.level,
          id: `sprint-level-${r.level}`,
          style: {
            display: 'grid',
            gridTemplateColumns: '36px 1fr 1fr',
            gap: '8px',
            alignItems: 'center',
            padding: isMilestone ? '10px 8px' : '8px',
            background: unlocked ? (isMilestone ? '#162a4a' : '#131d33') : '#0f1729',
            borderRadius: '8px',
            border: unlocked ? (isMilestone ? '2px solid #FFD700' : '1px solid #30527e') : '1px solid #1f3552',
            opacity: unlocked ? 1 : 0.6,
            boxShadow: isMilestone && unlocked ? '0 0 8px rgba(255,215,0,0.15)' : 'none',
          }
        }, [
          h('div', { style: { fontWeight: 'bold', fontSize: isMilestone ? '14px' : '13px', color: unlocked ? '#facc15' : '#8ba1bb' } }, [
            isBigMilestone && h('span', { style: { display: 'block', fontSize: '14px', marginBottom: '1px' } }, '🏆'),
            r.level,
          ]),

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
          h('div', { style: { position: 'relative' } }, [
            r.level === nextPremiumLevel?.level && h('span', {
              className: 'premium-nudge-star',
              style: { position: 'absolute', top: '-2px', right: '-2px', fontSize: '14px', lineHeight: 1, zIndex: 1 }
            }, '★'),
            h('div', { style: { fontSize: '10px', color: '#facc15', marginBottom: '2px' } }, 'Premium'),
            h('div', { style: { fontSize: '11px', color: '#c7ddf5' } }, formatPremiumReward(r.premiumReward)),
            r.level === nextPremiumLevel?.level && h('div', {
              style: { fontSize: '9px', color: '#FFD700', marginTop: '2px', animation: 'premiumPulse 2s infinite' }
            }, `${nextPremiumLevel.level - playerPass.currentLevel} ур. до награды!`),
            premiumRewardHasPendingCosmetics(r.premiumReward) && h('div', { style: { fontSize: '10px', color: '#facc15', marginTop: '3px' } }, 'Скин/рамка будут включены позже'),
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
            unlocked && !hasPremium && !r.premiumClaimed && h('span', { style: { fontSize: '10px', color: '#facc15' } }, '🔒'),
            r.premiumClaimed && h('span', { style: { fontSize: '10px', color: '#4ade80' } }, '✅')
          ])
        ]);
      })
    )
  ]));
}
