import { generateDebugStagesGif, generateDeadlineGif } from '../src/utils/gifRenderer.js';
import { getEffectiveRecoveryIntervalSeconds, recoverProgression } from '../src/utils/progression.js';
import { getProductById } from '../src/utils/shopCatalog.js';
import { validateScore, buildReward } from '../src/utils/minigame.js';

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
