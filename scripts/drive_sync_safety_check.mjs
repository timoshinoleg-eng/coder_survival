#!/usr/bin/env node
/**
 * Fail-closed preflight for files intended for Google Workspace sync.
 * It blocks secret/infrastructure material before an upload command is run.
 */
import fs from 'node:fs';
import path from 'node:path';

const inputPaths = process.argv.slice(2);
if (inputPaths.length === 0) {
  console.error('Usage: node scripts/drive_sync_safety_check.mjs <file> [...file]');
  process.exit(2);
}

const blockedPathParts = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:id_rsa|id_ed25519|known_hosts|authorized_keys)(?:\.|$)/i,
  /\.(?:pem|key|p12|pfx|crt)$/i,
  /(?:credential|secret|token|private[_-]?key|ssh[_-]?key)/i,
];

const contentRules = [
  { name: 'IPv4 address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { name: 'IPv6 address', pattern: /(?:^|[^\w:])(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]+/i },
  { name: 'SSH endpoint or key material', pattern: /(?:ssh:\/\/|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|\bssh\s+[-\w@.]+@)/i },
  {
    name: 'cloud console/resource identifier',
    pattern: /(?:projects\/[a-z0-9._-]{6,}|subscriptions\/[0-9a-f-]{8,}|resourceGroups\/[a-z0-9._-]{3,}|instances\/[a-z0-9._-]{3,}|(?:cloud|instance|folder)[_-]?id\s*[:=]\s*(?!CLOUD_INSTANCE_ID\b|CLOUD_FOLDER_ID\b|CLOUD_RESOURCE_ID\b)[a-z0-9_-]{6,})/i,
  },
  { name: 'infrastructure endpoint assignment', pattern: /(?:db|database|vm|host|endpoint|server)\s*(?:url|host|ip|id|name)?\s*[:=]\s*(?:https?:\/\/|[\w.-]+\.[a-z]{2,})/i },
];

const findings = [];
for (const rawPath of inputPaths) {
  const filePath = path.resolve(rawPath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    findings.push(`${rawPath}: not a readable file`);
    continue;
  }
  const normalized = filePath.replace(/\\/g, '/');
  if (blockedPathParts.some((rule) => rule.test(normalized))) {
    findings.push(`${rawPath}: blocked filename or path`);
    continue;
  }
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) continue;
  const text = buffer.toString('utf8');
  for (const rule of contentRules) {
    if (rule.pattern.test(text)) findings.push(`${rawPath}: contains ${rule.name}`);
  }
}

if (findings.length > 0) {
  console.error('Google Workspace sync blocked. Remove or redact sensitive infrastructure material:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Drive safety preflight passed for ${inputPaths.length} file(s).`);
