import { useEffect } from 'preact/hooks';

export function useClosingConfirmation(enabled = true) {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg || typeof tg.enableClosingConfirmation !== 'function' || typeof tg.disableClosingConfirmation !== 'function') {
      return;
    }
    if (enabled) {
      tg.enableClosingConfirmation();
    }
    return () => {
      tg.disableClosingConfirmation();
    };
  }, [enabled]);
}
