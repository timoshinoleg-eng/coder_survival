import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';

export function useAchievements(initData) {
  const [achievements, setAchievements] = useState([]);
  const [myAchievements, setMyAchievements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState(null);
  const [toastQueue, setToastQueue] = useState([]);
  const toastTimerRef = useRef(null);

  const unreadCount = myAchievements.filter(
    (a) => a.earned_at && !a.claimed_at && !a.notification_sent
  ).length;

  const fetchAchievements = useCallback(async () => {
    if (!initData) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest('/api/achievements', { initData });
      setAchievements(data?.achievements || []);
    } catch (err) {
      setError(err.message || 'Failed to load achievements');
    } finally {
      setLoading(false);
    }
  }, [initData]);

  const fetchMyAchievements = useCallback(async () => {
    if (!initData) return;
    try {
      const data = await apiRequest('/api/achievements/my', { initData });
      setMyAchievements(data?.earned || []);
    } catch (err) {
      // Silent fail for badge
    }
  }, [initData]);

  const claimAchievement = useCallback(async (slug) => {
    if (!initData || claiming) return null;
    setClaiming(slug);
    try {
      const result = await apiRequest(`/api/achievements/${slug}/claim`, {
        method: 'POST',
        initData,
      });
      // Refresh after claim
      await fetchAchievements();
      await fetchMyAchievements();
      return result;
    } catch (err) {
      setError(err.message || 'Claim failed');
      throw err;
    } finally {
      setClaiming(null);
    }
  }, [initData, claiming, fetchAchievements, fetchMyAchievements]);

  const markRead = useCallback(async (slugs) => {
    if (!initData || !slugs?.length) return;
    try {
      await apiRequest('/api/achievements/read', {
        method: 'POST',
        body: { slugs },
        initData,
      });
      await fetchMyAchievements();
    } catch (err) {
      // Silent
    }
  }, [initData, fetchMyAchievements]);

  const queueToast = useCallback((slugs) => {
    if (!slugs?.length) return;
    setToastQueue((prev) => [...prev, ...slugs]);
  }, []);

  const dismissToast = useCallback(() => {
    setToastQueue((prev) => prev.slice(1));
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastQueue.length === 0) {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      return;
    }
    toastTimerRef.current = setTimeout(() => {
      dismissToast();
    }, 3000);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [toastQueue, dismissToast]);

  return {
    achievements,
    myAchievements,
    loading,
    error,
    claiming,
    unreadCount,
    toastQueue,
    fetchAchievements,
    fetchMyAchievements,
    claimAchievement,
    markRead,
    queueToast,
    dismissToast,
  };
}
