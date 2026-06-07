import { useMemo } from 'preact/hooks';
import { useGameState } from './useGameState.js';

export const RANK_ORDER = ['Junior', 'Middle', 'Senior', 'Lead', 'CTO'];

export const RANK_META = {
  Junior: { emoji: '🌱', commitsPerTap: 1, maxEnergy: 100, threshold: 0 },
  Middle: { emoji: '💻', commitsPerTap: 2, maxEnergy: 120, threshold: 400 },
  Senior: { emoji: '🦉', commitsPerTap: 3, maxEnergy: 150, threshold: 900 },
  Lead:   { emoji: '👑', commitsPerTap: 5, maxEnergy: 180, threshold: 1500 },
  CTO:    { emoji: '🚀', commitsPerTap: 8, maxEnergy: 220, threshold: 2200 },
};

/**
 * Returns enriched player rank data.
 * NOTE: /api/player/rank does not exist yet; data is derived from useGameState.
 * When the endpoint is added, swap the useGameState destructure for a fetch.
 */
export function usePlayerRank() {
  const {
    rankName,
    levelInRank,
    xpTotal,
    xpProgress,
    xpRequiredForNext,
  } = useGameState();

  const currentRank = rankName || 'Junior';
  const currentLevel = levelInRank || 1;

  const progressPercent = useMemo(() => {
    if (!xpRequiredForNext || xpRequiredForNext <= 0) return 100;
    return Math.min(100, Math.round((xpProgress / xpRequiredForNext) * 100));
  }, [xpProgress, xpRequiredForNext]);

  const rankMeta = RANK_META[currentRank] || RANK_META.Junior;
  const currentRankIndex = RANK_ORDER.indexOf(currentRank);
  const nextRankName = RANK_ORDER[currentRankIndex + 1] || null;

  const ranks = useMemo(
    () =>
      RANK_ORDER.map((name) => ({
        name,
        ...RANK_META[name],
      })),
    []
  );

  return {
    rank: currentRank,
    level: currentLevel,
    xpTotal,
    xpProgress,
    xpRequiredForNext,
    progressPercent,
    rankMeta,
    nextRankName,
    currentRankIndex,
    ranks,
  };
}
