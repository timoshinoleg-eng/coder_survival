import { useState, useCallback, useRef, useEffect } from 'preact/hooks';

/**
 * Lightweight Preact hook wrapper around the global AdsGram SDK.
 *
 * Usage:
 *   const { isReady, showAd } = useAdsGram(import.meta.env.VITE_ADSGRAM_BLOCK_ID);
 *   await showAd(); // resolves when user watches to the end
 */
export function useAdsGram(blockId) {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.AdsGram || !blockId) {
      setIsReady(false);
      return;
    }

    try {
      controllerRef.current = window.AdsGram.init({
        blockId,
        debug: import.meta.env.DEV,
      });
      setIsReady(true);
      setError(null);
    } catch (err) {
      console.warn('[useAdsGram] Init failed:', err);
      setError(err);
      setIsReady(false);
    }

    return () => {
      if (controllerRef.current) {
        try {
          controllerRef.current.destroy();
        } catch (e) {
          // ignore cleanup errors
        }
        controllerRef.current = null;
      }
    };
  }, [blockId]);

  const initAd = useCallback(async () => {
    if (typeof window === 'undefined' || !window.AdsGram || !blockId) {
      return null;
    }
    if (!controllerRef.current) {
      controllerRef.current = window.AdsGram.init({
        blockId,
        debug: import.meta.env.DEV,
      });
      setIsReady(true);
    }
    return controllerRef.current;
  }, [blockId]);

  const showAd = useCallback(async () => {
    const ad = await initAd();
    if (!ad) {
      throw new Error('AdsGram controller not ready');
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await ad.show();
      setIsLoading(false);
      return result;
    } catch (err) {
      setIsLoading(false);
      setError(err);
      throw err;
    }
  }, [initAd]);

  const addEventListener = useCallback((event, handler) => {
    const ad = controllerRef.current;
    if (!ad) return;
    ad.addEventListener(event, handler);
  }, []);

  const removeEventListener = useCallback((event, handler) => {
    const ad = controllerRef.current;
    if (!ad) return;
    ad.removeEventListener(event, handler);
  }, []);

  return {
    isReady,
    isLoading,
    error,
    initAd,
    showAd,
    addEventListener,
    removeEventListener,
  };
}
