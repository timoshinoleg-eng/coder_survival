import { readFileSync } from 'fs';

const expectedAssetIds = [
  'hero_coder_coffee',
  'hero_coder_incident',
  'hero_coder_recovery',
  'ui_icon_check',
  'ui_icon_ci_pipeline',
  'ui_icon_coffee_coin',
  'ui_icon_commit',
  'ui_icon_deploy',
  'ui_icon_energy',
  'ui_icon_incident_alert',
  'ui_icon_prod_500',
  'ui_icon_rollback',
  'ui_icon_slack_storm',
  'ui_icon_stress',
  'ui_icon_timer',
].sort();

describe('Luna P1 runtime identity governance', () => {
  test('binds every approved runtime Asset ID to immutable path, bytes and SHA-256', () => {
    const file = new URL('../../visual_assets/first_pack/LUNA_P1_V01_RUNTIME_IDENTITY.json', import.meta.url);
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const assets = manifest.runtimeAssets;

    expect(manifest.schemaVersion).toBe(1);
    expect(assets.map((asset) => asset.assetId).sort()).toEqual(expectedAssetIds);
    for (const asset of assets) {
      expect(asset.path).toMatch(/_runtime_(128|48)_v01\.png$/);
      expect(asset.bytes).toBeGreaterThan(0);
      expect(asset.dimensions).toEqual(asset.assetId.startsWith('hero_') ? [128, 128] : [48, 48]);
      expect(asset.mode).toBe('RGBA');
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
