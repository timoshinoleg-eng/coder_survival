import { createCanvas } from '@napi-rs/canvas';

const TEMPLATES = {
  works_on_my_machine: {
    label: 'Works on my machine',
    topText: 'Works on my machine',
    bottomText: 'Ship it anyway',
    bgGradient: ['#1a3a5c', '#0f1b30'],
    accentColor: '#facc15',
  },
  deploy_friday: {
    label: 'Deploy on Friday',
    topText: 'Friday deploy',
    bottomText: 'What could go wrong?',
    bgGradient: ['#5a2d2d', '#3f1a1a'],
    accentColor: '#ef4444',
  },
  this_is_fine: {
    label: 'This is fine',
    topText: 'This is fine',
    bottomText: 'internal screaming',
    bgGradient: ['#5a3e2d', '#3f2a1a'],
    accentColor: '#fb923c',
  },
  wtf_per_minute: {
    label: 'WTF per minute',
    topText: 'WTF per minute: over 9000',
    bottomText: 'Code review approved',
    bgGradient: ['#2d5a3e', '#1a3f25'],
    accentColor: '#4ade80',
  },
  stack_overflow: {
    label: 'Stack Overflow',
    topText: 'Stack Overflow copy-paste',
    bottomText: 'If it works, do not touch',
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

function drawMonitor(ctx, x, y, w, h, accentColor) {
  drawPixelShadow(ctx, x, y, w, h, 'rgba(0,0,0,0.35)', 6);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(x, y, w, h);
  drawPixelBorder(ctx, x, y, w, h, accentColor, 3);
  ctx.fillStyle = '#111c31';
  ctx.fillRect(x + 12, y + 12, w - 24, h - 28);
  ctx.fillStyle = accentColor;
  ctx.fillRect(x + w * 0.35, y + h + 6, w * 0.3, 10);
  ctx.fillRect(x + w * 0.25, y + h + 18, w * 0.5, 8);
}

function drawCodeLines(ctx, x, y, widths, color) {
  ctx.fillStyle = color;
  widths.forEach((width, index) => {
    ctx.fillRect(x, y + index * 14, width, 6);
  });
}

function drawPixelPerson(ctx, x, y, color, accentColor) {
  ctx.fillStyle = color;
  ctx.fillRect(x + 18, y, 34, 34);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 25, y + 11, 6, 6);
  ctx.fillRect(x + 39, y + 11, 6, 6);
  ctx.fillStyle = accentColor;
  ctx.fillRect(x + 18, y + 42, 34, 44);
  ctx.fillStyle = '#172033';
  ctx.fillRect(x + 4, y + 48, 14, 30);
  ctx.fillRect(x + 52, y + 48, 14, 30);
}

function drawFlame(ctx, x, y, scale = 1) {
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(x, y + 72 * scale);
  ctx.lineTo(x + 24 * scale, y + 18 * scale);
  ctx.lineTo(x + 42 * scale, y + 72 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fb923c';
  ctx.beginPath();
  ctx.moveTo(x + 9 * scale, y + 72 * scale);
  ctx.lineTo(x + 26 * scale, y + 4 * scale);
  ctx.lineTo(x + 36 * scale, y + 72 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(x + 18 * scale, y + 72 * scale);
  ctx.lineTo(x + 28 * scale, y + 34 * scale);
  ctx.lineTo(x + 34 * scale, y + 72 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawCodeCard(ctx, x, y, w, h, accentColor, headerText = 'FIX') {
  drawPixelShadow(ctx, x, y, w, h, 'rgba(0,0,0,0.28)', 5);
  ctx.fillStyle = '#111c31';
  ctx.fillRect(x, y, w, h);
  drawPixelBorder(ctx, x, y, w, h, accentColor, 3);
  ctx.fillStyle = accentColor;
  ctx.fillRect(x + 14, y + 14, w - 28, 14);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(headerText, x + w / 2, y + 26);
  drawCodeLines(ctx, x + 18, y + 42, [w - 64, w - 110, w - 88], '#4ade80');
}

function drawStickyNotes(ctx, x, y, colors) {
  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + index * 24, y + (index % 2) * 8, 18, 18);
  });
}

function drawTemplateScene(ctx, templateId, template, width, sceneY, sceneH) {
  const x = 42;
  const y = sceneY;
  const w = width - 84;
  const h = sceneH;

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(x, y, w, h);
  drawPixelBorder(ctx, x, y, w, h, 'rgba(255,255,255,0.14)', 2);

  if (templateId === 'this_is_fine') {
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(x + 18, y + 58, w - 36, h - 84);
    ctx.fillStyle = '#5a2b14';
    ctx.fillRect(x + 20, y + h - 48, w - 40, 22);
    drawFlame(ctx, x + 30, y + 18, 1.1);
    drawFlame(ctx, x + w - 82, y + 24, 1);
    drawFlame(ctx, x + w / 2 - 20, y + 8, 1.25);
    drawPixelPerson(ctx, x + w / 2 - 34, y + h - 118, '#f8d0a8', '#3b82f6');
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(x + 18, y + h - 26, w - 36, 14);
    return;
  }

  if (templateId === 'works_on_my_machine') {
    drawMonitor(ctx, x + 34, y + 20, w - 68, h - 64, template.accentColor);
    drawCodeLines(ctx, x + 70, y + 54, [150, 96, 176, 122], '#4ade80');
    ctx.fillStyle = '#5b3a1a';
    ctx.fillRect(x + 46, y + h - 34, w - 92, 16);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(x + w - 94, y + h - 56, 18, 22);
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(x + w - 92, y + h - 58, 14, 6);
    drawStickyNotes(ctx, x + 48, y + 26, ['#facc15', '#60a5fa', '#fb7185']);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + w - 78, y + 36, 26, 26);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + w - 70, y + 44, 10, 4);
    ctx.fillRect(x + w - 70, y + 56, 16, 4);
    return;
  }

  if (templateId === 'deploy_friday') {
    drawCodeCard(ctx, x + 18, y + 18, w - 36, 72, template.accentColor, 'DEPLOY');
    drawCodeCard(ctx, x + 40, y + 74, w - 96, 62, '#facc15', 'FRIDAY');
    drawFlame(ctx, x + 28, y + h - 88, 0.72);
    drawFlame(ctx, x + w - 62, y + h - 88, 0.72);
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 54, y + h - 36);
    ctx.lineTo(x + w - 54, y + 34);
    ctx.stroke();
    return;
  }

  if (templateId === 'wtf_per_minute') {
    drawCodeCard(ctx, x + 24, y + 24, w - 48, h - 80, template.accentColor, 'ALERT');
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x + 42, y + 42, 22, 22);
    ctx.fillRect(x + 74, y + 42, w - 126, 10);
    drawCodeLines(ctx, x + 64, y + 86, [170, 130, 190, 80, 156], '#86efac');
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 58, y + h - 46);
    ctx.lineTo(x + 118, y + h - 82);
    ctx.lineTo(x + 178, y + h - 62);
    ctx.lineTo(x + 242, y + h - 104);
    ctx.stroke();
    return;
  }

  drawCodeCard(ctx, x + 26, y + 18, w - 52, 78, template.accentColor, 'STACK');
  drawCodeCard(ctx, x + 52, y + 72, w - 104, 58, '#60a5fa', 'COPY');
  ctx.fillStyle = '#f97316';
  ctx.fillRect(x + 64, y + 40, 20, 20);
  ctx.fillRect(x + 92, y + 40, w - 168, 8);
  ctx.fillRect(x + 92, y + 58, w - 196, 8);
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
  const sceneY = dividerY + (isTall ? 30 : 22);
  const sceneH = isTall ? 300 : 150;
  drawTemplateScene(ctx, templateId, template, width, sceneY, sceneH);

  const statsY = sceneY + sceneH + (isTall ? 34 : 26);
  const lineHeight = isTall ? 28 : 19;
  const statsFontSize = isTall ? 18 : 14;
  ctx.font = `bold ${statsFontSize}px sans-serif`;
  ctx.fillStyle = '#e6edf7';

  const lines = [
    `${stats.rankName || 'Junior'} | ${stats.commits || 0} commits`,
    `Streak: ${stats.streakDays || 0}`,
    `Stress: ${Math.round(stats.depression || 0)}%`,
    `Energy: ${Math.round(stats.energy || 0)}/${stats.maxEnergy || 100}`,
  ];

  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, statsY + i * lineHeight, contentW);
  });

  // Bottom text
  const bottomFontSize = isTall ? 26 : 18;
  const bottomY = height - pad - (isTall ? 80 : 30);
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

