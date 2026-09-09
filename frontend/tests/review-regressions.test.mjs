import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AudioManager from '../src/utils/AudioManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('AudioManager mute state is shared across mounted controls', () => {
  const manager = new AudioManager();
  const observed = [];
  const unsubscribe = manager.subscribeMute((muted) => observed.push(muted));
  manager.setMute(true);
  manager.setMute(false);
  unsubscribe();
  assert.deepEqual(observed.slice(-2), [true, false]);
  manager.dispose();
});

test('audio lifecycle refuses background resume while document remains hidden', () => {
  const source = readSource('../src/utils/AudioManager.js');
  assert.match(source, /resumeFromBackground\(\)[\s\S]*document\.hidden\) return;/);
  const settingsSource = readSource('../src/components/AudioSettings.jsx');
  assert.match(settingsSource, /audioManager\.subscribeMute\(setMuted\)/);
});

test('rewarded ad provider proof survives until the claim request', () => {
  const source = readSource('../src/utils/AdsManager.js');
  assert.match(source, /sessionProofs = new Map\(\)/);
  assert.match(source, /rememberProof\(nonce, result \|\| \{ done: true \}\)/);
  assert.match(source, /proof: resolvedProof/);
  assert.match(source, /sessionProofs\.delete\(session\.nonce\)/);
});

test('achievement badge and toast queue use one shared channel', () => {
  const source = readSource('../src/hooks/useAchievements.js');
  assert.match(source, /const sharedAchievementState =/);
  assert.match(source, /sharedAchievementState\.toastQueue/);
  assert.match(source, /sharedAchievementState\.myAchievements/);
  assert.match(source, /if \(initData\) fetchMyAchievements\(\)/);
});
