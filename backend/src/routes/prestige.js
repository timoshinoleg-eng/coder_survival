import express from 'express';
import { PRESTIGE } from '../config/balance.js';
import { applyPrestigeBonuses, computePrestige } from '../utils/prestige.js';

const router = express.Router();

router.get('/preview', async (req, res, next) => {
  try {
    const commitsTotal = Number(req.player?.commits_total ?? 0);
    const currentPrestigeLevel = Number(req.player?.prestige_level ?? 0);
    const nextPrestigeLevel = currentPrestigeLevel + 1;
    const effectivePreviewLevel = Math.min(PRESTIGE.MAX_PRESTIGE_LEVEL, nextPrestigeLevel);
    const prestigeCurrency = computePrestige(commitsTotal);

    res.json({
      eligible: Number(req.player?.xp_total ?? 0) >= PRESTIGE.THRESHOLD_XP,
      currentPrestigeLevel,
      nextPrestigeLevel,
      prestigeCurrency,
      willReset: ['xp_total', 'tier', 'commits_current', 'energy', 'generator_state', 'active_effects', 'event_state'],
      willKeep: ['commits_total', 'skins', 'streak', 'battle_pass', 'squads'],
      bonuses: {
        tapMultiplier: 1 + PRESTIGE.BONUSES.TAP_MULT_PER_LEVEL * effectivePreviewLevel,
        energyRecoveryMultiplier: 1 + PRESTIGE.BONUSES.ENERGY_RECOVERY_MULT_PER_LEVEL * effectivePreviewLevel,
        critChanceAdd: PRESTIGE.BONUSES.CRIT_CHANCE_ADD_PER_LEVEL * effectivePreviewLevel,
        maxEnergyAdd: PRESTIGE.BONUSES.MAX_ENERGY_ADD_PER_LEVEL * effectivePreviewLevel,
        depressionResistanceMultiplier: Math.max(
          0,
          1 - PRESTIGE.BONUSES.DEPRESSION_RESISTANCE_PER_LEVEL * effectivePreviewLevel
        ),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/execute', async (req, res, next) => {
  try {
    const commitsTotal = Number(req.player?.commits_total ?? 0);
    const currentPrestigeLevel = Number(req.player?.prestige_level ?? 0);
    const newPrestigeLevel = currentPrestigeLevel + 1;
    const effLvl = Math.min(PRESTIGE.MAX_PRESTIGE_LEVEL, newPrestigeLevel);
    const prestigeCurrency = computePrestige(commitsTotal);

    const bonuses = applyPrestigeBonuses(
      {
        commitsPerTap: 1,
        maxEnergy: 100,
        critChanceAdd: 0,
        energyRecoveryMult: 1,
        depressionResistanceMult: 1,
      },
      effLvl,
      {}
    );

    res.json({
      ok: true,
      prestigeLevel: newPrestigeLevel,
      effectivePrestigeLevel: effLvl,
      prestigeCurrency,
      bonuses: {
        commitsPerTap: bonuses.commitsPerTap,
        maxEnergy: bonuses.maxEnergy,
        critChanceAdd: bonuses.critChanceAdd,
        energyRecoveryMult: bonuses.energyRecoveryMult,
        depressionResistanceMult: bonuses.depressionResistanceMult,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/shop', async (req, res) => {
  res.json({ items: PRESTIGE.SHOP ?? [] });
});

router.post('/shop/buy', async (req, res) => {
  res.json({ ok: true });
});

export default router;
