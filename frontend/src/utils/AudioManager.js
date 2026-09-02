import { SFX_REGISTRY } from './SFX_REGISTRY.js';

const MUTE_KEY = 'cs_muted';
const BGM_KEY = 'cs_bgm_enabled';
const AUDIO_BASE = '/audio/';
const BGM_TRACKS = new Set(['bgm_main', 'bgm_legacy', 'bgm_hackathon', 'bgm_coffee', 'bgm_lofi']);

class AudioManager {
  constructor() {
    this.ctx = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.currentBGM = null;
    this.currentBGMSource = null;
    this.currentBGMTrack = null;
    this.initialized = false;
    this.sfxEnabled = true;
    this.bgmEnabled = false;
    this.bgmVolume = 0.25;
    this.sfxVolume = 1.0;
    this.muted = false;
    this.burnoutInterval = null;

    try {
      this.muted = localStorage.getItem(MUTE_KEY) === 'true';
      this.bgmEnabled = localStorage.getItem(BGM_KEY) === 'true';
    } catch (_err) {
      this.muted = false;
      this.bgmEnabled = false;
    }

    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => this.handleVisibility();
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      this.pageHideHandler = () => this.suspendForBackground();
      this.pageShowHandler = () => this.resumeFromBackground();
      window.addEventListener('pagehide', this.pageHideHandler);
      window.addEventListener('pageshow', this.pageShowHandler);
    }
  }

  async init() {
    if (this.initialized) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.muted ? 0.001 : this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.muted ? 0.001 : this.bgmVolume;
      this.bgmGain.connect(this.ctx.destination);

      this.initialized = true;
      if (this.ctx.state !== 'suspended') {
        await this.ctx.suspend();
      }
      return true;
    } catch (_err) {
      return false;
    }
  }

  resumeOnGesture() {
    return Promise.resolve()
      .then(() => (this.initialized ? true : this.init()))
      .then(() => {
        if (this.ctx?.state === 'suspended') return this.ctx.resume();
        return true;
      })
      .catch(() => false);
  }

  play(sfxId) {
    if (this.muted || !this.sfxEnabled || !this.initialized || !this.ctx || !this.sfxGain) return;
    const fn = SFX_REGISTRY[sfxId];
    if (typeof fn === 'function') {
      try {
        fn(this.ctx, this.sfxGain);
      } catch (_err) {
        // Audio must never break gameplay.
      }
    }
  }

  playSfx(name) {
    return this.play(name);
  }

  switchZoneBGM(zoneType) {
    const map = {
      main: 'bgm_main',
      legacy: 'bgm_legacy',
      hackathon: 'bgm_hackathon',
      coffee: 'bgm_coffee'
    };
    const track = map[zoneType];
    if (track) this.playBGM(track);
  }

  playBGM(trackId = 'bgm_main') {
    if (!this.bgmEnabled || this.muted || !BGM_TRACKS.has(trackId)) return;
    if (this.currentBGMTrack === trackId && this.currentBGM && !this.currentBGM.paused) return;
    this.stopBGM();
    try {
      const el = new Audio(`${AUDIO_BASE}${trackId}.ogg`);
      el.loop = true;
      el.preload = 'auto';
      el.playsInline = true;
      this.currentBGM = el;
      this.currentBGMTrack = trackId;
      this.connectCurrentBGM();
      this.syncBGMVolume();
      el.play().catch(() => {});
    } catch (_err) {
      this.currentBGM = null;
      this.currentBGMTrack = null;
    }
  }

  connectCurrentBGM() {
    if (!this.currentBGM || !this.ctx || !this.bgmGain || this.currentBGMSource) return;
    try {
      this.currentBGMSource = this.ctx.createMediaElementSource(this.currentBGM);
      this.currentBGMSource.connect(this.bgmGain);
    } catch (_err) {
      this.currentBGMSource = null;
    }
  }

  syncBGMVolume() {
    if (!this.currentBGM) return;
    this.currentBGM.muted = this.muted;
    this.currentBGM.volume = this.currentBGMSource ? 1 : (this.muted ? 0 : this.bgmVolume);
  }

  pauseBGM() {
    try {
      this.currentBGM?.pause();
    } catch (_err) {
      // noop
    }
  }

  resumeBGMPlayback() {
    if (!this.bgmEnabled || this.muted) return;
    try {
      this.currentBGM?.play().catch(() => {});
    } catch (_err) {
      // noop
    }
  }

  stopBGM() {
    try {
      if (this.currentBGM) {
        this.currentBGM.pause();
        this.currentBGM.src = '';
        this.currentBGM.load();
      }
    } catch (_err) {
      // noop
    }
    try {
      this.currentBGMSource?.disconnect();
    } catch (_err) {
      // noop
    }
    this.currentBGM = null;
    this.currentBGMSource = null;
    this.currentBGMTrack = null;
  }

  duckBGM(factor = 0.2, duration = 0.2) {
    if (!this.initialized || !this.ctx || !this.bgmGain || this.muted) return;
    const target = Math.max(0.001, this.bgmVolume * factor);
    this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, duration);
  }

  resumeBGM(duration = 0.4) {
    if (!this.initialized || !this.ctx || !this.bgmGain) return;
    const target = this.muted ? 0.001 : this.bgmVolume;
    this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, duration);
  }

  duckForModal() {
    this.duckBGM(0.2, 0.2);
  }

  resumeFromModal() {
    this.resumeBGM(0.3);
  }

  startBurnout() {
    this.duckBGM(0.15, 0.6);
    if (this.burnoutInterval !== null) return;
    this.play('burnout');
    this.burnoutInterval = window.setInterval(() => this.play('burnout'), 2000);
  }

  endBurnout() {
    this.resumeBGM(0.8);
    if (this.burnoutInterval !== null) {
      clearInterval(this.burnoutInterval);
      this.burnoutInterval = null;
    }
  }

  suspendForBackground() {
    if (!this.ctx) return;
    this.pauseBGM();
    if (this.ctx.state !== 'closed') {
      this.ctx.suspend().catch(() => {});
    }
  }

  resumeFromBackground() {
    if (!this.ctx || !this.initialized || this.ctx.state === 'closed') return;
    this.ctx.resume().catch(() => {});
    this.resumeBGMPlayback();
  }

  handleVisibility() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      this.suspendForBackground();
    } else {
      this.resumeFromBackground();
    }
  }

  setMute(value) {
    this.muted = Boolean(value);
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? 'true' : 'false');
    } catch (_err) {
      // noop
    }
    if (this.sfxGain) this.sfxGain.gain.value = this.muted ? 0.001 : this.sfxVolume;
    if (this.bgmGain) this.bgmGain.gain.value = this.muted ? 0.001 : this.bgmVolume;
    this.syncBGMVolume();
  }

  toggleMute() {
    this.setMute(!this.muted);
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  setBGMEnabled(value) {
    this.bgmEnabled = Boolean(value);
    try {
      localStorage.setItem(BGM_KEY, this.bgmEnabled ? 'true' : 'false');
    } catch (_err) {
      // noop
    }
    if (!this.bgmEnabled) this.stopBGM();
    else this.playBGM(this.currentBGMTrack || 'bgm_main');
  }

  setBGMVolume(value) {
    this.bgmVolume = Math.max(0, Math.min(1, Number(value)));
    if (this.bgmGain && !this.muted) this.bgmGain.gain.value = this.bgmVolume;
    this.syncBGMVolume();
  }

  setSFXVolume(value) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(value)));
    if (this.sfxGain && !this.muted) this.sfxGain.gain.value = this.sfxVolume;
  }

  dispose() {
    this.endBurnout();
    this.stopBGM();
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      if (this.pageHideHandler) window.removeEventListener('pagehide', this.pageHideHandler);
      if (this.pageShowHandler) window.removeEventListener('pageshow', this.pageShowHandler);
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.initialized = false;
  }
}

export const audioManager = new AudioManager();
export default AudioManager;
