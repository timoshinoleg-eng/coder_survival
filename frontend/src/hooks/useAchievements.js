import { useCallback, useEffect, useState } from 'preact/hooks';
import { apiRequest } from '../utils/api.js';

const sharedAchievementState = {
  myAchievements: [],
  toastQueue: [],
};
const sharedListeners = new Set();
let sharedToastTimer = null;

function emitSharedState() {
  for (const listener of sharedListeners) {
    try {
      listener();
    } catch (_err) {
      // One unmounted consumer must not break the shared achievement channel.
    }
  }
}

function scheduleToastDismiss() {
  if (sharedToastTimer || sharedAchievementState.toastQueue.length === 0) return;
  sharedToastTimer = setTimeout(() => {
    sharedToastTimer = null;
    sharedAchievementState.toastQueue = sharedAchievementState.toastQueue.slice(1);
    emitSharedState();
    scheduleToastDismiss();
  }, 3000);
}

export function useAchievements(initData) {
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState(null);
  const [, setSharedRevision] = useState(0);

  useEffect(() => {
    const listener = () => setSharedRevision((value) => value + 1);
    sharedListeners.add(listener);
    return () => sharedListeners.delete(listener);
  }, []);

  const myAchievements = sharedAchievementState.myAchievements;
  const toastQueue = sharedAchievementState.toastQueue;
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
      sharedAchievementState.myAchievements = data?.earned || [];
      emitSharedState();
    } catch (err) {
      // Silent fail for badge
    }
  }, [initData]);

  useEffect(() => {
    if (initData) fetchMyAchievements();
  }, [initData, fetchMyAchievements]);

  const claimAchievement = useCallback(async (slug) => {
    if (!initData || claiming) return null;
    setClaiming(slug);
    try {
      const result = await apiRequest(`/api/achievements/${slug}/claim`, {
        method: 'POST',
        initData,
      });
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
    sharedAchievementState.toastQueue = [
      ...sharedAchievementState.toastQueue,
      ...slugs,
    ];
    emitSharedState();
    scheduleToastDismiss();
  }, []);

  const dismissToast = useCallback(() => {
    if (sharedAchievementState.toastQueue.length === 0) return;
    if (sharedToastTimer) {
      clearTimeout(sharedToastTimer);
      sharedToastTimer = null;
    }
    sharedAchievementState.toastQueue = sharedAchievementState.toastQueue.slice(1);
    emitSharedState();
    scheduleToastDismiss();
  }, []);

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
