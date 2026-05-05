import { createContext } from 'preact';
import { useState, useContext, useCallback } from 'preact/hooks';

const TelegramContext = createContext(null);

export function TelegramProvider({ children }) {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  
  const haptic = useCallback((type = 'light') => {
    if (tg?.HapticFeedback) {
      try {
        if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred(type);
      } catch (e) {
        // Ignore haptic errors
      }
    }
  }, [tg]);

  const value = {
    tg,
    user: tg?.initDataUnsafe?.user || null,
    haptic,
    showMainButton: (text, onClick) => {
      if (tg?.MainButton) {
        tg.MainButton.setText(text);
        tg.MainButton.onClick(onClick);
        tg.MainButton.show();
      }
    },
    hideMainButton: () => tg?.MainButton?.hide()
  };

  return h(TelegramContext.Provider, { value }, children);
}

export function useTelegram() {
  return useContext(TelegramContext);
}
