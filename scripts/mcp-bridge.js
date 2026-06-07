#!/usr/bin/env node
/**
 * MCP Bridge - Lightweight file-watcher bridge for agent coordination.
 *
 * Watches TASK_QUEUE.md, COORDINATION.md, and AGENTS.md in the repo root
 * for changes. On any change, logs the event, runs `git pull` to sync,
 * and if TASK_QUEUE.md changed, scans for tasks assigned to this agent.
 *
 * Usage:
 *   node scripts/mcp-bridge.js [--dry-run]
 *
 * Environment:
 *   MCP_AGENT_NAME - Name of this agent (default: USER or "default-agent")
 */
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs/promises');

const execAsync = util.promisify(exec);

const DRY_RUN = process.argv.includes('--dry-run');
const REPO_ROOT = path.resolve(__dirname, '..');
const WATCH_FILES = [
  'TASK_QUEUE.md',
  'COORDINATION.md',
  'AGENTS.md'
].map(f => path.join(REPO_ROOT, f));

const AGENT_NAME = process.env.MCP_AGENT_NAME || process.env.USER || process.env.USERNAME || 'default-agent';

function log(msg) {
  console.log(`[MCP Bridge] ${msg}`);
}

async function runGitPull() {
  if (DRY_RUN) {
    log('[dry-run] Would execute: git pull');
    return;
  }
  try {
    const { stdout, stderr } = await execAsync('git pull', { cwd: REPO_ROOT });
    if (stdout) log(`git pull output:\n${stdout.trim()}`);
    if (stderr) log(`git pull stderr:\n${stderr.trim()}`);
  } catch (err) {
    log(`git pull failed: ${err.message}`);
  }
}

async function checkAssignedTasks(filePath) {
  if (path.basename(filePath) !== 'TASK_QUEUE.md') return;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const matching = lines.filter(line =>
      line.toLowerCase().includes(AGENT_NAME.toLowerCase())
    );

    if (matching.length > 0) {
      log(`Tasks assigned to agent "${AGENT_NAME}":`);
      matching.forEach(line => log(`  → ${line.trim()}`));
    } else {
      log(`No tasks assigned to agent "${AGENT_NAME}" in TASK_QUEUE.md`);
    }
  } catch (err) {
    log(`Failed to read TASK_QUEUE.md: ${err.message}`);
  }
}

async function main() {
  const { default: chokidar } = await import('chokidar');

  log('Starting MCP Bridge...');
  log(`Watching: ${WATCH_FILES.map(f => path.basename(f)).join(', ')}`);
  log(`Agent name: ${AGENT_NAME}`);
  if (DRY_RUN) log('Running in DRY-RUN mode');

  const watcher = chokidar.watch(WATCH_FILES, {
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('change', filePath => {
    const filename = path.basename(filePath);
    const timestamp = new Date().toISOString();
    log(`File changed: ${filename} at ${timestamp}`);

    runGitPull().then(() => checkAssignedTasks(filePath));
  });

  watcher.on('error', err => log(`Watcher error: ${err.message}`));

  function shutdown(signal) {
    log(`Received ${signal}. Shutting down gracefully...`);
    watcher.close().then(() => {
      log('Watcher closed. Exiting.');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  console.error('[MCP Bridge] Fatal error:', err);
  process.exit(1);
});
