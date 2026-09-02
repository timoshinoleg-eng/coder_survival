import { STAGE2 } from '../config/balance.js';

const { STREAK } = STAGE2;

function getYesterday(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  const start = new Date(`${left}T00:00:00.000Z`);
  const end = new Date(`${right}T00:00:00.000Z`);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeProtection(protection = {}) {
  return {
    freeUsed: protection.freeUsed === true,
    starSavesUsed: Number(protection.starSavesUsed || 0),
    teamSaveAvailable: protection.teamSaveAvailable === true
  };
}

export function calculateRecoveryCost(starSavesUsed) {
  const base = STREAK.RECOVERY.starBaseCost;
  const increment = STREAK.RECOVERY.starCostIncrement;
  return base + (starSavesUsed * increment);
}

function getNextDate(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function getSecondsToLocalMidnight(now = new Date(), timezoneOffsetMinutes = 0) {
  const offsetMs = Number(timezoneOffsetMinutes || 0) * 60 * 1000;
  const localNowMs = now.getTime() + offsetMs;
  const localNow = new Date(localNowMs);
  const nextLocalMidnightMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + 1,
    0, 0, 0, 0
  );
  return Math.max(0, Math.floor((nextLocalMidnightMs - localNowMs) / 1000));
}

export function shouldOfferStreakSaver({
  streakState = {},
  energy = 0,
  todayDate,
  now = new Date(),
  timezoneOffsetMinutes = 0
}) {
  const currentStreak = Number(streakState.currentStreak || 0);
  if (currentStreak <= 0) return false;
  if (Number(energy || 0) > 0) return false;
  if (streakState.lastLoginDate === todayDate) return false;

  const secondsToMidnight = getSecondsToLocalMidnight(now, timezoneOffsetMinutes);
  if (secondsToMidnight >= STAGE2.STREAK.SAVER.triggerWindowSeconds) {
    return false;
  }

  const lastSavedAt = streakState.lastStreakSaveTimestamp ? new Date(streakState.lastStreakSaveTimestamp) : null;
  if (lastSavedAt && !Number.isNaN(lastSavedAt.getTime())) {
    const daysSinceLastSave = Math.floor((now.getTime() - lastSavedAt.getTime()) / 86400000);
    if (daysSinceLastSave < STAGE2.STREAK.SAVER.minIntervalDays) {
      return false;
    }
  }

  return true;
}

export function armStreakSaver(streakState = {}, todayDate, now = new Date()) {
  return {
    ...streakState,
    saverArmedForDate: todayDate,
    lastStreakSaveTimestamp: now.toISOString()
  };
}

export function starRecover(streakState, todayDate, starsAvailable) {
  const protection = normalizeProtection(streakState.protection);
  const last = streakState.lastLoginDate || null;
  const brokenStreak = Number(streakState.brokenStreak || 0);

  if (!last || brokenStreak <= 0) {
    return { success: false, reason: 'no_streak', newState: streakState, cost: 0 };
  }

  const missed = daysBetween(last, todayDate) - 1;
  if (missed < 1) {
    return { success: false, reason: 'not_broken', newState: streakState, cost: 0 };
  }

  const cost = calculateRecoveryCost(protection.starSavesUsed);
  if (starsAvailable < cost) {
    return { success: false, reason: 'not_enough_stars', newState: streakState, cost };
  }

  const nextProtection = {
    ...protection,
    starSavesUsed: protection.starSavesUsed + 1
  };

  const newState = {
    ...streakState,
    lastLoginDate: todayDate,
    currentStreak: brokenStreak,
    maxStreak: Math.max(Number(streakState.maxStreak || 0), brokenStreak),
    protection: nextProtection,
    brokenStreak: null
  };

  return { success: true, newState, cost };
}

export function processDailyLogin(streakState = {}, todayDate) {
  // Проверка заморозки стрика
  const frozenUntil = streakState.streakFrozenUntil;
  if (frozenUntil) {
    const frozen = new Date(frozenUntil);
    if (frozen > new Date()) {
      return {
        status: 'streak_frozen',
        streakState,
        rewards: null,
        brokenStreak: null,
        frozenUntil: frozenUntil
      };
    }
  }
  const last = streakState.lastLoginDate || null;
  const current = Number(streakState.currentStreak || 0);
  const protection = normalizeProtection(streakState.protection);

  if (last === todayDate) {
    return {
      status: 'already_logged_in',
      streakState,
      rewards: null,
      brokenStreak: null
    };
  }

  if (!last) {
    const newState = {
      ...streakState,
      lastLoginDate: todayDate,
      currentStreak: 1,
      maxStreak: Math.max(Number(streakState.maxStreak || 0), 1),
      protection
    };

    return {
      status: 'streak_started',
      streakState: newState,
      rewards: { daily: STREAK.DAILY_REWARD, milestone: null },
      brokenStreak: null
    };
  }

  if (last === getYesterday(todayDate)) {
    const newStreak = current + 1;
    const milestone = STREAK.MILESTONES[newStreak] || null;
    const newState = {
      ...streakState,
      lastLoginDate: todayDate,
      currentStreak: newStreak,
      maxStreak: Math.max(Number(streakState.maxStreak || 0), newStreak),
      protection
    };

    return {
      status: 'streak_continued',
      streakState: newState,
      rewards: { daily: STREAK.DAILY_REWARD, milestone },
      brokenStreak: null
    };
  }

  const missed = Math.max(1, daysBetween(last, todayDate) - 1);

  if (streakState.saverArmedForDate === getYesterday(todayDate)) {
    return {
      status: 'streak_saved_paid',
      streakState: {
        ...streakState,
        lastLoginDate: todayDate,
        currentStreak: current + 1,
        maxStreak: Math.max(Number(streakState.maxStreak || 0), current + 1),
        protection,
        saverArmedForDate: null,
        brokenStreak: null
      },
      rewards: { daily: STREAK.DAILY_REWARD, milestone: STREAK.MILESTONES[current + 1] || null },
      brokenStreak: null,
      missedDays: missed
    };
  }

  if (!protection.freeUsed) {
    const nextProtection = { ...protection, freeUsed: true };
    return {
      status: 'streak_saved_free',
      streakState: {
        ...streakState,
        lastLoginDate: todayDate,
        currentStreak: 1,
        maxStreak: Number(streakState.maxStreak || 0),
        protection: nextProtection
      },
      rewards: { daily: STREAK.DAILY_REWARD, milestone: null },
      brokenStreak: current,
      missedDays: missed
    };
  }

  if (protection.teamSaveAvailable) {
    const nextProtection = { ...protection, teamSaveAvailable: false };
    return {
      status: 'streak_saved_team',
      streakState: {
        ...streakState,
        lastLoginDate: todayDate,
        currentStreak: 1,
        maxStreak: Number(streakState.maxStreak || 0),
        protection: nextProtection
      },
      rewards: { daily: STREAK.DAILY_REWARD, milestone: null },
      brokenStreak: current,
      missedDays: missed
    };
  }

  return {
    status: 'streak_broken',
    streakState: {
      ...streakState,
      lastLoginDate: todayDate,
      currentStreak: 1,
      maxStreak: Number(streakState.maxStreak || 0),
      protection,
      brokenStreak: current
    },
    rewards: { daily: STREAK.DAILY_REWARD, milestone: null },
    brokenStreak: current,
    missedDays: missed
  };
}
