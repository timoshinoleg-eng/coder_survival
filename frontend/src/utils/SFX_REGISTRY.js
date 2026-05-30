/**
 * @fileoverview SFX_REGISTRY — Central registry of all programmatic
 * sound effects for the Coder Survival Telegram Mini App.
 *
 * Every entry is a fire-and-forget function with the signature:
 *   (ctx: AudioContext, dest?: AudioNode) => void
 *
 * Usage:
 *   import { SFX_REGISTRY } from './utils/SFX_REGISTRY.js';
 *   SFX_REGISTRY.tap(audioCtx, masterGain);
 *
 * All SFX are synthesized via the Web Audio API — no external audio files
 * except `sfx_coffee` which is pre-generated Ogg Vorbis.
 */

// ─── Category imports ───
import {
  playTap,
  playCritical,
  playPush,
  playTyping,
} from './sfx/core.js';

import {
  playLevelup,
  playQuestDone,
  playStreakBreak,
} from './sfx/progression.js';

import {
  playPurchase,
  playBugSuccess,
  playBugFail,
} from './sfx/actions.js';

import {
  playEnergy0,
  playBurnout,
  playGameover,
  playModalOpen,
} from './sfx/states.js';

// ═══════════════════════════════════════════════════════════════
// Registry object — keyed by SFX ID
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Function} SFXFunction
 * @param {AudioContext} ctx
 * @param {AudioNode} [dest]
 * @returns {void}
 */

/**
 * Registry of all 14 programmatic SFX functions.
 * @type {Record<string, SFXFunction>}
 */
export const SFX_REGISTRY = {
  // ── Core UI ──
  tap:        playTap,
  critical:   playCritical,
  push:       playPush,
  typing:     playTyping,

  // ── Progression ──
  levelup:    playLevelup,
  questDone:  playQuestDone,
  streakBreak: playStreakBreak,

  // ── Actions ──
  purchase:   playPurchase,
  bugSuccess: playBugSuccess,
  bugFail:    playBugFail,

  // ── States ──
  energy0:    playEnergy0,
  burnout:    playBurnout,
  gameover:   playGameover,
  modalOpen:  playModalOpen,
};

// Also export individual functions for tree-shaking consumers
export {
  playTap,
  playCritical,
  playPush,
  playTyping,
  playLevelup,
  playQuestDone,
  playStreakBreak,
  playPurchase,
  playBugSuccess,
  playBugFail,
  playEnergy0,
  playBurnout,
  playGameover,
  playModalOpen,
};
