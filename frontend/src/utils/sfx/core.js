/**
 * @fileoverview Core UI interaction SFX — tap, critical, push, typing.
 * Lightweight, high-fire-rate effects for clicks, alerts, and keystrokes.
 *
 * All functions follow the SFX contract:
 *   @param {AudioContext} ctx — active Web Audio context
 *   @param {AudioNode} [dest] — optional destination node (GainNode / compressor)
 *   @returns {void}
 */

// ─── Note Frequencies ───
// Scientific pitch notation constants for readability & reuse.

/** C5 = 523.25 Hz */

/** E5 = 659.25 Hz */

/** G5 = 783.99 Hz */

/** C6 = 1046.50 Hz */

// ═══════════════════════════════════════════════════════════════
// 1. tap   — UI click / button press
// ═══════════════════════════════════════════════════════════════

/**
 * Short percussive click for UI interactions.
 * Square wave with ±200 Hz jitter for organic feel.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playTap(ctx, dest) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const freq = 800 + Math.random() * 200;   // 800 – 1000 Hz

  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  // Envelope: snap attack, quick exponential decay
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

  osc.connect(gain);
  gain.connect(dest || ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.05);

  // Cleanup
  setTimeout(() => {
    try { osc.disconnect(); gain.disconnect(); } catch (_e) { /* noop */ }
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// 2. critical   — warning / alert chime
// ═══════════════════════════════════════════════════════════════

/**
 * Urgent sine-wave alert with 8 Hz vibrato.
 * Use for critical HP warnings or error modals.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playCritical(ctx, dest) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();   // vibrato LFO
  const lfoGain = ctx.createGain();

  const duration = 0.15;
  const now = ctx.currentTime;

  // Main tone: 1200 Hz sine with vibrato
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);

  // LFO: 8 Hz vibrato, ±20 Hz depth
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(8, now);
  lfoGain.gain.setValueAtTime(20, now);

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  // Envelope
  gain.gain.setValueAtTime(0.40, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(dest || ctx.destination);

  osc.start();
  lfo.start();
  osc.stop(now + duration);
  lfo.stop(now + duration);

  // Cleanup
  setTimeout(() => {
    try {
      osc.disconnect(); gain.disconnect();
      lfo.disconnect(); lfoGain.disconnect();
    } catch (_e) { /* noop */ }
  }, 250);
}

// ═══════════════════════════════════════════════════════════════
// 3. push   — short confirmation blip
// ═══════════════════════════════════════════════════════════════

/**
 * Brief sine blip for generic positive feedback.
 * Commit-push metaphor: short, satisfying confirmation.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playPush(ctx, dest) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const duration = 0.10;
  const now = ctx.currentTime;

  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);

  gain.gain.setValueAtTime(0.20, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(dest || ctx.destination);

  osc.start();
  osc.stop(now + duration);

  // Cleanup
  setTimeout(() => {
    try { osc.disconnect(); gain.disconnect(); } catch (_e) { /* noop */ }
  }, 200);
}

// ═══════════════════════════════════════════════════════════════
// 4. typing   — keypress tick
// ═══════════════════════════════════════════════════════════════

/**
 * Micro-click simulating keyboard keystrokes.
 * ±50 Hz randomization prevents machine-gun effect at high WPM.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playTyping(ctx, dest) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const freq = 900 + (Math.random() * 100 - 50);   // 850 – 950 Hz
  const duration = 0.03;
  const now = ctx.currentTime;

  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(dest || ctx.destination);

  osc.start();
  osc.stop(now + duration);

  // Cleanup — shortest SFX needs shortest cleanup delay
  setTimeout(() => {
    try { osc.disconnect(); gain.disconnect(); } catch (_e) { /* noop */ }
  }, 80);
}
