import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { useTelegramStories } from '../hooks/useTelegramStories.js';
import { generateShareCardUrl } from '../utils/shareCardRenderer.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';

const TYPE_LABELS = {
  burnout_level: 'Уровень выгорания',
  survival_days: 'Я выжил в IT',
  standup_survivor: 'Daily Standup Survivor',
  commit_of_the_day: 'Commit of the Day',
  squad_leaderboard: 'Топ отряда',
  death_shame: 'Share Shame',
};

export default function ShareCardModal({ open, type, data, onClose }) {
  const { shareToStory } = useTelegramStories();
  const { haptic } = useTelegram();
  const [previewUrl, setPreviewUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
      setBusy(true);
      setError(false);
      generateShareCardUrl(type, data)
        .then(({ blob: b, url }) => {
          setBlob(b);
          setPreviewUrl(url);
          setBusy(false);
        })
        .catch((err) => {
          console.error('Share card render error:', err);
          setError(true);
          setBusy(false);
        });
    } else {
      audioManager.resumeFromModal();
    }
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [open, type, JSON.stringify(data)]);

  const handleShare = useCallback(async () => {
    if (!blob || busy) return;
    setBusy(true);
    haptic('success');
    try {
      const text = TYPE_LABELS[type] || 'Coder Survival';
      const widgetLink = {
        url: 'https://t.me/CoderSurvivalBot',
        name: 'Играть',
      };
      await shareToStory(blob, text, widgetLink);
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setBusy(false);
    }
  }, [blob, busy, haptic, shareToStory, type]);

  const handleDownload = useCallback(() => {
    if (!blob) return;
    haptic('light');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coder-survival-${type}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [blob, haptic, type]);

  if (!open) return null;

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 55,
      background: 'rgba(7, 12, 24, 0.88)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 12px',
      animation: 'fade-in-up 0.25s ease-out',
    },
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      width: 'min(380px, 100%)',
      maxHeight: '90vh',
      overflowY: 'auto',
      background: '#10192d',
      color: '#e6edf7',
      border: '1px solid #1f3552',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
    },
  }, [
    // Header
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552',
      },
    }, [
      h('strong', { style: { fontSize: '12px', textTransform: 'uppercase' } }, '📤 ' + (TYPE_LABELS[type] || 'Поделиться')),
      h('button', {
        onClick: onClose,
        style: {
          border: 'none',
          background: 'transparent',
          color: '#9eb6d2',
          fontSize: '18px',
          cursor: 'pointer',
          padding: '4px 8px',
          lineHeight: 1,
        },
      }, '×'),
    ]),

    // Preview
    h('div', {
      style: {
        padding: '14px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '220px',
      },
    }, [
      busy && h('div', { style: { color: '#9eb6d2', fontSize: '12px', animation: 'pulse 1.2s infinite' } }, 'Рендеринг...'),
      error && h('div', { style: { textAlign: 'center' } }, [
        h('div', { style: { color: '#ef4444', fontSize: '12px', marginBottom: '8px' } }, 'Ошибка рендеринга'),
        h('button', {
          onClick: onClose,
          style: { padding: '6px 12px', fontSize: '11px', color: '#e6edf7', border: '1px solid #30527e', background: '#131d33', cursor: 'pointer' },
        }, 'Закрыть'),
      ]),
      previewUrl && h('img', {
        src: previewUrl,
        alt: 'Share preview',
        style: {
          display: busy || error ? 'none' : 'block',
          width: '100%',
          maxWidth: type === 'standup_survivor' ? '260px' : '280px',
          height: 'auto',
          imageRendering: 'pixelated',
          border: '2px solid #1f3552',
          borderRadius: '6px',
        },
      }),
    ]),

    // Actions
    h('div', {
      style: {
        display: 'flex',
        gap: '8px',
        padding: '0 14px 14px',
        justifyContent: 'center',
      },
    }, [
      h('button', {
        onClick: handleShare,
        disabled: busy || !blob,
        style: {
          flex: 1,
          padding: '10px 0',
          background: busy ? '#1a3a5c' : '#3b82f6',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '12px',
          cursor: busy ? 'wait' : 'pointer',
          border: 'none',
          borderRadius: '8px',
          textTransform: 'uppercase',
          opacity: busy ? 0.7 : 1,
        },
      }, busy ? 'Отправка...' : '📤 В Story'),
      h('button', {
        onClick: handleDownload,
        disabled: !blob,
        style: {
          flex: 1,
          padding: '10px 0',
          background: '#131d33',
          color: '#c7ddf5',
          fontWeight: 'bold',
          fontSize: '12px',
          cursor: 'pointer',
          border: '2px solid #30527e',
          borderRadius: '8px',
          textTransform: 'uppercase',
        },
      }, '⬇ Скачать'),
    ]),
  ]));
}
