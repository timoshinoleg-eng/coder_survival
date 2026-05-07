/**
 * @fileoverview Progression SFX — levelup, questDone, streakBreak.
 * Reward / milestone audio cues for achievements, quest completion,
 * and streak events.  Uses arpeggios, ascending motifs, and sad descents.
 *
 * All functions follow the SFX contract:
 *   @param {AudioContext} ctx — active Web Audio context
 *   @param {AudioNode} [dest] — optional destination node
 *   @returns {void}
 */

// ─── Note Frequencies ───
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.50;

// ═══════════════════════════════════════════════════════════════
// 5. levelup   — major triad arpeggio (C5 → E5 → G5)
// ═══════════════════════════════════════════════════════════════

/**
 * Triumphant ascending arpeggio for character level-up.
 * C5–E5–G5 on triangle wave with lowpass filter for warmth.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playLevelup(ctx, dest) {
  const now = ctx.currentTime;
  const duration = 0.50;
  const notes = [C5, E5, G5];
  const noteDur = duration / notes.length;   // ~0.167 s each

  // Lowpass filter for mellower triangle tone
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3000, now);
  lp.Q.setValueAtTime(0.7, now);
  lp.connect(dest || ctx.destination);

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = now + i * noteDur;
    const t1 = t0 + noteDur;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);

    // Individual note envelope — slight overlap for legato feel
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.50, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t1);

    osc.connect(gain);
    gain.connect(lp);

    osc.start(t0);
    osc.stop(t1 + 0.02);

    // Per-oscillator cleanup
    setTimeout(() => {
      try { osc.disconnect(); gain.disconnect(); } catch (_e) { /* noop */ }
    }, (duration + 0.1) * 1000);
  });

  // Filter cleanup
  setTimeout(() => {
    try { lp.disconnect(); } catch (_e) { /* noop */ }
  }, (duration + 0.15) * 1000);
}

// ═══════════════════════════════════════════════════════════════
// 6. questDone   — full major chord + octave (C5 E5 G5 C6)
// ═══════════════════════════════════════════════════════════════

/**
 * Bright ascending resolution for completed quests / tasks.
 * Four-note pattern: C5 → E5 → G5 → C6 on sine waves.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playQuestDone(ctx, dest) {
  const now = ctx.currentTime;
  const duration = 0.30;
  const notes = [C5, E5, G5, C6];
  const noteDur = duration / notes.length;   // 0.075 s each

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = now + i * noteDur;
    const t1 = t0 + noteDur;

    osc.type = 'sine';
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
// 7. streakBreak   — descending gliss (600 → 300 Hz)
// ═══════════════════════════════════════════════════════════════

/**
 * Disappointing downward slide when a streak is broken.
 * 600 → 300 Hz triangle descent over 0.4 s.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 */
export function playStreakBreak(ctx, dest) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const duration = 0.40;
  const now = ctx.currentTime;

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + duration);

  gain.gain.setValueAtTime(0.30, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(dest || ctx.destination);

  osc.start();
  osc.stop(now + duration + 0.02);

  // Cleanup
  setTimeout(() => {
    try { osc.disconnect(); gain.disconnect(); } catch (_e) { /* noop */ }
  }, (duration + 0.1) * 1000);
}
