import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useTelegram } from '../hooks/useTelegram.js';

const RARITY_COLORS = {
  common:    '#94a3b8',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#fbbf24',
};

export default function AchievementToast({ slug, name, rarity, reward, onDismiss }) {
  const { haptic } = useTelegram();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    // Haptic
    try { haptic?.('success'); } catch (_) {}

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 3500);

    return () => clearTimeout(timer);
  }, [haptic, onDismiss]);

  const color = RARITY_COLORS[rarity] || RARITY_COLORS.common;

  const formatReward = (r) => {
    if (!r) return '';
    const parts = [];
    if (r.coins) parts.push(`+${r.coins} 💰`);
    if (r.xp) parts.push(`+${r.xp} ⭐`);
    if (r.title) parts.push('🏆 Титул');
    if (r.badge) parts.push('🎖️ Бейдж');
    if (r.skin_unlock) parts.push('👕 Скин');
    return parts.join(' · ');
  };

  return h('div', {
    onClick: onDismiss,
    style: {
      position: 'fixed',
      top: visible ? '16px' : '-100px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      background: '#0f172a',
      border: `2px solid ${color}`,
      borderRadius: '12px',
      padding: '12px 16px',
      minWidth: '280px',
      maxWidth: '90vw',
      boxShadow: `0 0 20px ${color}40`,
      transition: 'top 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
  }, [
    h('div', {
      style: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: `${color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        flexShrink: 0,
      },
    }, '🏆'),
    h('div', { style: { flex: 1, minWidth: 0 } }, [
      h('div', {
        style: { fontSize: '10px', color, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' },
      }, 'Достижение разблокировано'),
      h('div', {
        style: { fontSize: '14px', fontWeight: 700, color: '#e2e8f0', marginTop: '2px' },
      }, name || slug),
      reward && h('div', {
        style: { fontSize: '11px', color: '#fbbf24', marginTop: '2px' },
      }, formatReward(reward)),
    ]),
    h('div', {
      style: {
        fontSize: '18px',
        color: '#64748b',
        lineHeight: 1,
      },
    }, '×'),
  ]);
}
