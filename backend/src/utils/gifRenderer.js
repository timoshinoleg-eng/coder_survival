import { createCanvas } from '@napi-rs/canvas';

const { GIF } = (await import('../config/balance.js')).PHASE10 || { GIF: {} };

function drawPixelBorder(ctx, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(8, 8, width - 16, 6);
  ctx.fillRect(8, height - 14, width - 16, 6);
  ctx.fillRect(8, 8, 6, height - 16);
  ctx.fillRect(width - 14, 8, 6, height - 16);
}

function drawBugIcon(ctx, x, y) {
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x + 8, y, 24, 4);
  ctx.fillRect(x + 12, y + 4, 16, 4);
  ctx.fillRect(x + 8, y + 8, 24, 4);
  ctx.fillRect(x + 4, y + 4, 4, 4);
  ctx.fillRect(x + 32, y + 4, 4, 4);
  ctx.fillRect(x + 4, y - 4, 4, 4);
  ctx.fillRect(x + 32, y - 4, 4, 4);
}

function drawCalendarIcon(ctx, x, y, color, backgroundColor) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 32, 28);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(x + 2, y + 8, 28, 18);
  ctx.fillStyle = color;
  ctx.fillRect(x + 6, y - 4, 4, 6);
  ctx.fillRect(x + 22, y - 4, 4, 6);
}

function encodePng(canvas) {
  return Buffer.from(canvas.toBuffer('image/png'));
}

export async function generateDebugStagesGif() {
  const width = GIF.DEBUG_STAGES?.width || 256;
  const height = GIF.DEBUG_STAGES?.height || 256;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const stages = [
    { label: 'Отрицание', color: '#60a5fa' },
    { label: 'Гнев', color: '#f87171' },
    { label: 'Торг', color: '#fbbf24' },
    { label: 'Депрессия', color: '#a78bfa' },
    { label: 'Принятие', color: '#4ade80' }
  ];

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);
  drawPixelBorder(ctx, width, height, '#4ade80');

  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText('5 СТАДИЙ ДЕБАГА', width / 2, 42);

  stages.forEach((stage, index) => {
    const rowY = 72 + index * 30;
    ctx.fillStyle = stage.color;
    ctx.fillRect(30, rowY - 16, 10, 10);
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${index + 1}. ${stage.label}`, 48, rowY - 7);
  });

  ctx.textAlign = 'center';
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('финал: acceptance + hotfix', width / 2, height - 48);
  drawBugIcon(ctx, width / 2 - 20, height - 34);

  return encodePng(canvas);
}

export async function generateDeadlineGif() {
  const width = GIF.DEADLINE?.width || 256;
  const height = GIF.DEADLINE?.height || 256;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(0, 0, width, height);
  drawPixelBorder(ctx, width, height, '#ef4444');

  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'center';
  ctx.fillText('МЕНЕДЖЕР NPC', width / 2, 76);

  ctx.font = 'bold 30px monospace';
  ctx.fillStyle = '#ef4444';
  ctx.fillText('+1 ДЕДЛАЙН', width / 2, height / 2 + 4);

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('поздравляю!', width / 2, height / 2 + 34);

  drawCalendarIcon(ctx, width / 2 - 16, height / 2 + 54, '#ef4444', '#1e1b4b');

  return encodePng(canvas);
}
