import { z } from 'zod';

export const tapSchema = z.object({
  tapCount: z.number().int().min(1).max(20).default(1),
  session_id: z.string().max(64).optional(),
});

export const buySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(100).default(1),
});

export const stateSchema = z.object({
  timezoneOffset: z.number().int().min(-720).max(720).optional(),
});

export const teamSchema = z.object({
  name: z.string().min(1).max(50),
  inviteCode: z.string().max(20).optional(),
});

export const referralClaimSchema = z.object({
  milestone: z.number().int().positive(),
});

export const minigameSchema = z.object({
  gameType: z.string().min(1),
  score: z.number().int().min(0),
});

export const skinEquipSchema = z.object({
  skinId: z.string().min(1).trim(),
});

export const achievementReadSchema = z.object({
  slugs: z.array(z.string()).nonempty(),
});

export const questClaimSchema = z.object({
  questId: z.string().min(1),
  tier: z.enum(['free', 'premium']).optional(),
});

export const passClaimSchema = z.object({
  level: z.number().int().min(1).max(20),
  track: z.enum(['free', 'premium']),
});

export const analyticsEventSchema = z.object({
  eventName: z.string().min(1),
  properties: z.record(z.any()).default({}),
});

export const purchaseDealSchema = z.object({
  dealType: z.enum(['daily_deal', 'flash_sale']),
});

export const languageEquipSchema = z.object({
  languageSlug: z.string().min(1).trim(),
});
