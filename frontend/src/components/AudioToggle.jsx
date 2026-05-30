import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { audioManager } from '../utils/AudioManager.js';

export default function AudioToggle() {
  const [sfx, setSfx] = useState(true);
  const [bgm, setBgm] = useState(() => audioManager.bgmEnabled === true);

  useEffect(() => {
    audioManager.sfxEnabled = sfx;
  }, [sfx]);

  useEffect(() => {
    audioManager.setBGMEnabled(bgm);
  }, [bgm]);

  useEffect(() => {
    const handler = () => audioManager.handleVisibility();
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const buttonStyle = {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    border: '1px solid #315178',
    background: '#10203a',
    color: '#dbeafe',
    fontSize: '15px'
  };

  return h('div', {
    style: {
      position: 'fixed',
      top: '10px',
      right: '10px',
      zIndex: 55,
      display: 'flex',
      gap: '6px'
    }
  }, [
    h('button', {
      type: 'button',
      title: 'SFX',
      onClick: () => {
        audioManager.resumeOnGesture();
        setSfx((value) => !value);
      },
      style: buttonStyle
    }, sfx ? 'SFX' : 'OFF'),
    h('button', {
      type: 'button',
      title: 'BGM',
      onClick: () => {
        audioManager.resumeOnGesture();
        setBgm((value) => !value);
      },
      style: buttonStyle
    }, bgm ? 'BGM' : '...') 
  ]);
}
