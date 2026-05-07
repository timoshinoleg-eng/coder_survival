/**
 * @fileoverview Action SFX — purchase, bugSuccess, bugFail.
 * Feedback sounds for shop transactions, bug-fix attempts,
 * and coding minigame outcomes.
 *
 * All functions follow the SFX contract:
 *   @param {AudioContext} ctx — active Web Audio context
 *   @param {AudioNode} [dest] — optional destination node
 *   @returns {void}
 */

// ═══════════════════════════════════════════════════════════════
// 8. purchase   — cash-register style chime + noise burst
// ═══════════════════════════════════════════════════════════════

/**
 * Satisfying "ka-ching" with a short noise burst.
 * Square-wave tone at 1500 Hz + filtered noise crackle.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playPurchase(ctx, dest) {
  const now = ctx.currentTime;
  const duration = 0.30;

  // ── Tonal component ──
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(1500, now);
  // Slight pitch bend down for realism
  osc.frequency.exponentialRampToValueAtTime(1200, now + duration);

  oscGain.gain.setValueAtTime(0.45, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Highpass filter on the tonal layer
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(1000, now);
  hp.Q.setValueAtTime(0.7, now);

  osc.connect(oscGain);
  oscGain.connect(hp);
  hp.connect(dest || ctx.destination);

  osc.start();
  osc.stop(now + duration + 0.02);

  // ── Noise burst component ──
  const bufferSize = ctx.sampleRate * 0.05;   // 0.05 s noise
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;   // white noise
  }

  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();

  noise.buffer = buffer;
  noiseGain.gain.setValueAtTime(0.45, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  noise.connect(noiseGain);
  noiseGain.connect(dest || ctx.destination);

  noise.start(now);

  // Cleanup
  setTimeout(() => {
    try {
      osc.disconnect(); oscGain.disconnect(); hp.disconnect();
      noise.disconnect(); noiseGain.disconnect();
    } catch (_e) { /* noop */ }
  }, (duration + 0.15) * 1000);
}

// ═══════════════════════════════════════════════════════════════
// 9. bugSuccess   — ascending arpeggio (1000 → 1500 Hz)
// ═══════════════════════════════════════════════════════════════

/**
 * Victory jingle for successfully fixing a bug.
 * Quick square-wave arpeggio: 1000 → 1200 → 1500 Hz.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playBugSuccess(ctx, dest) {
  const now = ctx.currentTime;
  const duration = 0.30;
  const notes = [1000, 1200, 1500];
  const noteDur = duration / notes.length;   // 0.10 s each

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = now + i * noteDur;
    const t1 = t0 + noteDur;

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t0);

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.40, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t1);

    osc.connect(gain);
    gain.connect(dest || ctx.destination);

    osc.start(t0);
    osc.stop(t1 + 0.02);

    setTimeout(() => {
      try { osc.disconnect(); gain.disconnect(); } catch (_e) { /* noop */ }
    }, (duration + 0.1) * 1000);
  });
}

// ═══════════════════════════════════════════════════════════════
// 10. bugFail   — sad low-frequency buzz
// ═══════════════════════════════════════════════════════════════

/**
 * Failure thud for bug-fix attempt gone wrong.
 * Low square wave (200 Hz) with lowpass filter for muffled "error" feel.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playBugFail(ctx, dest) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  const duration = 0.40;
  const now = ctx.currentTime;

  osc.type = 'square';
  osc.frequency.setValueAtTime(200, now);

  // Lowpass at 600 Hz mutes harmonics → dull thud
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(600, now);
  lp.Q.setValueAtTime(0.7, now);

  gain.gain.setValueAtTime(0.25, now);
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
