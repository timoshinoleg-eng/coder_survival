/**
 * Canvas-based share card renderer for Telegram Stories.
 * Generates PNG Blobs for 5 viral card types.
 */

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    const fallbackToJpeg = () => {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const [header, base64] = dataUrl.split(',');
        const mime = header.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
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
    }, type);
  });
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 0, b: 0 };
}

function lerpColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const b_ = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r},${g},${b_})`;
}

function drawPixelAvatar(ctx, x, y, scale, color = '#38bdf8', faceColor = '#f8fafc') {
  const pixels = [
    [0, 1, 1, 1, 0],
    [1, 2, 2, 2, 1],
    [1, 2, 0, 2, 1],
    [1, 2, 2, 2, 1],
    [0, 1, 0, 1, 0],
  ];
  const colors = ['#0b1020', color, faceColor];
  pixels.forEach((row, yy) => row.forEach((cell, xx) => {
    ctx.fillStyle = colors[cell];
    ctx.fillRect(x + xx * scale, y + yy * scale, scale, scale);
  }));
}

function drawCenteredText(ctx, text, x, y, size, color = '#f8fafc', weight = 800) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawLeftText(ctx, text, x, y, size, color = '#f8fafc', weight = 800) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawGridBackground(ctx, w, h, cellSize, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// ─── Card 1: Burnout Level ───
function renderBurnoutLevel(ctx, w, h, data) {
  const level = Math.max(1, Math.min(10, Number(data.burnoutLevel || 1)));
  const t = (level - 1) / 9;
  const accent = lerpColor('#2ECC71', '#E74C3C', t);

  // Dark monochrome background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  // Pixel grid overlay
  drawGridBackground(ctx, w, h, 40, 'rgba(255,255,255,0.03)');

  // Pixel avatar (large, distressed color)
  const avatarScale = Math.floor(w / 18);
  drawPixelAvatar(ctx, w / 2 - avatarScale * 2.5, h * 0.12, avatarScale, accent, '#e5e5e5');

  // Title
  drawCenteredText(ctx, 'BURNOUT LEVEL', w / 2, h * 0.42, Math.floor(w * 0.07), '#e5e5e5', 900);

  // Pixel scale 1-10
  const barW = w * 0.72;
  const barH = Math.floor(h * 0.035);
  const barX = (w - barW) / 2;
  const barY = h * 0.52;
  const cellW = barW / 10;

  for (let i = 0; i < 10; i += 1) {
    const filled = i < level;
    ctx.fillStyle = filled ? accent : '#2a2a2a';
    ctx.fillRect(barX + i * cellW + 2, barY, cellW - 4, barH);
  }

  // Level number
  drawCenteredText(ctx, `${level}/10`, w / 2, h * 0.62, Math.floor(w * 0.14), accent, 900);

  // Subtitle
  drawCenteredText(ctx, data.username || 'Anonymous Dev', w / 2, h * 0.72, Math.floor(w * 0.045), '#888', 700);

  // CTA
  drawCenteredText(ctx, 'Coder Survival', w / 2, h * 0.88, Math.floor(w * 0.04), '#444', 700);
}

// ─── Card 2: "I survived N days in IT" ───
function renderSurvivalCard(ctx, w, h, data) {
  const days = Number(data.daysSurvived || 0);
  const accent = '#38bdf8';

  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);

  // Subtle stars
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 60; i += 1) {
    const sx = ((i * 137.5) % w);
    const sy = ((i * 73.3) % h);
    const ss = 2 + (i % 3);
    ctx.fillRect(sx, sy, ss, ss);
  }

  // Pixel avatar
  const avatarScale = Math.floor(w / 20);
  drawPixelAvatar(ctx, w / 2 - avatarScale * 2.5, h * 0.1, avatarScale, accent);

  drawCenteredText(ctx, 'Я выжил в IT', w / 2, h * 0.38, Math.floor(w * 0.065), '#f8fafc', 800);

  drawCenteredText(ctx, `${days}`, w / 2, h * 0.52, Math.floor(w * 0.22), accent, 900);
  drawCenteredText(ctx, 'дней', w / 2, h * 0.62, Math.floor(w * 0.06), '#94a3b8', 700);

  // Rank badge
  if (data.rankName) {
    drawCenteredText(ctx, `Ранг: ${data.rankName}`, w / 2, h * 0.72, Math.floor(w * 0.045), '#cbd5e1', 700);
  }

  // Referral hint
  drawCenteredText(ctx, 'Присоединяйся → t.me/CoderSurvivalBot', w / 2, h * 0.88, Math.floor(w * 0.035), '#475569', 600);
}

// ─── Card 3: Daily Standup Survivor (512×512, static PNG) ───
function renderStandupSurvivor(ctx, w, h, data) {
  const streak = Number(data.streakDays || 7);
  const accent = '#facc15';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);

  // Concentric pixel rings (celebration)
  const rings = 6;
  for (let i = rings; i >= 0; i -= 1) {
    const r = (w * 0.38) * (i / rings);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(250,204,21,0.08)' : 'rgba(56,189,248,0.06)';
    ctx.fillRect(w / 2 - r, h / 2 - r, r * 2, r * 2);
  }

  // Trophy pixel art (simplified)
  const tx = w / 2;
  const ty = h * 0.28;
  const ts = Math.floor(w / 28);
  ctx.fillStyle = accent;
  ctx.fillRect(tx - ts * 3, ty - ts * 4, ts * 6, ts * 2);
  ctx.fillRect(tx - ts * 2, ty - ts * 2, ts * 4, ts * 4);
  ctx.fillRect(tx - ts * 4, ty + ts * 2, ts * 8, ts);
  ctx.fillRect(tx - ts, ty + ts * 3, ts * 2, ts * 2);
  ctx.fillRect(tx - ts * 3, ty + ts * 5, ts * 6, ts);

  drawCenteredText(ctx, 'DAILY STANDUP', w / 2, h * 0.52, Math.floor(w * 0.09), '#f8fafc', 900);
  drawCenteredText(ctx, 'SURVIVOR', w / 2, h * 0.62, Math.floor(w * 0.11), accent, 900);
  drawCenteredText(ctx, `${streak}-day streak`, w / 2, h * 0.74, Math.floor(w * 0.07), '#94a3b8', 700);

  if (data.username) {
    drawCenteredText(ctx, `@${data.username}`, w / 2, h * 0.84, Math.floor(w * 0.06), '#64748b', 600);
  }
}

// ─── Card 4: Commit of the Day (GitHub graph style, 1080×1920) ───
function renderCommitOfTheDay(ctx, w, h, data) {
  const commits = Number(data.commits || 0);
  const todayCommits = Number(data.todayCommits || commits % 50);
  const accentLow = '#0e4429';
  const accentMid = '#006d32';
  const accentHigh = '#39d353';

  ctx.fillStyle = '#0D1117';
  ctx.fillRect(0, 0, w, h);

  // Header
  drawLeftText(ctx, 'Coder Survival', w * 0.08, h * 0.08, Math.floor(w * 0.06), '#c9d1d9', 800);
  drawLeftText(ctx, 'Commit Graph', w * 0.08, h * 0.12, Math.floor(w * 0.04), '#8b949e', 600);

  // Contribution grid (GitHub-style)
  const cols = 12;
  const rows = 7;
  const cellSize = Math.floor(w * 0.058);
  const gap = Math.floor(w * 0.012);
  const startX = (w - (cols * (cellSize + gap) - gap)) / 2;
  const startY = h * 0.2;

  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const intensity = Math.random();
      const isToday = c === cols - 1 && r === rows - 1;
      let color = '#161b22';
      if (isToday) {
        color = accentHigh;
      } else if (intensity > 0.75) {
        color = accentHigh;
      } else if (intensity > 0.5) {
        color = accentMid;
      } else if (intensity > 0.25) {
        color = accentLow;
      }
      ctx.fillStyle = color;
      const cx = startX + c * (cellSize + gap);
      const cy = startY + r * (cellSize + gap);
      ctx.fillRect(cx, cy, cellSize, cellSize);
      if (isToday) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cellSize, cellSize);
      }
    }
  }

  // Stats block
  const statsY = startY + rows * (cellSize + gap) + h * 0.06;
  drawLeftText(ctx, 'Сегодня', w * 0.08, statsY, Math.floor(w * 0.045), '#8b949e', 600);
  drawLeftText(ctx, `${todayCommits} коммитов`, w * 0.08, statsY + h * 0.04, Math.floor(w * 0.07), '#39d353', 900);

  drawLeftText(ctx, 'Всего', w * 0.08, statsY + h * 0.1, Math.floor(w * 0.045), '#8b949e', 600);
  drawLeftText(ctx, `${commits}`, w * 0.08, statsY + h * 0.14, Math.floor(w * 0.07), '#f8fafc', 900);

  if (data.rankName) {
    drawLeftText(ctx, `Ранг: ${data.rankName}`, w * 0.08, statsY + h * 0.2, Math.floor(w * 0.04), '#58a6ff', 700);
  }

  // Footer CTA
  drawCenteredText(ctx, 'Сможешь больше? →', w / 2, h * 0.92, Math.floor(w * 0.04), '#484f58', 700);
}

// ─── Card 5: Squad Leaderboard ───
function renderSquadLeaderboard(ctx, w, h, data) {
  const squadName = data.squadName || 'Squad';
  const members = data.squadMembers || [
    { name: 'You', score: data.commits || 0, place: 1 },
    { name: 'Dev2', score: Math.max(0, (data.commits || 0) - 120), place: 2 },
    { name: 'Dev3', score: Math.max(0, (data.commits || 0) - 340), place: 3 },
    { name: 'Dev4', score: Math.max(0, (data.commits || 0) - 560), place: 4 },
  ];

  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);

  // Header
  drawCenteredText(ctx, squadName.toUpperCase(), w / 2, h * 0.1, Math.floor(w * 0.08), '#f8fafc', 900);
  drawCenteredText(ctx, 'LEADERBOARD', w / 2, h * 0.16, Math.floor(w * 0.05), '#38bdf8', 800);

  // Rows
  const rowH = h * 0.12;
  const startY = h * 0.24;
  const avatarScale = Math.floor(rowH * 0.35);

  members.forEach((member, i) => {
    const y = startY + i * rowH;
    const isMe = i === 0 || member.name === (data.username || 'You');

    // Row bg
    ctx.fillStyle = isMe ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.02)';
    ctx.fillRect(w * 0.06, y - rowH * 0.35, w * 0.88, rowH * 0.8);
    if (isMe) {
      ctx.strokeStyle = 'rgba(56,189,248,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(w * 0.06, y - rowH * 0.35, w * 0.88, rowH * 0.8);
    }

    // Place
    drawLeftText(ctx, `#${member.place || i + 1}`, w * 0.1, y, Math.floor(w * 0.05), isMe ? '#facc15' : '#64748b', 900);

    // Pixel avatar
    const avatarColors = ['#38bdf8', '#f87171', '#34d399', '#c084fc', '#facc15'];
    drawPixelAvatar(ctx, w * 0.22, y - avatarScale * 2.2, avatarScale, avatarColors[i % avatarColors.length]);

    // Name
    drawLeftText(ctx, member.name, w * 0.34, y, Math.floor(w * 0.045), isMe ? '#f8fafc' : '#94a3b8', 700);

    // Score
    drawLeftText(ctx, `${member.score || 0} LOC`, w * 0.72, y, Math.floor(w * 0.045), isMe ? '#38bdf8' : '#64748b', 700);
  });

  drawCenteredText(ctx, 'Coder Survival', w / 2, h * 0.92, Math.floor(w * 0.04), '#334155', 700);
}

