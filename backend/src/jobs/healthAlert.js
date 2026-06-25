import cron from 'node-cron';
import { pool } from '../index.js';
import { sendAlert } from '../utils/alertSender.js';

export function startHealthAlert() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      const latency = Date.now() - start;
      if (latency > 2000) {
        await sendAlert('High DB latency: ' + latency + 'ms');
      }
    } catch (err) {
      await sendAlert('DB health check failed: ' + err.message);
    }
  });
  console.log('[HealthAlert] Started (every 5 min)');
}
