import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useColdGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { startTelegramPurchase } from '../utils/purchases.js';
import { Analytics } from '../utils/analytics.js';
import Confetti from './Confetti.jsx';

function iconForReward(reward) {
  if (!reward) return '·';
  if (reward.skin || reward.skinFragment) return '🎭';
  if (reward.avatarFrame) return '🖼';
  if (reward.muCurrency) return 'μ';
  if (reward.stars) return '⭐';
  if (reward.title) return '🏷';
  if (reward.booster) return '🚀';
  if (reward.energy) return '⚡';
  if (reward.commitsCurrent) return '💻';
  if (reward.depressionRelief) return '🧘';
  return '⚡';
}

function labelForReward(reward) {
  if (!reward) return '—';
  const parts = [];
  if (reward.energy) parts.push(`+${reward.energy} эн`);
  if (reward.commitsCurrent) parts.push(`+${reward.commitsCurrent} коммитов`);
  if (reward.stars) parts.push(`+${reward.stars}⭐`);
  if (reward.skin) parts.push(`скин ${reward.skin}`);
  if (reward.skinFragment) parts.push(`фрагмент ${reward.skinFragment}`);
  if (reward.avatarFrame) parts.push(`рамка ${reward.avatarFrame}`);
  if (reward.muCurrency) parts.push(`+${reward.muCurrency} μ`);
  if (reward.depressionRelief) parts.push(`-${reward.depressionRelief} стресс`);
  if (reward.booster) parts.push(`бустер ${reward.booster}`);
  if (reward.title) parts.push(`титул ${reward.title}`);
  return parts.join(', ') || 'Награда';
}

function premiumRewardHasPendingCosmetics(reward) {
  return Boolean(reward?.skin || reward?.avatarFrame);
}

function labelForPremiumReward(reward) {
  if (!reward) return '—';
  const parts = [];
  if (reward.energy) parts.push(`+${reward.energy} эн`);
  if (reward.commitsCurrent) parts.push(`+${reward.commitsCurrent} коммитов`);
  if (reward.stars) parts.push(`+${reward.stars}⭐`);
  if (reward.muCurrency) parts.push(`+${reward.muCurrency} μ`);
  if (reward.skin) parts.push('скин скоро');
  if (reward.skinFragment) parts.push(`фрагмент ${reward.skinFragment}`);
  if (reward.avatarFrame) parts.push('рамка скоро');
  if (reward.depressionRelief) parts.push(`-${reward.depressionRelief} стресс`);
  if (reward.booster) parts.push(`бустер ${reward.booster}`);
  if (reward.title) parts.push(`титул ${reward.title}`);
  return parts.join(', ') || 'Награда';
}

