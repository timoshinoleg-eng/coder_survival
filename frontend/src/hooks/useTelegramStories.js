import { useCallback } from 'preact/hooks';
import { useTelegram } from './useTelegram.js';

/**
 * Telegram Stories integration hook.
 * Wraps window.Telegram.WebApp.shareToStory with graceful fallbacks.
 */
export function useTelegramStories() {
  const { tg, haptic } = useTelegram();

  const isAvailable = useCallback(() => {
    return typeof window !== 'undefined'
      && !!window.Telegram?.WebApp?.shareToStory;
  }, []);

  const fallbackShare = useCallback(async (imageBlob, text) => {
    if (!imageBlob) return { success: false, error: 'No image provided' };

    try {
      const file = new File([imageBlob], 'coder-survival-story.png', { type: imageBlob.type || 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Coder Survival', text: text || '' });
        return { success: true, method: 'native_share' };
      }
    } catch (err) {
      console.warn('[useTelegramStories] native share failed:', err);
    }

    // Last resort: download
    try {
      const url = URL.createObjectURL(imageBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'coder-survival-story.png';
      a.click();
      URL.revokeObjectURL(url);
      return { success: true, method: 'download' };
    } catch (err) {
      return { success: false, error: err?.message || 'Fallback failed' };
    }
  }, []);

  const shareToStory = useCallback(async (imageBlob, text, widgetLink) => {
    haptic?.('success');

    const tgApi = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

    if (!tgApi?.shareToStory) {
      console.warn('[useTelegramStories] shareToStory unavailable, falling back to navigator.share');
      return fallbackShare(imageBlob, text);
    }

    try {
      const params = {};
      if (text) params.text = text;
      if (widgetLink) params.widget_link = widgetLink;

      // Telegram WebApp expects a URL or a Blob. Modern versions accept Blob directly.
      // We attempt Blob first, then fall back to ObjectURL.
      let mediaUrl = imageBlob;
      let objectUrl = null;

      if (imageBlob instanceof Blob && !(imageBlob instanceof File)) {
        // Some Telegram clients accept Blob; if not, we'll catch and retry with URL
        try {
          tgApi.shareToStory(mediaUrl, params);
          return { success: true, method: 'tg_blob' };
        } catch (err) {
          if (err?.message?.includes('URL') || err?.message?.includes('string')) {
            objectUrl = URL.createObjectURL(imageBlob);
            mediaUrl = objectUrl;
          } else {
            throw err;
          }
        }
      }

      tgApi.shareToStory(mediaUrl, params);

      if (objectUrl) {
        // Cleanup after a short delay to ensure Telegram picked it up
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      }

      return { success: true, method: 'tg_story' };
    } catch (err) {
      console.error('[useTelegramStories] shareToStory failed:', err);
      return fallbackShare(imageBlob, text);
    }
  }, [haptic, fallbackShare]);

  return {
    isAvailable,
    shareToStory,
    fallbackShare,
  };
}
