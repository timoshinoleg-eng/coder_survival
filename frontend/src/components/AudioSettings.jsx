/**
 * @fileoverview AudioSettings — mute/unmute toggle button for the game HUD.
 *
 * A tiny, self-contained Preact component that displays a volume
 * icon (loudspeaker or muted) and toggles global audio mute on click.
 *
 * On first interaction it also initialises the AudioContext (lazy-init),
 * satisfying the browser autoplay policy which requires a user gesture.
 *
 * Usage:
 *   import AudioSettings from './components/AudioSettings.jsx';
 *   // In your HUD:
 *   <AudioSettings />
 *
 * Styling:
 *   Import './AudioSettings.css' in your app entry or add the styles
 *   to your global stylesheet.
 */

import { useState, useCallback } from 'preact/hooks';
import { audioManager } from '../utils/AudioManager.js';
import { Analytics } from '../utils/analytics.js';
import './AudioSettings.css';

/**
 * AudioSettings toggle button.
 *
 * @returns {JSX.Element} Circular icon button showing 🔊 or 🔇.
 */
export default function AudioSettings() {
  /** @type {[boolean, Function]} muted state synced with audioManager. */
  const [muted, setMuted] = useState(() => audioManager.isMuted());

  /**
   * Toggle mute state.
   * Initialises AudioContext on first click (browser autoplay requirement).
   */
  const toggle = useCallback(() => {
    // Lazy-init AudioContext on first user gesture.
    if (!audioManager.initialized) {
      audioManager.init().catch(() => { /* graceful degradation */ });
    }

    const next = !muted;
    audioManager.setMute(next);
    if (!next) {
      if (audioManager.currentBGMTrack) {
        audioManager.resumeBGMPlayback();
      } else {
        audioManager.playBGM('bgm_main');
      }
    }
    Analytics.track('settings_changed', {
      setting_name: 'audio_mute',
      new_value: next,
      old_value: muted,
    });
    setMuted(next);
  }, [muted]);

  return (
    <button
      className="audio-settings-btn"
      onClick={toggle}
      aria-label={muted ? 'Unmute audio' : 'Mute audio'}
      title={muted ? 'Unmute' : 'Mute'}
      type="button"
    >
      {muted ? '\u{1F507}' : '\u{1F50A}'}
    </button>
  );
}
