import { createCanvas } from '@napi-rs/canvas';

const TEMPLATES = {
  works_on_my_machine: {
    label: 'Works on my machine',
    topText: '— У меня работает',
    bottomText: '— А у тебе?',
    bgGradient: ['#1a3a5c', '#0f1b30'],
    accentColor: '#facc15',
  },
  deploy_friday: {
    label: 'Deploy on Friday',
    topText: 'Деплой в пятницу',
    bottomText: 'Что может пойти не так?',
    bgGradient: ['#5a2d2d', '#3f1a1a'],
    accentColor: '#ef4444',
  },
  this_is_fine: {
    label: 'This is fine',
    topText: 'Всё нормально',
    bottomText: '(внутренний крик)',
    bgGradient: ['#5a3e2d', '#3f2a1a'],
    accentColor: '#fb923c',
  },
  wtf_per_minute: {
    label: 'WTF per minute',
    topText: 'WTF в минуту: over 9000',
    bottomText: 'Code review пройден',
    bgGradient: ['#2d5a3e', '#1a3f25'],
    accentColor: '#4ade80',
  },
  stack_overflow: {
    label: 'Stack Overflow',
    topText: 'Stack Overflow copy-paste',
    bottomText: 'Если работает — не трогай',
    bgGradient: ['#30527e', '#1a3a5c'],
    accentColor: '#60a5fa',
  },
};

export const MEME_TEMPLATE_IDS = Object.keys(TEMPLATES);

function drawPixelShadow(ctx, x, y, w, h, color, offset = 4) {
  ctx.fillStyle = color;
  ctx.fillRect(x + offset, y + offset, w, h);
}

function drawPixelBorder(ctx, x, y, w, h, color, thickness = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.strokeRect(x, y, w - thickness, h - thickness);
}

function drawTextShadow(ctx, text, x, y, maxWidth) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, x + 2, y + 2, maxWidth);
  ctx.restore();
}

export async function renderMeme(templateId, format, stats) {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const width = 400;
  const height = format === '9:16' ? 800 : 400;
  const isTall = height === 800;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, template.bgGradient[0]);
  grad.addColorStop(1, template.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Pixel shadow (simulated block shadow behind border)
  drawPixelShadow(ctx, 4, 4, width - 12, height - 12, 'rgba(0,0,0,0.35)', 4);

  // Pixel border
  drawPixelBorder(ctx, 4, 4, width - 8, height - 8, template.accentColor, 2);

  // Inner padding
  const pad = 20;
  const contentW = width - pad * 2;

  // Top text
  const topFontSize = isTall ? 32 : 28;
  ctx.font = `bold ${topFontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  drawTextShadow(ctx, template.topText, width / 2, pad + topFontSize, contentW);
  ctx.fillText(template.topText, width / 2, pad + topFontSize, contentW);

  // Divider line
  const dividerY = pad + topFontSize + (isTall ? 24 : 16);
  ctx.strokeStyle = template.accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad + 20, dividerY);
  ctx.lineTo(width - pad - 20, dividerY);
  ctx.stroke();

  // Stats block
  const statsY = dividerY + (isTall ? 36 : 28);
  const lineHeight = isTall ? 28 : 24;
  const statsFontSize = isTall ? 18 : 16;
  ctx.font = `bold ${statsFontSize}px sans-serif`;
  ctx.fillStyle = '#e6edf7';

  const lines = [
    `${stats.rankName || 'Junior'} | ${stats.commits || 0} коммитов`,
    `Дней подряд: ${stats.streakDays || 0}`,
    `Стресс: ${Math.round(stats.depression || 0)}%`,
    `Энергия: ${Math.round(stats.energy || 0)}/${stats.maxEnergy || 100}`,
  ];

  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, statsY + i * lineHeight, contentW);
  });

  // Bottom text
  const bottomFontSize = isTall ? 26 : 22;
  const bottomY = height - pad - (isTall ? 80 : 50);
  ctx.font = `bold ${bottomFontSize}px sans-serif`;
  ctx.fillStyle = template.accentColor;
  drawTextShadow(ctx, template.bottomText, width / 2, bottomY, contentW);
  ctx.fillText(template.bottomText, width / 2, bottomY, contentW);

  // Watermark
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Coder Survival', width - pad, height - pad);

  // Username watermark (small, bottom-left)
  if (stats.username) {
    ctx.textAlign = 'left';
    ctx.fillText(`@${stats.username}`, pad, height - pad);
  }

  return canvas.encode('png');
}

export function getTemplateLabel(templateId) {
  return TEMPLATES[templateId]?.label || templateId;
}