// ─── Death Screen Card ───
function renderDeathCard(ctx, w, h, data) {
  const cause = data.causeOfDeath || 'Burnout';
  const streak = Number(data.streakDays || 0);
  const name = data.username || 'Developer';
  const accent = '#E74C3C';

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  // Dramatic vignette
  const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.7);
  grad.addColorStop(0, 'rgba(231,76,60,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Skull pixel art
  const skullScale = Math.floor(w / 14);
  const sx = w / 2 - skullScale * 3.5;
  const sy = h * 0.1;
  const skull = [
    [0,1,1,1,1,1,0],
    [1,2,2,2,2,2,1],
    [1,2,0,2,0,2,1],
    [1,2,2,2,2,2,1],
    [0,1,2,0,2,1,0],
    [0,0,1,1,1,0,0],
  ];
  skull.forEach((row, yy) => row.forEach((cell, xx) => {
    if (cell === 0) return;
    ctx.fillStyle = cell === 2 ? '#e5e5e5' : accent;
    ctx.fillRect(sx + xx * skullScale, sy + yy * skullScale, skullScale, skullScale);
  }));

  drawCenteredText(ctx, 'GAME OVER', w / 2, h * 0.42, Math.floor(w * 0.09), accent, 900);
  drawCenteredText(ctx, name, w / 2, h * 0.52, Math.floor(w * 0.055), '#e5e5e5', 800);

  drawCenteredText(ctx, `Причина: ${cause}`, w / 2, h * 0.6, Math.floor(w * 0.045), '#888', 700);
  drawCenteredText(ctx, `Streak: ${streak} дней`, w / 2, h * 0.67, Math.floor(w * 0.04), '#555', 700);

  drawCenteredText(ctx, 'Сможешь побить?', w / 2, h * 0.82, Math.floor(w * 0.05), '#f8fafc', 800);
  drawCenteredText(ctx, 'Coder Survival', w / 2, h * 0.9, Math.floor(w * 0.035), '#333', 700);
}

