/**
 * @fileoverview State-change SFX — energy0, burnout, gameover, modalOpen.
 * Ambient / atmospheric cues for low-energy warnings, burnout loops,
 * game-over dirge, and modal transitions.
 *
 * All functions follow the SFX contract:
 *   @param {AudioContext} ctx — active Web Audio context
 *   @param {AudioNode} [dest] — optional destination node
 * @returns {void}
 */

// ═══════════════════════════════════════════════════════════════
// 11. energy0   — warning drone (400 → 200 Hz sweep)
// ═══════════════════════════════════════════════════════════════

/**
 * Dangerous downward sweep signalling critical energy depletion.
 * Sawtooth 400 → 200 Hz with lowpass filter.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playEnergy0(ctx, dest) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  const duration = 0.20;
  const now = ctx.currentTime;

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + duration);

  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(800, now);
  lp.Q.setValueAtTime(0.7, now);

  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(lp);
  lp.connect(gain);
  gain.connect(dest || ctx.destination);

  osc.start();
  osc.stop(now + duration + 0.02);

  // Cleanup
  setTimeout(() => {
    try { osc.disconnect(); lp.disconnect(); gain.disconnect(); } catch (_e) { /* noop */ }
  }, (duration + 0.1) * 1000);
}

// ═══════════════════════════════════════════════════════════════
// 12. burnout   — throbbing 2-second ambient loop
// ═══════════════════════════════════════════════════════════════

/**
 * Slow 0.5 Hz LFO-pulsed sine drone at 80 Hz.
 * Represents developer burnout — heavy, oppressive, looping.
 * Caller is responsible for scheduling repeats; this function
 * emits ONE 2-second pulse.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playBurnout(ctx, dest) {
  const now = ctx.currentTime;
  const duration = 2.00;

  // Carrier oscillator
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  // LFO for amplitude tremolo (0.5 Hz)
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, now);

  // LFO: 0.5 Hz sine, controlling pitch wobble ±10 Hz
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.5, now);
  lfoGain.gain.setValueAtTime(10, now);   // ±10 Hz depth

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  // Lowpass filter to keep it dark and muffled
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(200, now);
  lp.Q.setValueAtTime(0.7, now);

  // Overall amplitude envelope (slow swell)
  oscGain.gain.setValueAtTime(0, now);
  oscGain.gain.linearRampToValueAtTime(0.15, now + 0.5);
  oscGain.gain.setValueAtTime(0.15, now + 1.5);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(lp);
  lp.connect(oscGain);
  oscGain.connect(dest || ctx.destination);

  osc.start();
  lfo.start();
  osc.stop(now + duration + 0.02);
  lfo.stop(now + duration + 0.02);

  // Cleanup
  setTimeout(() => {
    try {
      osc.disconnect(); lp.disconnect(); oscGain.disconnect();
      lfo.disconnect(); lfoGain.disconnect();
    } catch (_e) { /* noop */ }
  }, (duration + 0.15) * 1000);
}

// ═══════════════════════════════════════════════════════════════
// 13. gameover   — dramatic descending sweep + noise tail
// ═══════════════════════════════════════════════════════════════

/**
 * Game-over dirge: 1000 → 0 Hz sawtooth sweep with noise tail.
 * Lowpass filter closes over the duration for a "shutting down" feel.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playGameover(ctx, dest) {
  const now = ctx.currentTime;
  const duration = 1.00;

  // ── Tonal sweep component ──
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  const lp = ctx.createBiquadFilter();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1000, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + duration);

  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1000, now);
  lp.frequency.exponentialRampToValueAtTime(100, now + duration);
  lp.Q.setValueAtTime(0.7, now);

  oscGain.gain.setValueAtTime(0.45, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(lp);
  lp.connect(oscGain);
  oscGain.connect(dest || ctx.destination);

  osc.start();
  osc.stop(now + duration + 0.02);

  // ── Noise tail (0.3 s) ──
  const noiseDuration = 0.30;
  const bufferSize = ctx.sampleRate * noiseDuration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  const noiseLp = ctx.createBiquadFilter();

  noise.buffer = buffer;

  noiseLp.type = 'lowpass';
  noiseLp.frequency.setValueAtTime(1000, now);
  noiseLp.frequency.exponentialRampToValueAtTime(100, now + noiseDuration);

  noiseGain.gain.setValueAtTime(0.45, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDuration);

  noise.connect(noiseLp);
  noiseLp.connect(noiseGain);
  noiseGain.connect(dest || ctx.destination);

  noise.start(now);

  // Cleanup
  setTimeout(() => {
    try {
      osc.disconnect(); lp.disconnect(); oscGain.disconnect();
      noise.disconnect(); noiseLp.disconnect(); noiseGain.disconnect();
    } catch (_e) { /* noop */ }
  }, (duration + 0.2) * 1000);
}

// ═══════════════════════════════════════════════════════════════
// 14. modalOpen   — soft filtered noise "whoosh"
// ═══════════════════════════════════════════════════════════════

/**
 * Subtle pink-noise burst for modal / dialog appearance.
 * Bandpass-filtered at 2000 Hz with exponential decay.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playModalOpen(ctx, dest) {
  const now = ctx.currentTime;
  const duration = 0.15;

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Pink noise approximation (1/f noise via Voss-McCartney algorithm simplified)
  // We use a simple approximation: sum of octaves with decreasing amplitude
  for (let i = 0; i < bufferSize; i++) {
    let white = Math.random() * 2 - 1;
    // Simple pink-ish shaping
    data[i] = white * 0.7;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.20, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Bandpass around 2000 Hz for "airy whoosh"
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2000, now);
  bp.Q.setValueAtTime(0.8, now);

  noise.connect(bp);
  bp.connect(gain);
  gain.connect(dest || ctx.destination);

  noise.start(now);

  // Cleanup
  setTimeout(() => {
    try { noise.disconnect(); bp.disconnect(); gain.disconnect(); } catch (_e) { /* noop */ }
  }, (duration + 0.1) * 1000);
}