export async function renderAchievementMeme(achievement, stats) {
  const width = 400;
  const height = 400;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#1a3a5c');
  grad.addColorStop(1, '#0f1b30');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Pixel shadow
  drawPixelShadow(ctx, 4, 4, width - 12, height - 12, 'rgba(0,0,0,0.35)', 4);

  // Pixel border (gold for achievement)
  drawPixelBorder(ctx, 4, 4, width - 8, height - 8, '#facc15', 2);

  const pad = 20;
  const contentW = width - pad * 2;

  // Title: Achievement unlocked
  const titleFontSize = 22;
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#facc15';
  drawTextShadow(ctx, '🏆 Достижение разблокировано', width / 2, pad + titleFontSize, contentW);
  ctx.fillText('🏆 Достижение разблокировано', width / 2, pad + titleFontSize, contentW);

  // Achievement name
  const nameFontSize = 28;
  const nameY = pad + titleFontSize + 32;
  ctx.font = `bold ${nameFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  drawTextShadow(ctx, achievement.name, width / 2, nameY, contentW);
  ctx.fillText(achievement.name, width / 2, nameY, contentW);

  // Divider
  const dividerY = nameY + 20;
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad + 20, dividerY);
  ctx.lineTo(width - pad - 20, dividerY);
  ctx.stroke();

  // Description
  const descFontSize = 16;
  const descY = dividerY + 28;
  ctx.font = `${descFontSize}px sans-serif`;
  ctx.fillStyle = '#e6edf7';
  ctx.fillText(achievement.description, width / 2, descY, contentW);

  // Stats block
  const statsY = descY + 36;
  const lineHeight = 24;
  const statsFontSize = 16;
  ctx.font = `bold ${statsFontSize}px sans-serif`;
  ctx.fillStyle = '#e6edf7';

  const lines = [
    `${stats.rankName || 'Junior'} | ${stats.commits || 0} коммитов`,
    `Дней подряд: ${stats.streakDays || 0}`,
    `Стресс: ${Math.round(stats.depression || 0)}%`,
  ];

  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, statsY + i * lineHeight, contentW);
  });

  // Funny quote
  const quotes = [
    'Это пойдёт в резюме.',
    'Мама будет гордиться.',
    'Теперь ты легенда.',
    'GitHub recruiters incoming...',
    'Наконец-то смысл жизни найден.'
  ];
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  const quoteY = height - pad - 40;
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#facc15';
  drawTextShadow(ctx, `"${quote}"`, width / 2, quoteY, contentW);
  ctx.fillText(`"${quote}"`, width / 2, quoteY, contentW);

  // Watermark
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Coder Survival', width - pad, height - pad);

  if (stats.username) {
    ctx.textAlign = 'left';
    ctx.fillText(`@${stats.username}`, pad, height - pad);
  }

  return canvas.encode('png');
}

export function getTemplateLabel(templateId) {
  return TEMPLATES[templateId]?.label || templateId;
}
