import { createCanvas } from '@napi-rs/canvas';
import GIFEncoder from 'gifencoder';

const { GIF } = (await import('../config/balance.js')).PHASE10 || { GIF: {} };

/**
 * Generate "Five stages of debugging" GIF (5 frames, 3.5s total)
 */
export async function generateDebugStagesGif() {
  const width = GIF.DEBUG_STAGES?.width || 256;
  const height = GIF.DEBUG_STAGES?.height || 256;
  const frameDelay = GIF.DEBUG_STAGES?.frameDelayMs || 700;

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(frameDelay);
  encoder.setQuality(10);

  const stages = [
    { label: 'Отрицание', color: '#60a5fa' },
    { label: 'Гнев', color: '#f87171' },
    { label: 'Торг', color: '#fbbf24' },
    { label: 'Депрессия', color: '#a78bfa' },
    { label: 'Принятие', color: '#4ade80' }
  ];

  for (const stage of stages) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Pixel-art style background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Pixel border
    ctx.fillStyle = stage.color;
    ctx.fillRect(8, 8, width - 16, 6);
    ctx.fillRect(8, height - 14, width - 16, 6);
    ctx.fillRect(8, 8, 6, height - 16);
    ctx.fillRect(width - 14, 8, 6, height - 16);

    // Stage number
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`СТАДИЯ ${stages.indexOf(stage) + 1}/5`, width / 2, 60);

    // Stage name
    ctx.font = 'bold 32px monospace';
    ctx.fillStyle = stage.color;
    ctx.fillText(stage.label.toUpperCase(), width / 2, height / 2 + 10);

    // Bug icon (pixel-art style)
    ctx.fillStyle = '#ef4444';
    const bugX = width / 2 - 20;
    const bugY = height / 2 + 40;
    ctx.fillRect(bugX + 8, bugY, 24, 4);
    ctx.fillRect(bugX + 12, bugY + 4, 16, 4);
    ctx.fillRect(bugX + 8, bugY + 8, 24, 4);
    ctx.fillRect(bugX + 4, bugY + 4, 4, 4);
    ctx.fillRect(bugX + 32, bugY + 4, 4, 4);
    ctx.fillRect(bugX + 4, bugY - 4, 4, 4);
    ctx.fillRect(bugX + 32, bugY - 4, 4, 4);

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

/**
 * Generate "Manager NPC: +1 deadline" GIF (2 frames, 2.8s total)
 */
export async function generateDeadlineGif() {
  const width = GIF.DEADLINE?.width || 256;
  const height = GIF.DEADLINE?.height || 256;
  const frameDelay = GIF.DEADLINE?.frameDelayMs || 1400;

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(frameDelay);
  encoder.setQuality(10);

  const frames = [
    { text: 'МЕНЕДЖЕР', sub: 'NPC', color: '#fbbf24' },
    { text: '+1 ДЕДЛАЙН', sub: 'Поздравляю!', color: '#ef4444' }
  ];

  for (const frame of frames) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, width, height);

    // Pixel border
    ctx.fillStyle = frame.color;
    ctx.fillRect(8, 8, width - 16, 6);
    ctx.fillRect(8, height - 14, width - 16, 6);
    ctx.fillRect(8, 8, 6, height - 16);
    ctx.fillRect(width - 14, 8, 6, height - 16);

    // Main text
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = frame.color;
    ctx.textAlign = 'center';
    ctx.fillText(frame.text, width / 2, height / 2 - 10);

    // Sub text
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(frame.sub, width / 2, height / 2 + 30);

    // Calendar icon (pixel style)
    ctx.fillStyle = frame.color;
    const calX = width / 2 - 16;
    const calY = height / 2 + 50;
    ctx.fillRect(calX, calY, 32, 28);
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(calX + 2, calY + 8, 28, 18);
    ctx.fillStyle = frame.color;
    ctx.fillRect(calX + 6, calY - 4, 4, 6);
    ctx.fillRect(calX + 22, calY - 4, 4, 6);

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}
