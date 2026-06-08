import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { useTelegramStories } from '../hooks/useTelegramStories.js';
import { generateShareCardUrl } from '../utils/shareCardRenderer.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { useGameState } from '../hooks/useGameState.js';
import { audioManager } from '../utils/AudioManager.js';

const DEATH_CAUSES = {
  burnout: 'Выгорание',
  heartAttack: 'Heart Attack',
  depression: 'Критический стресс',
  energy: 'Истощение',
  default: 'Game Over',
};

export default function DeathScreen({ open, cause, onRestart, onClose }) {
  const { shareToStory } = useTelegramStories();
  const { haptic } = useTelegram();
  const { username, streakDays, rankName } = useGameState();
  const [previewUrl, setPreviewUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [busy, setBusy] = useState(false);

  const causeText = DEATH_CAUSES[cause] || DEATH_CAUSES.default;

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
      haptic('error');
      generateShareCardUrl('death_shame', {
        username: username?.username || username?.first_name || 'Developer',
        causeOfDeath: causeText,
        streakDays,
        rankName,
      })
        .then(({ blob: b, url }) => {
          setBlob(b);
          setPreviewUrl(url);
        })
        .catch((err) => console.error('Death card render error:', err));
    } else {
      audioManager.resumeFromModal();
    }
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [open, cause, streakDays, rankName, username, haptic]);

  const handleShareShame = useCallback(async () => {
    if (!blob || busy) return;
    setBusy(true);
    haptic('success');
    try {
      await shareToStory(blob, 'Сможешь побить?', {
        url: 'https://t.me/CoderSurvivalBot',
        name: 'Coder Survival',
      });
    } catch (err) {
      console.error('Share shame failed:', err);
    } finally {
      setBusy(false);
    }
  }, [blob, busy, haptic, shareToStory]);

  const handleDownload = useCallback(() => {
    if (!blob) return;
    haptic('light');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coder-survival-death.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [blob, haptic]);

  if (!open) return null;

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 60,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 12px',
      animation: 'fade-in-up 0.3s ease-out',
    },
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      width: 'min(360px, 100%)',
      maxHeight: '90vh',
      overflowY: 'auto',
      background: '#0a0a0a',
      color: '#e5e5e5',
      border: '2px solid #E74C3C',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px',
      gap: '14px',
    },
  }, [
    // Skull emoji / icon
    h('div', { style: { fontSize: '48px', lineHeight: 1 } }, '💀'),

    h('div', { style: { fontSize: '22px', fontWeight: 900, color: '#E74C3C', textAlign: 'center' } }, 'GAME OVER'),

    h('div', { style: { fontSize: '14px', color: '#888', textAlign: 'center' } }, [
      h('div', null, `${username?.username || username?.first_name || 'Developer'}`),
      h('div', { style: { marginTop: '4px' } }, `Причина: ${causeText}`),
      h('div', { style: { marginTop: '4px', color: '#555' } }, `Streak: ${streakDays || 0} дней`),
    ]),

    // Preview card
    previewUrl && h('img', {
      src: previewUrl,
      alt: 'Death card',
      style: {
        width: '100%',
        maxWidth: '260px',
        height: 'auto',
        imageRendering: 'pixelated',
        border: '2px solid #333',
        borderRadius: '8px',
      },
    }),

    // Share Shame (bright purple)
    h('button', {
      onClick: handleShareShame,
      disabled: busy || !blob,
      style: {
        width: '100%',
        maxWidth: '280px',
        padding: '12px 0',
        background: busy ? '#4a2d5c' : '#8b5cf6',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '14px',
        cursor: busy ? 'wait' : 'pointer',
        border: 'none',
        borderRadius: '10px',
        textTransform: 'uppercase',
        opacity: busy ? 0.7 : 1,
        boxShadow: '0 0 16px rgba(139,92,246,0.35)',
      },
    }, busy ? 'Отправка...' : '📤 Share Shame'),

    // Download
    h('button', {
      onClick: handleDownload,
      disabled: !blob,
      style: {
        width: '100%',
        maxWidth: '280px',
        padding: '10px 0',
        background: 'transparent',
        color: '#9ca3af',
        fontWeight: 600,
        fontSize: '12px',
        cursor: 'pointer',
        border: '1px solid #333',
        borderRadius: '8px',
      },
    }, '⬇ Скачать карточку'),

    // Cry and restart (muted)
    h('button', {
      onClick: onRestart,
      style: {
        width: '100%',
        maxWidth: '280px',
        padding: '10px 0',
        background: '#1a1a1a',
        color: '#666',
        fontWeight: 600,
        fontSize: '13px',
        cursor: 'pointer',
        border: '1px solid #2a2a2a',
        borderRadius: '8px',
      },
    }, '😭 Cry and restart'),
  ]));
}
