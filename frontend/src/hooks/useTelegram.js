import { h, createContext } from 'preact';
import { useContext, useCallback, useState, useEffect } from 'preact/hooks';

const TelegramContext = createContext(null);

export function TelegramProvider({ children }) {
  const [tgReady, setTgReady] = useState(false);
  const [tgTimedOut, setTgTimedOut] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.log('[TelegramProvider] Checking WebApp...', { hasTelegram: !!window.Telegram, hasWebApp: !!window.Telegram?.WebApp });
    if (window.Telegram?.WebApp) {
      console.log('[TelegramProvider] WebApp found immediately, initData length:', window.Telegram.WebApp.initData?.length || 0);
      setTgReady(true);
      setTgTimedOut(false);
      return;
    }
    // Ждём загрузки telegram-web-app.js
    const checkInterval = setInterval(() => {
      if (window.Telegram?.WebApp) {
        console.log('[TelegramProvider] WebApp loaded after poll, initData length:', window.Telegram.WebApp.initData?.length || 0);
        setTgReady(true);
        setTgTimedOut(false);
        clearInterval(checkInterval);
      }
    }, 50);
    // Таймаут 5 секунд
    const timeout = setTimeout(() => {
      console.log('[TelegramProvider] Timeout waiting for WebApp');
      setTgTimedOut(true);
      clearInterval(checkInterval);
    }, 5000);
    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, []);

  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  const isLocalDev = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  const haptic = useCallback((type = 'light') => {
    if (tg?.HapticFeedback) {
      try {
        if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred(type);
      } catch (e) {
        // Ignore haptic errors
      }
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(type === 'light' ? 10 : type === 'medium' ? 15 : 20);
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
    isPending: !tgReady && !tgTimedOut,
    isLocalDev,
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
