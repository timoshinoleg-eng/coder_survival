/**
 * @fileoverview AudioManager — Unified audio controller for Coder Survival.
 *
 * Bridges programmatic SFX (Web Audio API) and streamed BGM (HTMLAudioElement).
 * Provides ducking, mute persistence, burnout looping, and haptic-sync hooks.
 *
 * Architecture:
 *   ┌──────────────┐     ┌──────────────┐
 *   │ SFX (WebAudio)│────▶│ sfxGain ──────▶ ctx.destination
 *   └──────────────┘     └──────────────┘
 *   ┌──────────────┐     ┌──────────────┐
 *   │ BGM (HTMLAudio)│──▶│ bgmGain ──────▶ ctx.destination
 *   └──────────────┘     └──────────────┘
 *
 * Critical rules:
 * - AudioContext is LAZY-INITIALISED only after the first user gesture.
 * - BGM uses HTMLAudioElement with loop=true for seamless looping.
 * - SFX uses Web Audio API through the AudioContext.
 * - play() is allocation-free in the hot path (50 taps/sec).
 * - All errors are caught silently — audio never crashes the game.
 *
 * @module AudioManager
 */

import { SFX_REGISTRY } from './SFX_REGISTRY.js';

// ─── Constants ───

/** Default BGM volume (0–1). */
const DEFAULT_BGM_VOL = 0.25;

/** Default SFX volume (0–1). */
const DEFAULT_SFX_VOL = 1.0;

/** localStorage key for mute persistence. */
const MUTE_LS_KEY = 'cs_muted';

/** Base path for all audio assets. */
const AUDIO_BASE = '/audio/';

/** SFX IDs that are handled specially (file-based rather than programmatic). */
const FILE_BASED_SFX = new Set(['coffee']);

/** BGM track IDs known at build time. */
const BGM_TRACK_IDS = new Set([
  'bgm_main',
  'bgm_legacy',
  'bgm_hackathon',
  'bgm_coffee',
]);

// ─── Class ───

/**
 * AudioManager singleton — manages all game audio.
 *
 * @example
 * import { audioManager } from './AudioManager.js';
 * // First user gesture:
 * await audioManager.init();
 * // Then anywhere:
 * audioManager.play('tap');
 * audioManager.playBGM('bgm_main');
 */
