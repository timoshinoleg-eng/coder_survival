import { h } from 'preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';

const MEME_TEMPLATES = [
  {
    id: 'works_on_my_machine',
    label: 'Works on my machine',
    topText: '— У меня работает',
    bottomText: '— А у тебя?',
    bgGradient: ['#1a3a5c', '#0f1b30'],
    accentColor: '#facc15'
  },
  {
    id: 'deploy_friday',
    label: 'Deploy on Friday',
    topText: 'Деплой в пятницу',
    bottomText: 'Что может пойти не так?',
    bgGradient: ['#5a2d2d', '#3f1a1a'],
    accentColor: '#ef4444'
  },
  {
    id: 'this_is_fine',
    label: 'This is fine',
    topText: 'Всё нормально',
    bottomText: '(внутренний крик)',
    bgGradient: ['#5a3e2d', '#3f2a1a'],
    accentColor: '#fb923c'
  },
  {
    id: 'wtf_per_minute',
    label: 'WTF per minute',
    topText: 'WTF в минуту: over 9000',
    bottomText: 'Code review пройден',
    bgGradient: ['#2d5a3e', '#1a3f25'],
    accentColor: '#4ade80'
  },
  {
    id: 'stack_overflow',
    label: 'Stack Overflow',
    topText: 'Stack Overflow copy-paste',
    bottomText: 'Если работает — не трогай',
    bgGradient: ['#30527e', '#1a3a5c'],
    accentColor: '#60a5fa'
  }
];

function drawMeme(canvas, template, stats) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, template.bgGradient[0]);
  grad.addColorStop(1, template.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Border
  ctx.strokeStyle = template.accentColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  // Top text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.fillText(template.topText, w / 2, 24);
  ctx.shadowBlur = 0;

  // Decorative line
  ctx.strokeStyle = template.accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 70);
  ctx.lineTo(w - 40, 70);
  ctx.stroke();

  // Stats block
  ctx.fillStyle = '#e6edf7';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${stats.rankName} | ${stats.commits} коммитов`, w / 2, 90);

  ctx.fillStyle = '#9eb6d2';
  ctx.font = '14px sans-serif';
  const subLines = [
    `Дней подряд: ${stats.streakDays}`,
    `Стресс: ${stats.depression}%`,
    `Энергия: ${stats.energy}/${stats.maxEnergy}`
  ];
  subLines.forEach((line, i) => {
    ctx.fillText(line, w / 2, 118 + i * 22);
  });

  // Bottom text
  ctx.fillStyle = template.accentColor;
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.fillText(template.bottomText, w / 2, h - 50);
  ctx.shadowBlur = 0;

  // Watermark
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Coder Survival', w - 12, h - 14);
}

export default function MemeGenerator({ open, onClose }) {
  const { rankName, commits, streakDays, depression, energy, maxEnergy } = useGameState();
  const { shareText, haptic } = useTelegram();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);

  const stats = {
    rankName: rankName || 'Junior',
    commits: commits || 0,
    streakDays: streakDays || 0,
    depression: Math.round(depression || 0),
    energy: Math.round(energy || 0),
    maxEnergy: maxEnergy || 100
  };

  const template = MEME_TEMPLATES[selectedIndex];

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
    } else {
      audioManager.resumeFromModal();
    }
    return () => {
      audioManager.resumeFromModal();
    };
  }, [open]);

  useEffect(() => {
    if (open && canvasRef.current) {
      drawMeme(canvasRef.current, template, stats);
    }
  }, [open, selectedIndex, template, stats]);

  const handleShare = useCallback(() => {
    haptic('success');
    const text = `Coder Survival — ${template.label}\n` +
      `${stats.rankName} | ${stats.commits} коммитов | ${stats.streakDays} дней подряд\n` +
      `А ты сколько накодил? 👇`;
    shareText(text);
  }, [haptic, shareText, template, stats]);

  const handleCopy = useCallback(async () => {
    const text = `${template.topText}\n${template.bottomText}\n` +
      `${stats.rankName} | ${stats.commits} коммитов | ${stats.streakDays} дней подряд`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      haptic('light');
      setTimeout(() => setCopied(false), 1500);
    } catch (_e) {
      setCopied(false);
    }
  }, [haptic, template, stats]);

  if (!open) return null;

  return h('div', {
    onClick: onClose,
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
    style: {
      width: 'min(420px, 100%)',
      maxHeight: '90vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '8px',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
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
      h('strong', null, '🎨 Мемогенератор'),
      h('button', {
        onClick: onClose,
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
    ]),

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
      onClick: () => {
        haptic('light');
        setSelectedIndex(i);
      },
      style: {
        flexShrink: 0,
        padding: '5px 10px',
        borderRadius: '6px',
        border: i === selectedIndex ? `1px solid ${t.accentColor}` : '1px solid #1f3552',
        background: i === selectedIndex ? 'rgba(255,255,255,0.08)' : '#131d33',
        color: i === selectedIndex ? t.accentColor : '#9eb6d2',
        fontSize: '11px',
        cursor: 'pointer',
        fontWeight: i === selectedIndex ? 700 : 400,
        whiteSpace: 'nowrap'
      }
    }, t.label))),

    // Canvas preview
    h('div', {
      style: {
        padding: '14px',
        display: 'flex',
        justifyContent: 'center'
      }
    }, h('canvas', {
      ref: canvasRef,
      width: 400,
      height: 400,
      style: {
        width: '100%',
        maxWidth: '360px',
        height: 'auto',
        borderRadius: '6px',
        border: '1px solid #1f3552'
      }
    })),

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
        style: {
          flex: 1,
          padding: '10px 0',
          borderRadius: '8px',
          border: 'none',
          background: '#3b82f6',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '13px',
          cursor: 'pointer'
        }
      }, '📤 Поделиться'),
      h('button', {
        onClick: handleCopy,
        style: {
          flex: 1,
          padding: '10px 0',
          borderRadius: '8px',
          border: '1px solid #30527e',
          background: copied ? '#1a3f25' : '#131d33',
          color: copied ? '#4ade80' : '#c7ddf5',
          fontWeight: 'bold',
          fontSize: '13px',
          cursor: 'pointer'
        }
      }, copied ? '✓ Скопировано' : '📋 Копировать текст')
    ]),

    // Stats hint
    h('div', {
      style: {
        padding: '0 14px 14px',
        fontSize: '11px',
        color: '#6b7f99',
        textAlign: 'center'
      }
    }, 'Статистика подставляется из текущего прогресса')
  ]));
}
