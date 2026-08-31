import { inspectProductionConfig } from '../backend/src/config/productionPreflight.js';

const findings = inspectProductionConfig(process.env);

if (findings.errors.length === 0) {
  console.log('CONFIG PREFLIGHT PASSED');
} else {
  console.error('CONFIG PREFLIGHT FAILED');
}

for (const code of findings.errors) {
  console.error(`ERROR: ${code}`);
}
for (const code of findings.warnings) {
  console.warn(`WARNING: ${code}`);
}

console.log(`SUMMARY: ${findings.errors.length} errors, ${findings.warnings.length} warnings`);
if (findings.errors.length > 0) process.exitCode = 1;
