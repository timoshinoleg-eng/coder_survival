import { pool } from '../index.js';
import { expireRandomEvents } from '../utils/randomEventEngine.js';

let cronInterval = null;

export async function cleanupExpiredEvents() {
  const client = await pool.connect();
  try {
    await expireRandomEvents(client);
  } finally {
    client.release();
  }
}

export function startRandomEventCron() {
  if (cronInterval) return;
  // Cleanup expired events every 30 seconds
  cronInterval = setInterval(() => {
    cleanupExpiredEvents().catch(() => null);
  }, 30_000);
}

export function stopRandomEventCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}
