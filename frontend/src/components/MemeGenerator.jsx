import { h } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { apiRequest } from '../utils/api.js';
import { audioManager } from '../utils/AudioManager.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const MEME_TEMPLATES = [
  { id: 'works_on_my_machine', label: 'Works on my machine', accentColor: '#facc15' },
  { id: 'deploy_friday', label: 'Deploy on Friday', accentColor: '#ef4444' },
  { id: 'this_is_fine', label: 'This is fine', accentColor: '#fb923c' },
  { id: 'wtf_per_minute', label: 'WTF/min', accentColor: '#4ade80' },
  { id: 'stack_overflow', label: 'Stack Overflow', accentColor: '#60a5fa' }
];

const FORMATS = [
  { id: '1:1', label: 'Квадрат' },
  { id: '9:16', label: 'Stories' }
];

export default function MemeGenerator({ open, onClose }) {
  const { rankName, commits, streakDays, depression, energy, maxEnergy, user } = useGameState();
  const { shareText, haptic } = useTelegram();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [format, setFormat] = useState('1:1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const template = MEME_TEMPLATES[selectedIndex];
  const imgSrc = `${API_BASE_URL}/api/meme?templateId=${template.id}&format=${format}`;

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
      setLoading(true);
      setError(false);
    } else {
      audioManager.resumeFromModal();
    }
    return () => audioManager.resumeFromModal();
  }, [open]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(false);
    }
  }, [open, selectedIndex, format]);

  const handleImageLoad = useCallback(() => {
    setLoading(false);
    setError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  const handleShare = useCallback(async () => {
    haptic('success');
    const url = `${API_BASE_URL}/api/meme?templateId=${template.id}&format=${format}`;
    const text = `Coder Survival — ${template.label}\n${rankName || 'Junior'} | ${commits || 0} коммитов | ${streakDays || 0} дней подряд\nА ты сколько накодил? 👇`;
    shareText(text + '\n' + url);
    try {
      await apiRequest('/api/meme/share', {
        method: 'POST',
        body: { templateId: template.id, format, sharedTo: 'chat' }
      });
    } catch (e) {
      // Non-blocking analytics
    }
  }, [haptic, shareText, template, format, rankName, commits, streakDays]);

  const handleDownload = useCallback(async () => {
    haptic('light');
    try {
      const response = await fetch(imgSrc, {
        headers: {
          'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
        }
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `coder-survival-${template.id}-${format.replace(':', 'x')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      try {
        await apiRequest('/api/meme/share', {
          method: 'POST',
          body: { templateId: template.id, format, sharedTo: 'download' }
        });
      } catch (e) {
        // Non-blocking analytics
      }
    } catch (err) {
      console.error('Download error:', err);
      haptic('error');
    }
  }, [haptic, imgSrc, template, format]);

  if (!open) return null;

  return h('div', {
    onClick: onClose,
    className: 'pixel-overlay',
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 45,
      background: 'rgba(7, 12, 24, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 12px',
      animation: 'fade-in-up 0.25s ease-out'
    }
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    className: 'pixel-panel',
    style: {
      width: 'min(420px, 100%)',
      maxHeight: '90vh',
      overflowY: 'auto',
      background: '#10192d',
      color: '#e6edf7',
      display: 'flex',
      flexDirection: 'column'
    }
  }, [
    // Header
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552'
      }
    }, [
      h('strong', { className: 'pixel-text', style: { fontSize: '12px' } }, '🎨 МЕМОГЕНЕРАТОР'),
      h('button', {
        onClick: onClose,
        className: 'pixel-button',
        style: {
          border: 'none',
          background: 'transparent',
          color: '#9eb6d2',
          fontSize: '18px',
          cursor: 'pointer',
          padding: '4px 8px',
          lineHeight: 1
        }
      }, '×')
    ]),

    // Format toggle
    h('div', {
      style: {
        display: 'flex',
        gap: '6px',
        padding: '10px 14px',
        borderBottom: '1px solid #1f3552'
      }
    }, FORMATS.map(f => h('button', {
      key: f.id,
      onClick: () => { haptic('light'); setFormat(f.id); },
      className: 'pixel-button',
      style: {
        flex: 1,
        padding: '6px 0',
        border: format === f.id ? `2px solid ${template.accentColor}` : '2px solid #1f3552',
        background: format === f.id ? 'rgba(255,255,255,0.08)' : '#131d33',
        color: format === f.id ? template.accentColor : '#9eb6d2',
        fontSize: '11px',
        cursor: 'pointer',
        fontWeight: format === f.id ? 700 : 400,
        textTransform: 'uppercase'
      }
    }, f.label))),

    // Template selector
    h('div', {
      style: {
        display: 'flex',
        gap: '6px',
        padding: '10px 14px',
        overflowX: 'auto',
        borderBottom: '1px solid #1f3552'
      }
    }, MEME_TEMPLATES.map((t, i) => h('button', {
      key: t.id,
      onClick: () => { haptic('light'); setSelectedIndex(i); },
      className: 'pixel-button',
      style: {
        flexShrink: 0,
        padding: '5px 10px',
        border: i === selectedIndex ? `2px solid ${t.accentColor}` : '2px solid #1f3552',
        background: i === selectedIndex ? 'rgba(255,255,255,0.08)' : '#131d33',
        color: i === selectedIndex ? t.accentColor : '#9eb6d2',
        fontSize: '11px',
        cursor: 'pointer',
        fontWeight: i === selectedIndex ? 700 : 400,
        whiteSpace: 'nowrap'
      }
    }, t.label))),

    // Image preview
    h('div', {
      style: {
        padding: '14px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '200px'
      }
    }, [
      loading && h('div', {
        className: 'pixel-text',
        style: { color: '#9eb6d2', fontSize: '10px', animation: 'pulse 1.2s infinite' }
      }, 'РЕНДЕРИНГ...'),
      error && h('div', { style: { textAlign: 'center' } }, [
        h('div', { className: 'pixel-text', style: { color: '#ef4444', fontSize: '10px', marginBottom: '8px' } }, 'ОШИБКА ЗАГРУЗКИ'),
        h('button', {
          onClick: () => { setError(false); setLoading(true); },
          className: 'pixel-button',
          style: { padding: '6px 12px', fontSize: '11px', color: '#e6edf7' }
        }, 'ПОВТОРИТЬ')
      ]),
      h('img', {
        src: imgSrc,
        onLoad: handleImageLoad,
        onError: handleImageError,
        style: {
          display: loading || error ? 'none' : 'block',
          width: '100%',
          maxWidth: format === '9:16' ? '260px' : '360px',
          height: 'auto',
          imageRendering: 'pixelated',
          border: '2px solid #1f3552'
        },
        alt: `Meme ${template.label}`
      })
    ]),

    // Actions
    h('div', {
      style: {
        display: 'flex',
        gap: '8px',
        padding: '0 14px 14px',
        justifyContent: 'center'
      }
    }, [
      h('button', {
        onClick: handleShare,
        className: 'pixel-button',
        style: {
          flex: 1,
          padding: '10px 0',
          background: '#3b82f6',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '12px',
          cursor: 'pointer',
          textTransform: 'uppercase'
        }
      }, '📤 Поделиться'),
      h('button', {
        onClick: handleDownload,
        className: 'pixel-button',
        style: {
          flex: 1,
          padding: '10px 0',
          background: '#131d33',
          color: '#c7ddf5',
          fontWeight: 'bold',
          fontSize: '12px',
          cursor: 'pointer',
          textTransform: 'uppercase',
          border: '2px solid #30527e'
        }
      }, '⬇ Скачать')
    ]),

    // Stats hint
    h('div', {
      style: {
        padding: '0 14px 14px',
        fontSize: '11px',
        color: '#6b7f99',
        textAlign: 'center'
      }
    }, `Статистика: ${rankName || 'Junior'} | ${commits || 0} коммитов | ${streakDays || 0} дней`)
  ]));
}
