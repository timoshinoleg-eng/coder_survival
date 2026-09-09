import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const audioDir = path.resolve(testsDir, '../public/audio');
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

test('shipped audio assets are Ogg and stay within the audited 2 MB budget', async () => {
  const files = await listFiles(audioDir);
  const audioFiles = files.filter((file) => /\.(ogg|mp3|wav|m4a|aac|flac)$/i.test(file));
  assert.ok(audioFiles.length > 0, 'expected at least one shipped audio asset');

  const nonOgg = audioFiles.filter((file) => path.extname(file).toLowerCase() !== '.ogg');
  assert.deepEqual(nonOgg, [], `non-Ogg audio found: ${nonOgg.join(', ')}`);

  let totalBytes = 0;
  for (const file of audioFiles) {
    totalBytes += (await stat(file)).size;
  }
  assert.ok(
    totalBytes <= MAX_TOTAL_BYTES,
    `audio bundle is ${(totalBytes / 1024 / 1024).toFixed(2)} MB; limit is 2.00 MB`
  );
});