export default function PassPanel() {
  const { pass, refreshPass, claimPassReward, showToast } = useColdGameState();
  const { initData } = useTelegram();
  const [open, setOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [claiming, setClaiming] = useState(null);
  const [buyingPremium, setBuyingPremium] = useState(false);
  const prevLevelRef = useRef(null);

  const passMeta = pass?.pass || null;
  const playerPass = pass?.playerPass || null;
  const rewards = pass?.rewards || [];
  const currentLevel = Number(playerPass?.currentLevel || 0);
  const isPremium = Boolean(playerPass?.isPremium);
  const daysRemaining = passMeta?.daysRemaining ?? 0;
  const totalLevels = 50;

  // Premium proximity nudge — find next premium reward within 2 levels
  const nextPremiumLevel = !isPremium
    ? rewards
        .filter(r => r.level > currentLevel && r.level <= currentLevel + 2 && r.premiumReward)
        .find(() => true)
    : null;

  const nextLevelRequired = rewards.find(r => r.level === currentLevel)?.requiredXp || 0;
  const currentLevelProgress = (!nextLevelRequired || currentLevel >= totalLevels)
    ? 100
    : Math.min(100, Math.round((playerPass?.currentXp || 0) / nextLevelRequired * 100));

  // Find next unclaimed free reward above current level
  const nextFreeReward = rewards.find(r => r.level > currentLevel && !r.freeClaimed);

  // Completion percentage
  const completionPct = Math.round((currentLevel / totalLevels) * 100);

  useEffect(() => {
    if (prevLevelRef.current !== null && currentLevel > prevLevelRef.current) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 1200);
      return () => clearTimeout(t);
    }
    prevLevelRef.current = currentLevel;
  }, [currentLevel]);

  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`pass-level-${currentLevel}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open, currentLevel]);

  async function handleClaim(level, track) {
    setClaiming(`${level}:${track}`);
    try {
      const payload = await claimPassReward(level, track);
      if (payload?.success) {
        showToast('Награда получена!', 'success', 2000);
        await refreshPass();
      }
    } catch (err) {
      showToast(err?.message || 'Не удалось забрать награду', 'error', 2000);
    } finally {
      setClaiming(null);
    }
  }

  async function handleBuyPremium() {
    if (buyingPremium) return;
    setBuyingPremium(true);
    try {
      const result = await startTelegramPurchase('premium_pass', initData);
      if (result.success) {
        showToast(result.status === 'opened' ? 'Invoice открыт. После оплаты Premium Pass активируется автоматически.' : 'Premium Pass куплен!', 'success', 3000);
        Analytics.track('purchase_completed', { product_id: 'premium_pass', price: 499, currency: 'stars' });
        await refreshPass();
      }
    } catch (err) {
      showToast(err?.payload?.error || err?.message || 'Ошибка покупки', 'error', 2500);
      Analytics.track('purchase_failed', { product_id: 'premium_pass', stage: 'checkout' });
    } finally {
      setBuyingPremium(false);
    }
  }

  const claimableFree = rewards.filter(r => r.unlocked && !r.freeClaimed).length;
  const claimablePremium = isPremium
    ? rewards.filter(r => r.unlocked && !r.premiumClaimed).length
    : 0;

  return h('section', {
    style: {
      margin: '8px 12px',
      border: '1px solid #263d5f',
      borderRadius: '8px',
      background: '#10192d',
      color: '#e6edf7',
      overflow: 'hidden',
      position: 'relative',
    },
  }, [
    showConfetti && h(Confetti),
    h('style', null, '@keyframes passPulse { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 16px rgba(250,204,21,.45); } }\n@keyframes premiumPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1.0; } }\n.premium-nudge-star { animation: premiumPulse 2s infinite; color: #FFD700; font-size: 14px; }'),

    // Header
    h('button', {
      type: 'button',
      onClick: () => {
        setOpen((value) => {
          if (!value) {
            try { Analytics.track('pass_panel_opened', { currentLevel, isPremium }); } catch (_) {}
          }
          return !value;
        });
        refreshPass?.();
      },
      style: {
        width: '100%',
        minHeight: '48px',
        border: 'none',
        background: '#121d33',
        color: '#e6edf7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        fontWeight: 800,
        cursor: 'pointer',
      },
    }, [
      h('span', null, `${passMeta?.seasonName || 'Season Pass'} · ${currentLevel}/${totalLevels} (${completionPct}%)`),
      h('span', { style: { color: '#8ba1bb', fontSize: '12px' } }, `${daysRemaining} дн.`),
    ]),

    // Progress bar
    h('div', { style: { padding: '6px 12px' } }, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8ba1bb', marginBottom: '4px' } }, [
        h('span', null, `Уровень ${currentLevel} / ${totalLevels}`),
        h('span', null, currentLevel >= totalLevels ? 'MAX' : `XP: ${playerPass?.currentXp || 0} / ${nextLevelRequired}`),
      ]),
      h('div', {
        style: { flex: 1, height: '8px', background: '#0f3460', borderRadius: '4px', overflow: 'hidden' }
      }, h('div', {
        style: {
          width: `${currentLevel >= totalLevels ? 100 : currentLevelProgress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #60a5fa, #facc15)',
          transition: 'width 0.4s ease'
        }
      })),
    ]),

    // Next free reward preview
    nextFreeReward && h('div', { style: { padding: '4px 12px 0', fontSize: '11px', color: '#8ba1bb' } }, [
      h('span', { style: { color: '#4ade80', marginRight: '4px' } }, '→'),
      h('span', { style: { color: '#4ade80' } }, 'Next: '),
      h('span', null, iconForReward(nextFreeReward.freeReward)),
      h('span', { style: { marginLeft: '4px' } }, labelForReward(nextFreeReward.freeReward)),
      h('span', { style: { color: '#8ba1bb', marginLeft: '4px' } }, `(ур. ${nextFreeReward.level})`),
    ]),

    // Season timer & claimable summary
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 12px 8px',
        fontSize: '11px',
        color: '#8ba1bb',
      }
    }, [
      h('span', null, `Сезон закончится через ${daysRemaining} дней`),
      h('span', { style: { color: claimableFree > 0 || claimablePremium > 0 ? '#facc15' : '#4ade80' } },
        claimableFree > 0 || claimablePremium > 0
          ? `🎁 ${claimableFree + claimablePremium} наград`
          : 'Все награды забраны'
      ),
    ]),

    // Premium upgrade banner
    !isPremium && h('div', {
      style: {
        margin: '0 12px 10px',
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
        h('div', { style: { color: '#c7ddf5', fontSize: '11px' } }, 'Откройте эксклюзивные награды · ⭐ 499')
      ]),
      h('button', {
        type: 'button',
        onClick: handleBuyPremium,
        disabled: buyingPremium,
        style: {
          padding: '8px 10px',
          borderRadius: '6px',
          border: 'none',
          background: buyingPremium ? '#274267' : '#facc15',
          color: buyingPremium ? '#8ba1bb' : '#1a1a2e',
          fontWeight: 'bold',
          fontSize: '11px',
          cursor: buyingPremium ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap'
        }
      }, buyingPremium ? '...' : '⭐ 499 Купить')
    ]),

    // Expanded 50-level track
    open && h('div', {
      style: {
        maxHeight: '55vh',
        overflowY: 'auto',
        padding: '0 12px 12px',
      }
    }, [
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        rewards.map((r) => {
          const unlocked = r.unlocked;
          const isMilestone = r.level % 5 === 0;
          const isBigMilestone = r.level === 25 || r.level === 50;
          return h('div', {
            key: r.level,
            id: `pass-level-${r.level}`,
            style: {
              display: 'grid',
              gridTemplateColumns: '32px 1fr 1fr',
              gap: '8px',
              alignItems: 'center',
              padding: isMilestone ? '10px 8px' : '6px 8px',
              background: unlocked ? (isMilestone ? '#162a4a' : '#131d33') : '#0f1729',
              borderRadius: '8px',
              border: unlocked ? (isMilestone ? '2px solid #FFD700' : '1px solid #30527e') : '1px solid #1f3552',
              opacity: unlocked ? 1 : 0.55,
              boxShadow: isMilestone && unlocked ? '0 0 8px rgba(255,215,0,0.15)' : 'none',
            }
          }, [
            // Level number
            h('div', { style: { fontWeight: 'bold', fontSize: isMilestone ? '13px' : '12px', color: unlocked ? '#facc15' : '#8ba1bb', textAlign: 'center' } }, [
              isBigMilestone && h('span', { style: { display: 'block', fontSize: '14px', marginBottom: '1px' } }, '🏆'),
              r.level,
            ]),

            // Free track
            h('div', null, [
              h('div', { style: { fontSize: '10px', color: '#8ba1bb', marginBottom: '2px' } }, 'Free'),
              h('div', { style: { fontSize: '11px', color: '#c7ddf5', display: 'flex', alignItems: 'center', gap: '4px' } }, [
                h('span', null, iconForReward(r.freeReward)),
                h('span', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, labelForReward(r.freeReward)),
              ]),
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
              r.freeClaimed && h('span', { style: { fontSize: '10px', color: '#4ade80' } }, '✅'),
            ]),

            // Premium track
            h('div', { style: { position: 'relative' } }, [
              r.level === nextPremiumLevel?.level && h('span', {
                className: 'premium-nudge-star',
                style: { position: 'absolute', top: '-2px', right: '-2px', fontSize: '14px', lineHeight: 1, zIndex: 1 }
              }, '★'),
              h('div', { style: { fontSize: '10px', color: '#facc15', marginBottom: '2px' } }, 'Premium'),
              h('div', { style: { fontSize: '11px', color: '#c7ddf5', display: 'flex', alignItems: 'center', gap: '4px' } }, [
                h('span', null, iconForReward(r.premiumReward)),
                h('span', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, labelForPremiumReward(r.premiumReward)),
              ]),
              r.level === nextPremiumLevel?.level && h('div', {
                style: { fontSize: '9px', color: '#FFD700', marginTop: '2px', animation: 'premiumPulse 2s infinite' }
              }, `${nextPremiumLevel.level - currentLevel} ур. до награды!`),
              premiumRewardHasPendingCosmetics(r.premiumReward) && h('div', { style: { fontSize: '10px', color: '#facc15', marginTop: '3px' } }, 'Скин/рамка скоро'),
              unlocked && isPremium && !r.premiumClaimed && h('button', {
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
              unlocked && !isPremium && !r.premiumClaimed && h('span', { style: { fontSize: '10px', color: '#facc15' } }, '🔒'),
              r.premiumClaimed && h('span', { style: { fontSize: '10px', color: '#4ade80' } }, '✅'),
            ]),
          ]);
        })
      ),

      pass?.catchUp && h('div', {
        style: {
          marginTop: '8px',
          padding: '8px',
          fontSize: '11px',
          color: '#c7ddf5',
          background: '#12203a',
          borderRadius: '6px',
          border: '1px solid #1f3552',
        }
      }, `Catch-up: +${pass.catchUp.catchUpXp} XP за ${pass.catchUp.missedDays} пропущ. дн.`),

      pass?.weekendDoubleXpActive && h('div', {
        style: {
          marginTop: '8px',
          padding: '8px',
          fontSize: '11px',
          color: '#4ade80',
          background: '#0a1f12',
          borderRadius: '6px',
          border: '1px solid #1f3552',
        }
      }, 'Weekend x2 XP активно сейчас'),
    ]),
  ]);
}
