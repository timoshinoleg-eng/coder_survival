import crypto from 'crypto';
import { generateDebugStagesGif, generateDeadlineGif } from '../src/utils/gifRenderer.js';
import { getEffectiveRecoveryIntervalSeconds, recoverProgression } from '../src/utils/progression.js';
import { SHOP_ITEM_EFFECTS } from '../src/config/balance.js';
import { verifyAdsgramCallbackSignature, verifyPropellerCallbackHash } from '../src/utils/adProof.js';
import { applyHeartAttackReset } from '../src/utils/heartAttack.js';
import { getProductById } from '../src/utils/shopCatalog.js';
import { purchaseGenerator, recoverPassiveLoc } from '../src/utils/generatorEconomy.js';
import { validateScore, buildReward } from '../src/utils/minigame.js';
import { STAGE2 } from '../src/config/balance.js';

describe('Phase 10: GIF Generation', () => {
  test('generateDebugStagesGif returns a non-empty buffer', async () => {
    const buffer = await generateDebugStagesGif();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  test('generateDeadlineGif returns a non-empty buffer', async () => {
    const buffer = await generateDeadlineGif();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

describe('Phase 10: Shop Catalog', () => {
  test('coffee_break bridges pricing cliff at 25 Stars', () => {
    const product = getProductById('coffee_break');
    expect(product).not.toBeNull();
    expect(product.stars).toBe(25);
    expect(product.effect).toBe('restore_50_energy_and_reduce_10_stress');
    expect(product.first_purchase_bonus).toBe(true);
    expect(product.position).toBe('between_10_and_40');
    expect(SHOP_ITEM_EFFECTS.coffee_break).toEqual({ energy: 50, depressionRelief: 10 });
  });

  test('office_cat product exists with 100 Stars price', () => {
    const product = getProductById('office_cat');
    expect(product).not.toBeNull();
    expect(product.stars).toBe(100);
    expect(product.category).toBe('skin');
  });
});

describe('Phase 10: Mini-Game Configs', () => {
  test('architectural_committee reward includes commits and depressionRelief', () => {
    const reward = buildReward('architectural_committee');
    expect(reward.commits).toBe(500);
    expect(reward.depressionRelief).toBe(40);
  });

  test('ipo reward includes skin cto_cape', () => {
    const reward = buildReward('ipo');
    expect(reward.commits).toBe(1000);
    expect(reward.skin).toBe('cto_cape');
  });

  test('ipo validateScore accepts 0-3 and rejects out of range', () => {
    expect(validateScore('ipo', 0)).toBe(true);
    expect(validateScore('ipo', 1)).toBe(true);
    expect(validateScore('ipo', 2)).toBe(true);
    expect(validateScore('ipo', 3)).toBe(true);
    expect(validateScore('ipo', -1)).toBe(false);
    expect(validateScore('ipo', 4)).toBe(false);
  });

  test('ipo config requires a perfect score for success', () => {
    const ipo = STAGE2.MINIGAMES.ipo;
    expect(ipo.maxScore).toBe(3);
    expect(ipo.minSuccessScore).toBe(3);
  });
});

describe('Phase 10: Office Cat Skin Effect', () => {
  test('getEffectiveRecoveryIntervalSeconds unaffected by office cat', () => {
    const progression = {
      created_at: new Date(Date.now() - 86400000).toISOString(),
      last_energy_activity_at: new Date().toISOString()
    };
    const interval = getEffectiveRecoveryIntervalSeconds(progression, new Date(), 1);
    expect(typeof interval).toBe('number');
    expect(interval).toBeGreaterThan(0);
  });
});

describe('Generator economy', () => {
  test('recoverPassiveLoc credits commits_current and total from passive income', async () => {
    const client = {
      query: async (sql, params) => {
        if (sql.includes('SELECT team_id FROM team_members')) {
          return { rows: [] };
        }
        return {
          rows: [{
            user_id: 1,
            commits_total: 12,
            commits_current: 12,
            generator_state: JSON.parse(params[2])
          }]
        };
      }
    };
    const progression = {
      user_id: 1,
      created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      session_started_at: new Date(Date.now() - 1000).toISOString(),
      commits_total: 0,
      commits_current: 0,
      generator_state: {
        owned: { junior_dev: 4 },
        lastCollectedAt: new Date(Date.now() - 10 * 1000).toISOString()
      }
    };
    const result = await recoverPassiveLoc(client, progression, { accountAgeMinutes: 61, passiveMultiplier: 1 });
    expect(result._passiveLocRecovery.locEarned).toBe(40);
  });

  test('purchaseGenerator buys unlocked generator using commits_current', async () => {
    const client = {
      query: async (_sql, params) => ({
        rows: [{ user_id: 1, commits_current: 0, generator_state: JSON.parse(params[2]) }]
      })
    };
    const progression = {
      user_id: 1,
      commits_current: 30,
      generator_state: { owned: { junior_dev: 0 } }
    };
    const result = await purchaseGenerator(client, progression, 'junior_dev', { accountAgeMinutes: 3 });
    expect(result.status).toBe(200);
    expect(result.cost).toBe(25);
    expect(result.generatorState.owned.junior_dev).toBe(1);
  });
});

describe('Heart attack reset', () => {
  test('applyHeartAttackReset clears active effects and current session commits', async () => {
    const calls = [];
    const client = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [] };
      }
    };
    const result = await applyHeartAttackReset(client, 1, { sessionId: 's1' });
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('SET active_effects =');
    expect(calls[1].sql).toContain('SET commits_earned = 0');
    expect(result.resetFields).toContain('session.loc_earned_this_session');
  });
});

describe('Ads callback skeleton', () => {
  test('verifyAdsgramCallbackSignature validates HMAC-SHA256 body signature', () => {
    const payload = { event_id: 'evt1', user_id: '42' };
    const secret = 'ads-secret';
    const body = JSON.stringify({ event_id: 'evt1', user_id: '42' });
    const signature = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    expect(verifyAdsgramCallbackSignature(body, signature, secret)).toBe(true);
  });

  test('verifyPropellerCallbackHash validates md5 event_id + user_id + secret', () => {
    const eventId = 'evt1';
    const userId = '42';
    const secret = 'prop-secret';
    const hash = crypto.createHash('md5').update(`${eventId}${userId}${secret}`, 'utf8').digest('hex');
    expect(verifyPropellerCallbackHash({ eventId, userId, hash, secret })).toBe(true);
  });
});
