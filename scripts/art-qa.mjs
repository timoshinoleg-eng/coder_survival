#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sourceArg = process.argv.find((arg) => arg.startsWith('--source='))?.slice('--source='.length);
if (!sourceArg) {
  console.error('Usage: node scripts/art-qa.mjs --source=/path/to/luna_p1_v01');
  process.exit(2);
}

const source = path.resolve(sourceArg);
const manifestPath = path.join(source, 'asset_manifest_v01.json');
const inventoryPath = path.join(source, 'qa', 'RAW_FILE_INVENTORY_v01.json');
const qaPath = path.join(source, 'qa', 'qa_report_v01.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const qa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
const inventoryByPath = new Map(inventory.files.map((row) => [row.path, row]));
const failures = [];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function pngDimensions(filePath) {
  const b = fs.readFileSync(filePath);
  if (b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`not PNG: ${filePath}`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
function checkFile(rel, expected) {
  const filePath = path.join(source, rel);
  if (!fs.existsSync(filePath)) { failures.push(`${rel}: missing`); return; }
  const actualBytes = fs.statSync(filePath).size;
  const actualSha = sha256(filePath);
  if (expected.bytes !== actualBytes) failures.push(`${rel}: bytes ${actualBytes} != ${expected.bytes}`);
  if (expected.sha256 !== actualSha) failures.push(`${rel}: sha256 ${actualSha} != ${expected.sha256}`);
  if (path.extname(rel).toLowerCase() === '.png') {
    const actualDims = pngDimensions(filePath);
    if (expected.dimensions && actualDims.join('x') !== expected.dimensions.join('x')) failures.push(`${rel}: dimensions ${actualDims} != ${expected.dimensions}`);
  }
}

if (!String(manifest.status).startsWith('CANDIDATE')) failures.push(`manifest status must be CANDIDATE, got ${manifest.status}`);
if (manifest.integration_allowed !== false) failures.push('manifest integration_allowed must remain false');
if (qa.all_automated_checks_pass !== true) failures.push('qa_report all_automated_checks_pass is not true');
if (inventory.file_count !== inventory.files.length) failures.push(`inventory file_count ${inventory.file_count} != rows ${inventory.files.length}`);
for (const row of inventory.files) checkFile(row.path, row);
for (const asset of manifest.assets) {
  const master = asset.master?.path;
  const runtime = asset.runtime?.path;
  if (!master || !runtime) failures.push(`${asset.asset_id}: missing master/runtime path`);
  else {
    const qaRow = qa.checks.find((row) => row.asset_id === asset.asset_id);
    if (!qaRow?.pass) failures.push(`${asset.asset_id}: automated QA row is not pass`);
    if (asset.alpha_status !== 'true_alpha') failures.push(`${asset.asset_id}: alpha_status is not true_alpha`);
  }
}

if (failures.length) {
  console.error(`art-qa failed (${failures.length} issue(s))`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const report = {
  batch: manifest.batch,
  checked_at: new Date().toISOString(),
  source_status: manifest.status,
  integration_allowed: manifest.integration_allowed,
  assets_checked: manifest.assets.length,
  files_checked: inventory.files.length,
  all_hashes_dimensions_qa_pass: true,
  manual_review_required: qa.manual_review_required ?? [],
  note: 'Source package remains CANDIDATE; this command does not grant runtime approval.'
};
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
if (outputArg) fs.writeFileSync(path.resolve(outputArg), `${JSON.stringify(report, null, 2)}\\n`);
console.log(`art-qa passed: ${manifest.assets.length} assets, ${inventory.files.length} files, all hashes/dimensions/QA gates verified`);
console.log('Note: this is an opt-in review command; it is intentionally not wired into CI and does not approve runtime integration.');
