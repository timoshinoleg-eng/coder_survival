import { STAGE2 } from '../config/balance.js';

const { MINIGAMES } = STAGE2;

export function canPlay(minigameState, gameType, playerLevel, now = new Date()) {
  const config = MINIGAMES[gameType];
  if (!config) return { canPlay: false, reason: 'unknown_game' };

  if (playerLevel < config.requiredLevel) {
    return { canPlay: false, reason: 'level_too_low', requiredLevel: config.requiredLevel };
  }

  const state = minigameState?.[gameType] || {};
  const lastPlayed = state.lastPlayedAt ? new Date(state.lastPlayedAt) : null;
  if (lastPlayed) {
    const cooldownMs = config.cooldownHours * 60 * 60 * 1000;
    const elapsed = now.getTime() - lastPlayed.getTime();
    if (elapsed < cooldownMs) {
      return { canPlay: false, reason: 'cooldown', remainingMs: cooldownMs - elapsed };
    }
  }

  return { canPlay: true, config };
}

export function calculateCooldownRemaining(minigameState, gameType, now = new Date()) {
  const config = MINIGAMES[gameType];
  if (!config) return 0;

  const state = minigameState?.[gameType] || {};
  const lastPlayed = state.lastPlayedAt ? new Date(state.lastPlayedAt) : null;
  if (!lastPlayed) return 0;

  const cooldownMs = config.cooldownHours * 60 * 60 * 1000;
  const elapsed = now.getTime() - lastPlayed.getTime();
  return Math.max(0, cooldownMs - elapsed);
}

export function validateScore(gameType, score) {
  const config = MINIGAMES[gameType];
  if (!config) return false;
  return Number.isFinite(score) && score >= 0 && score <= config.maxScore;
}

export function buildReward(gameType) {
  return MINIGAMES[gameType]?.reward || null;
}

export function updateMinigameState(minigameState, gameType, now = new Date()) {
  return {
    ...(minigameState || {}),
    [gameType]: {
      ...(minigameState?.[gameType] || {}),
      lastPlayedAt: now.toISOString()
    }
  };
}
