import { h, createContext } from 'preact';
import { useContext, useCallback } from 'preact/hooks';

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

  const shareText = useCallback((text) => {
    const url = `https://t.me/share/url?text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) {
      try {
        tg.openTelegramLink(url);
      } catch (e) {
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  }, [tg]);

  const shareUrl = useCallback((url, text) => {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) {
      try {
        tg.openTelegramLink(shareUrl);
      } catch (e) {
        window.open(shareUrl, '_blank');
      }
    } else {
      window.open(shareUrl, '_blank');
    }
  }, [tg]);

  const value = {
    tg,
    user: tg?.initDataUnsafe?.user || null,
    initData: tg?.initData || '',
    startParam: tg?.initDataUnsafe?.start_param || '',
    haptic,
    shareText,
    shareUrl,
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
