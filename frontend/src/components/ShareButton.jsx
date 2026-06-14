import { h } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { MEME_TEMPLATES } from '../utils/canvasTemplates.js';

const TEMPLATE_ASPECT = {
  depression_scale: '9:16',
  depression_coffee: '9:16',
  burnout_badge: '1:1',
  crit_gold: '1:1',
  hackathon_result: '9:16',
  battle_victory: '1:1',
  debug_5_stages: '1:1',
  legacy_cave: '16:9',
  manager_npc: '1:1'
};

const DEPRESSION_MAX = 200;

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    const fallbackToJpeg = () => {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const [header, base64] = dataUrl.split(',');
        const mime = header.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        resolve(new Blob([bytes], { type: mime }));
      } catch (err) {
        reject(err);
      }
    };

    if (!canvas.toBlob) {
      fallbackToJpeg();
      return;
    }

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else fallbackToJpeg();
    }, 'image/png');
  });
}

function drawPixelAvatar(ctx, x, y, scale) {
  const pixels = [
    [0, 1, 1, 1, 0],
    [1, 2, 2, 2, 1],
    [1, 2, 0, 2, 1],
    [1, 2, 2, 2, 1],
    [0, 1, 0, 1, 0]
  ];
  const colors = ['#0b1020', '#38bdf8', '#f8fafc'];
  pixels.forEach((row, yy) => row.forEach((cell, xx) => {
    ctx.fillStyle = colors[cell];
    ctx.fillRect(x + xx * scale, y + yy * scale, scale, scale);
  }));
}

export function generateShareCard(templateId, data = {}) {
  const canvas = document.createElement('canvas');
  const aspect = TEMPLATE_ASPECT[templateId] || '1:1';
  canvas.width = aspect === '16:9' ? 1280 : 1080;
  canvas.height = aspect === '9:16' ? 1920 : 1080;
  const ctx = canvas.getContext('2d');
  if (MEME_TEMPLATES[templateId]) {
    MEME_TEMPLATES[templateId](ctx, canvas.width, canvas.height, data);
    return canvasToBlob(canvas);
  }
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#15223a';
  ctx.fillRect(60, 60, canvas.width - 120, canvas.height - 120);
  drawPixelAvatar(ctx, 90, 100, aspect === '9:16' ? 44 : 32);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e5edf7';
  ctx.font = '800 68px system-ui, sans-serif';
  const y = aspect === '9:16' ? 520 : 360;

  if (templateId === 'depression_scale') {
    const depression = Math.max(0, Math.min(DEPRESSION_MAX, Number(data.depression || 0)));
    ctx.fillText(`Моя депрессия: ${depression}/200`, 90, y);
    ctx.fillStyle = '#263852';
    ctx.fillRect(90, y + 70, canvas.width - 180, 48);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(90, y + 70, (canvas.width - 180) * depression / DEPRESSION_MAX, 48);
  } else if (templateId === 'burnout_badge') {
    ctx.fillStyle = '#f97316';
    ctx.fillText('ACHIEVEMENT UNLOCKED', 90, y);
    ctx.fillStyle = '#e5edf7';
    ctx.fillText('BURNT OUT', 90, y + 90);
  } else if (templateId === 'crit_gold') {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(70, 70, canvas.width - 140, canvas.height - 140);
    ctx.fillStyle = '#0b1020';
    ctx.fillText('КРИТ! +3 коммита', 110, y);
  } else if (templateId === 'hackathon_result') {
    ctx.fillText(`Мы на ${data.progressPercent ?? 0}%`, 90, y);
    ctx.fillStyle = '#263852';
    ctx.fillRect(90, y + 70, canvas.width - 180, 54);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(90, y + 70, (canvas.width - 180) * Math.min(100, data.progressPercent ?? 0) / 100, 54);
  } else {
    ctx.fillStyle = '#34d399';
    ctx.fillText(`Победа! +${data.energy ?? 20} энергии`, 90, y);
  }

  ctx.fillStyle = '#9fb6d0';
  ctx.font = '500 38px system-ui, sans-serif';
  ctx.fillText('Coder Survival', 90, canvas.height - 120);

  return canvasToBlob(canvas);
}

export default function ShareButton({ suppressed = false }) {
  const game = useGameState();
  const [busy, setBusy] = useState(false);
  const template = useMemo(() => {
    if (game.critTier === 'gold') return 'crit_gold';
    if (game.isBurnout) return 'burnout_badge';
    if (game.depression > 150) return 'depression_coffee';
    if (game.teamHackathon?.progressPercent >= 50) return 'hackathon_result';
    return null;
  }, [game.critTier, game.depression, game.isBurnout, game.teamHackathon?.progressPercent]);

  const share = useCallback(async () => {
    if (!template || busy) return;
    setBusy(true);
    try {
      const blob = await generateShareCard(template, {
        depression: game.depression,
        topText: 'Моя депрессия:',
        bottomText: 'Срочно нужен кофе!',
        progressPercent: game.teamHackathon?.progressPercent,
        energy: 20
      });
      const extension = blob.type === 'image/jpeg' ? 'jpg' : 'png';
      const file = new File([blob], `coder-survival.${extension}`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Coder Survival' });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `coder-survival.${extension}`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, game.depression, game.teamHackathon?.progressPercent, template]);

  if (suppressed || !template) return null;
  return h('button', {
    onClick: share,
    disabled: busy,
    title: 'Поделиться',
    style: {
      position: 'fixed',
      right: 'max(12px, env(safe-area-inset-right))',
      bottom: 'max(86px, env(safe-area-inset-bottom))',
      zIndex: 24,
      width: '42px',
      height: '42px',
      borderRadius: '8px',
      border: '1px solid #315178',
      background: '#172747',
      color: '#e5edf7',
      fontWeight: 800
    }
  }, '↗');
}
