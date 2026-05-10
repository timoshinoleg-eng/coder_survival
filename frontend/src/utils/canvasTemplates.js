function text(ctx, value, x, y, size, color = '#f8fafc', weight = 800) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(value, x, y);
}

function pixelFace(ctx, x, y, size, color = '#38bdf8') {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, size * 5, size * 5);
  ctx.fillStyle = color;
  ctx.fillRect(x + size, y, size * 3, size);
  ctx.fillRect(x, y + size, size * 5, size * 3);
  ctx.fillRect(x + size, y + size * 4, size, size);
  ctx.fillRect(x + size * 3, y + size * 4, size, size);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x + size, y + size * 2, size, size);
  ctx.fillRect(x + size * 3, y + size * 2, size, size);
}

export const MEME_TEMPLATES = {
  depression_coffee: (ctx, w, h, data = {}) => {
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, w, h);
    pixelFace(ctx, w / 2 - 110, h * 0.12, 44);
    const depression = Math.max(0, Math.min(100, Number(data.depression || 0)));
    const barW = w * 0.78;
    const barX = (w - barW) / 2;
    const barY = h * 0.36;
    ctx.fillStyle = '#334155';
    ctx.fillRect(barX, barY, barW, 52);
    ctx.fillStyle = depression > 75 ? '#dc2626' : '#facc15';
    ctx.fillRect(barX, barY, barW * depression / 100, 52);
    text(ctx, data.topText || 'Моя депрессия:', w / 2, h * 0.55, 58);
    text(ctx, `${depression}/100`, w / 2, h * 0.65, 82, '#facc15', 900);
    text(ctx, data.bottomText || 'Срочно нужен кофе!', w / 2, h * 0.8, 42, '#cbd5e1', 700);
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(w / 2 - 42, h * 0.86, 84, 62);
    ctx.fillStyle = '#d2691e';
    ctx.fillRect(w / 2 - 28, h * 0.875, 56, 12);
  },

  burnout_badge: (ctx, w, h, data = {}) => {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.36;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    grad.addColorStop(0, '#fde68a');
    grad.addColorStop(1, '#b45309');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'ACHIEVEMENT', cx, cy - 70, 52, '#111827', 900);
    text(ctx, 'UNLOCKED', cx, cy - 12, 44, '#111827', 900);
    text(ctx, data.topText || 'BURNT OUT AT WORK', cx, cy + 54, 34, '#111827', 800);
    text(ctx, data.bottomText || `Days without weekend: ${data.streak || 0}`, cx, cy + 110, 28, '#1f2937', 700);
  },

  debug_5_stages: (ctx, w, h, data = {}) => {
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    const labels = data.stages || ['denial', 'logs', 'printf', 'panic', 'fix'];
    for (let i = 0; i < 5; i += 1) {
      const x = 44 + i * ((w - 88) / 5);
      const panelW = (w - 120) / 5;
      ctx.fillStyle = i % 2 ? '#182338' : '#122038';
      ctx.fillRect(x, 120, panelW, h - 240);
      pixelFace(ctx, x + panelW / 2 - 34, h / 2 - 80, 14, i === 4 ? '#34d399' : '#f87171');
      text(ctx, labels[i], x + panelW / 2, h / 2 + 70, 24, '#e5edf7', 700);
    }
    text(ctx, data.topText || 'Дебаггинг: пять стадий горя', w / 2, 74, 42, '#facc15');
  },

  legacy_cave: (ctx, w, h, data = {}) => {
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createRadialGradient(w * 0.45, h * 0.48, 30, w * 0.45, h * 0.48, w * 0.5);
    grad.addColorStop(0, '#fde68a');
    grad.addColorStop(0.25, '#334155');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 34px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < 9; i += 1) ctx.fillText(`TODO ${2014 + i}: fix later`, 70, 115 + i * 48);
    text(ctx, data.topText || 'Legacy code: я вернулся в пещеру', w / 2, h - 92, 44);
    text(ctx, data.bottomText || `Depth: ${data.depth || 12000} lines`, w / 2, h - 42, 30, '#cbd5e1', 700);
  },

  manager_npc: (ctx, w, h, data = {}) => {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(w / 2 - 170, 170, 340, 290);
    ctx.fillStyle = '#111827';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(w / 2 - 130 + i * 70, 230, 42, 42);
    pixelFace(ctx, w / 2 - 82, 520, 34, '#60a5fa');
    text(ctx, data.topText || 'Менеджер NPC', w / 2, 120, 58, '#facc15');
    text(ctx, data.bottomText || `Deadlines this week: ${data.deadlines || 7}`, w / 2, h - 120, 42);
  }
};
