import express from 'express';
import { calculateDepressionDelta } from '../utils/tap.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const levelBefore = req.levelBefore;
    const prestigeRecoveryMult = levelBefore?.resolved?.energyRecoveryMult || 1;

    const baseDepressionDelta = Number(req.body?.baseDepressionDelta ?? 0);
    const depressionMultiplier = Number(req.body?.depressionMultiplier ?? 1);
    const depressionDelta = calculateDepressionDelta(baseDepressionDelta, depressionMultiplier);

    res.json({
      ok: true,
      prestigeRecoveryMult,
      depressionDelta,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