const RENDERERS = {
  burnout_level: { fn: renderBurnoutLevel, w: 1080, h: 1920 },
  survival_days: { fn: renderSurvivalCard, w: 1080, h: 1920 },
  standup_survivor: { fn: renderStandupSurvivor, w: 512, h: 512 },
  commit_of_the_day: { fn: renderCommitOfTheDay, w: 1080, h: 1920 },
  squad_leaderboard: { fn: renderSquadLeaderboard, w: 1080, h: 1920 },
  death_shame: { fn: renderDeathCard, w: 1080, h: 1920 },
};

export const SHARE_CARD_TYPES = Object.keys(RENDERERS);

/**
 * Generate a share card PNG blob.
 * @param {string} type - One of SHARE_CARD_TYPES
 * @param {object} data - Game data (username, daysSurvived, burnoutLevel, etc.)
 * @returns {Promise<Blob>}
 */
export async function generateShareCard(type, data = {}) {
  const spec = RENDERERS[type];
  if (!spec) throw new Error(`Unknown share card type: ${type}`);

  const canvas = document.createElement('canvas');
  canvas.width = spec.w;
  canvas.height = spec.h;
  const ctx = canvas.getContext('2d');

  spec.fn(ctx, spec.w, spec.h, data);

  return canvasToBlob(canvas, 'image/png');
}

/**
 * Generate a share card and return an object URL for preview.
 * Remember to revoke the URL when done.
 */
export async function generateShareCardUrl(type, data = {}) {
  const blob = await generateShareCard(type, data);
  return { blob, url: URL.createObjectURL(blob) };
}
