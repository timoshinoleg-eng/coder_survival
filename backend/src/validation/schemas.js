const { z } = require('zod');

const tapSchema = z.object({
  tapCount: z.number().int().min(1).max(20),
  session_id: z.string().max(64).optional(),
});

const buySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(100).default(1),
});

const stateSchema = z.object({
  timezoneOffset: z.number().int().min(-720).max(720).optional(),
});

const teamSchema = z.object({
  name: z.string().min(1).max(50),
  inviteCode: z.string().max(20).optional(),
});

const referralClaimSchema = z.object({
  milestone: z.number().int().positive(),
});

const minigameSchema = z.object({
  gameType: z.string().min(1),
  score: z.number().int().min(0),
});

const skinEquipSchema = z.object({
  skinId: z.string().min(1).trim(),
});

const achievementReadSchema = z.object({
  slugs: z.array(z.string()).nonempty(),
});

const questClaimSchema = z.object({
  questId: z.string().min(1),
  tier: z.enum(['free', 'premium']).optional(),
});

const passClaimSchema = z.object({
  level: z.number().int().min(1).max(20),
  track: z.enum(['free', 'premium']),
});

module.exports = {
  tapSchema,
  buySchema,
  stateSchema,
  teamSchema,
  referralClaimSchema,
  minigameSchema,
  skinEquipSchema,
  achievementReadSchema,
  questClaimSchema,
  passClaimSchema,
};