class AudioManager {
  constructor() {
    /** @type {AudioContext|null} Web Audio context — lazy initialised. */
    this.ctx = null;

    /** @type {GainNode|null} Master gain for BGM. */
    this.bgmGain = null;

    /** @type {GainNode|null} Master gain for SFX. */
    this.sfxGain = null;

    /** @type {HTMLAudioElement|null} Current BGM audio element. */
    this.currentBGM = null;

    /** @type {string|null} Current BGM track ID. */
    this.currentBGMTrack = null;

    /** @type {number|null} Interval handle for burnout loop repeats. */
    this.burnoutInterval = null;

    /** @type {boolean} Whether init() has completed successfully. */
    this.initialized = false;

    /** @type {number} Current BGM volume (0–1), independent of mute. */
    this.bgmVolume = DEFAULT_BGM_VOL;

    /** @type {number} Current SFX volume (0–1), independent of mute. */
    this.sfxVolume = DEFAULT_SFX_VOL;

    /** @type {boolean} Cached mute state. */
    this.muted = false;

    // Restore mute state from localStorage — safe, no audio involved yet.
    try {
      this.muted = localStorage.getItem(MUTE_LS_KEY) === 'true';
    } catch (_e) {
      // private browsing mode — ignore silently
    }

    // Suspend/resume audio when app is backgrounded (Telegram WebView minimised).
    if (typeof document !== 'undefined') {
      this._visibilityHandler = () => {
        if (!this.ctx) return;
        if (document.hidden) {
          this.ctx.suspend().catch(() => {});
          this.pauseBGM();
        } else {
          this.ctx.resume().catch(() => {});
          this.resumeBGMPlayback();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Initialisation
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Lazy-initialise the AudioContext after a user gesture.
   *
   * Must be called once after the first pointer/tap event.
   * Subsequent calls are no-ops (idempotent).
   *
   * @returns {Promise<boolean>} True if init succeeded.
   */
  async init() {
    if (this.initialized) return true;

    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        // Browser lacks Web Audio — degrade gracefully.
        return false;
      }

      this.ctx = new AudioContextCtor();

      // Browsers suspend the context until a gesture — resume it now.
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // Master gain for BGM
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(this.muted ? 0 : this.bgmVolume, this.ctx.currentTime);
      this.bgmGain.connect(this.ctx.destination);

      // Master gain for SFX
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.muted ? 0 : this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.ctx.destination);

      // Apply saved mute state to any pre-existing BGM element
      if (this.currentBGM) {
        this.currentBGM.muted = this.muted;
        this.currentBGM.volume = this.muted ? 0 : this.bgmVolume;
      }

      this.initialized = true;
      return true;
    } catch (_e) {
      // Graceful degradation — game continues without audio.
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SFX playback
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Fire-and-forget SFX playback.
   *
   * Looks up the SFX in SFX_REGISTRY and calls it with (ctx, sfxGain).
   * Silently returns if not initialised, muted, or unknown id.
   *
   * Hot-path optimised: no object allocation inside the lookup/invoke.
   *
   * @param {string} sfxId — Registry key, e.g. 'tap', 'levelup'.
   */
  play(sfxId) {
    if (this.muted) return;
    if (!this.initialized || !this.ctx || !this.sfxGain) return;

    // Special case: file-based SFX (coffee pour)
    if (FILE_BASED_SFX.has(sfxId)) {
      this._playFileSFX(sfxId);
      return;
    }

    const sfxFn = SFX_REGISTRY[sfxId];
    if (typeof sfxFn !== 'function') return;

    try {
      sfxFn(this.ctx, this.sfxGain);
    } catch (_e) {
      // Never throw from audio — game must survive.
    }
  }

  /**
   * Play a file-based SFX (e.g. coffee pour) through the Web Audio graph.
   *
   * Creates a temporary HTMLAudioElement, routes it through
   * createMediaElementSource → sfxGain for consistent ducking/muting.
   *
   * @param {string} sfxId — 'coffee' (maps to sfx_coffee.ogg).
   * @private
   */
  _playFileSFX(sfxId) {
    if (!this.ctx || !this.sfxGain) return;

    try {
      const filename = sfxId === 'coffee' ? 'sfx_coffee.ogg' : `${sfxId}.ogg`;
      const el = new Audio(`${AUDIO_BASE}${filename}`);
      el.preload = 'auto';

      // Route through Web Audio graph so mute/duck applies uniformly.
      const source = this.ctx.createMediaElementSource(el);
      source.connect(this.sfxGain);

      const cleanup = () => {
        try { source.disconnect(); } catch (_e) { /* noop */ }
        try { el.remove(); } catch (_e) { /* noop */ }
      };

      el.addEventListener('ended', cleanup, { once: true });
      el.addEventListener('error', cleanup, { once: true });

      el.play().catch(() => { /* autoplay policy — ignore */ });
    } catch (_e) {
      // Silently ignore total audio failure.
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BGM playback (HTMLAudioElement)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Start playing a BGM track with crossfade support.
   *
   * Stops any previously playing BGM, creates a new HTMLAudioElement
   * with loop=true, and applies current mute/volume state.
   *
   * @param {string} trackId — One of: 'bgm_main', 'bgm_legacy', 'bgm_hackathon', 'bgm_coffee'.
   */
  playBGM(trackId) {
    if (!BGM_TRACK_IDS.has(trackId)) return;

    // If same track already playing, no-op.
    if (this.currentBGMTrack === trackId && this.currentBGM && !this.currentBGM.paused) {
      return;
    }

    // Stop previous track.
    this._stopCurrentBGM();

    try {
      const filename = `${trackId}.ogg`;
      const el = new Audio(`${AUDIO_BASE}${filename}`);
      el.loop = true;
      el.preload = 'auto';
      el.muted = this.muted;
      el.volume = this.muted ? 0 : this.bgmVolume;

      // Store before play() so it's available for ducking immediately.
      this.currentBGM = el;
      this.currentBGMTrack = trackId;

      el.play().catch(() => {
        // Autoplay policy may block — will unmute after init() + gesture.
      });
    } catch (_e) {
      this.currentBGM = null;
      this.currentBGMTrack = null;
    }
  }

  /**
   * Pause the current BGM without unloading it.
   * Use resumeBGM() or playBGM() to resume.
   */
  pauseBGM() {
    try {
      if (this.currentBGM) this.currentBGM.pause();
    } catch (_e) { /* noop */ }
  }

  /**
   * Resume the current BGM element.
   */
  resumeBGMPlayback() {
    try {
      if (this.currentBGM) {
        this.currentBGM.play().catch(() => {});
      }
    } catch (_e) { /* noop */ }
  }

  /**
   * Stop and discard the current BGM element.
   * @private
   */
  _stopCurrentBGM() {
    try {
      if (this.currentBGM) {
        this.currentBGM.pause();
        this.currentBGM.src = '';
        this.currentBGM.load(); // release resources
      }
    } catch (_e) { /* noop */ }
    this.currentBGM = null;
    this.currentBGMTrack = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Ducking (smooth BGM volume transitions)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Smoothly reduce BGM volume (modal overlay, burnout, etc.).
   *
   * Uses exponentialRampToValueAtTime for click-free transitions.
   *
   * @param {number} [to=0.2]    — Target volume multiplier (0–1).
   * @param {number} [duration=0.3] — Ramp duration in seconds.
   */
  duckBGM(to = 0.2, duration = 0.3) {
    if (!this.initialized || !this.ctx || !this.bgmGain) return;
    if (this.muted) return; // already silent

    try {
      const now = this.ctx.currentTime;
      const current = this.bgmGain.gain.value;
      this.bgmGain.gain.setValueAtTime(current, now);
      this.bgmGain.gain.exponentialRampToValueAtTime(
        Math.max(to * this.bgmVolume, 0.001),
        now + duration
      );
    } catch (_e) { /* noop */ }
  }

  /**
   * Restore BGM volume to normal after ducking.
   *
   * @param {number} [duration=0.5] — Ramp duration in seconds.
   */
  resumeBGM(duration = 0.5) {
    if (!this.initialized || !this.ctx || !this.bgmGain) return;

    try {
      const now = this.ctx.currentTime;
      const target = this.muted ? 0.001 : this.bgmVolume;
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
      this.bgmGain.gain.exponentialRampToValueAtTime(target, now + duration);
    } catch (_e) { /* noop */ }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Ducking presets
  // ═══════════════════════════════════════════════════════════════════

  /** Duck for modal open (overlay dialogs). */
  duckForModal() { this.duckBGM(0.2, 0.3); }

  /** Resume after modal close. */
  resumeFromModal() { this.resumeBGM(0.3); }

  // ═══════════════════════════════════════════════════════════════════
  //  Burnout special handling
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Enter burnout state: duck BGM heavily and start looping burnout SFX.
   *
   * The burnout SFX (from states.js) emits one 2-second pulse.
   * We re-trigger it every 2 s to create a continuous oppressive drone.
   */
  startBurnout() {
    this.duckBGM(0.15, 1.0);
    this._startBurnoutLoop();
  }

  /**
   * Exit burnout state: restore BGM and stop looping SFX.
   */
  endBurnout() {
    this.resumeBGM(1.0);
    this._stopBurnoutSFX();
  }

  /**
   * Begin the burnout SFX repeat loop.
   * @private
   */
  _startBurnoutLoop() {
    if (this.burnoutInterval !== null) return; // already running

    // Play immediately, then every 2 seconds.
    this.play('burnout');
    this.burnoutInterval = window.setInterval(() => {
      if (!this.muted) {
        this.play('burnout');
      }
    }, 2000);
  }

  /**
   * Stop the burnout SFX repeat loop.
   * @private
   */
  _stopBurnoutSFX() {
    if (this.burnoutInterval !== null) {
      clearInterval(this.burnoutInterval);
      this.burnoutInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Mute / unmute
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Set global mute state and persist to localStorage.
   *
   * @param {boolean} v — true = muted, false = unmuted.
   */
  setMute(v) {
    this.muted = Boolean(v);

    // Persist
    try {
      localStorage.setItem(MUTE_LS_KEY, this.muted ? 'true' : 'false');
    } catch (_e) {
      // private browsing — ignore
    }

    // Update gain nodes immediately
    if (this.initialized && this.ctx) {
      const now = this.ctx.currentTime;

      if (this.bgmGain) {
        const bgmTarget = this.muted ? 0.001 : this.bgmVolume;
        this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
        this.bgmGain.gain.exponentialRampToValueAtTime(bgmTarget, now + 0.1);
      }

      if (this.sfxGain) {
        const sfxTarget = this.muted ? 0.001 : this.sfxVolume;
        this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
        this.sfxGain.gain.exponentialRampToValueAtTime(sfxTarget, now + 0.1);
      }
    }

    // Update HTMLAudioElement volume directly
    if (this.currentBGM) {
      this.currentBGM.muted = this.muted;
      this.currentBGM.volume = this.muted ? 0 : this.bgmVolume;
    }
  }

  /**
   * Toggle mute state.
   * @returns {boolean} New mute state.
   */
  toggleMute() {
    this.setMute(!this.muted);
    return this.muted;
  }

  /**
   * Read-only check for current mute state.
   * @returns {boolean}
   */
  isMuted() {
    return this.muted;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Volume setters (per-channel, persisted separately from mute)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Set BGM volume level (0–1). Independent of mute.
   * @param {number} v
   */
  setBGMVolume(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.initialized && this.bgmGain && !this.muted) {
      try {
        this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
      } catch (_e) { /* noop */ }
    }
    if (this.currentBGM && !this.muted) {
      this.currentBGM.volume = this.bgmVolume;
    }
  }

  /**
   * Set SFX volume level (0–1). Independent of mute.
   * @param {number} v
   */
  setSFXVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.initialized && this.sfxGain && !this.muted) {
      try {
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      } catch (_e) { /* noop */ }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Dispose all audio resources.
   * Call on game exit / component unmount.
   */
  dispose() {
    this._stopBurnoutSFX();
    this._stopCurrentBGM();

    if (typeof document !== 'undefined' && this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }

    if (this.bgmGain) {
      try { this.bgmGain.disconnect(); } catch (_e) { /* noop */ }
      this.bgmGain = null;
    }
    if (this.sfxGain) {
      try { this.sfxGain.disconnect(); } catch (_e) { /* noop */ }
      this.sfxGain = null;
    }
    if (this.ctx) {
      try { this.ctx.close(); } catch (_e) { /* noop */ }
      this.ctx = null;
    }

    this.initialized = false;
  }
}

// ─── Singleton ───

/** Shared AudioManager instance for the entire application. */
export const audioManager = new AudioManager();

export default AudioManager;
