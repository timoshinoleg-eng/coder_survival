/**
 * @fileoverview AudioSettings — mute/unmute toggle button for the game HUD.
 *
 * A tiny, self-contained Preact component that displays a volume
 * icon (loudspeaker or muted) and toggles global audio mute on click.
 *
 * On first interaction it also initialises the AudioContext (lazy-init),
 * satisfying the browser autoplay policy which requires a user gesture.
 */

import { useState, useCallback, useEffect } from 'preact/hooks';
import { audioManager } from '../utils/AudioManager.js';
import { Analytics } from '../utils/analytics.js';
import './AudioSettings.css';

/**
 * AudioSettings toggle button.
 *
 * Multiple controls may be mounted in different HUD surfaces. Their local
 * render state is subscribed to the single AudioManager source of truth so
 * toggling one control immediately updates every other mounted control.
 *
 * @returns {JSX.Element} Circular icon button showing 🔊 or 🔇.
 */
export default function AudioSettings() {
  const [muted, setMuted] = useState(() => audioManager.isMuted());

  useEffect(() => audioManager.subscribeMute(setMuted), []);

  const toggle = useCallback(() => {
    // Lazy-init AudioContext on first user gesture.
    if (!audioManager.initialized) {
      audioManager.init().catch(() => { /* graceful degradation */ });
    }

    const previous = audioManager.isMuted();
    const next = !previous;
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
      old_value: previous,
    });
  }, []);

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
