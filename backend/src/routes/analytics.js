import { Router } from 'express';
import validateModule from '../middleware/validate.js';
import schemasModule from '../validation/schemas.js';

const { validate } = validateModule;
const { analyticsEventSchema } = schemasModule;

const router = Router();

const AMPLITUDE_API_URL = 'https://api2.amplitude.com/2/httpapi';

// Supports all client-defined event types (tma_open, score_earned, purchase_failed, etc.)

router.post('/event', validate(analyticsEventSchema), async (req, res) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) {
    return res.status(401).json({ error: 'Сессия устарела. Перезапустите приложение.' });
  }

  const { eventName, properties } = req.body;
  const userId = String(telegramUser.id);
  const apiKey = process.env.AMPLITUDE_API_KEY;

  if (!apiKey) {
    console.warn(`[analytics] AMPLITUDE_API_KEY not configured. Event "${eventName}" dropped for user ${userId}`);
    return res.json({ success: true, forwarded: false, reason: 'AMPLITUDE_API_KEY not configured' });
  }

  try {
    const payload = {
      api_key: apiKey,
      events: [
        {
          user_id: userId,
          event_type: eventName,
          event_properties: properties || {},
          time: Date.now(),
          platform: 'Backend',
        },
      ],
    };

    const response = await fetch(AMPLITUDE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[analytics] Amplitude returned ${response.status}: ${body}`);
      return res.status(502).json({ error: 'Analytics provider error', status: response.status });
    }

    return res.json({ success: true, forwarded: true, event: eventName });
  } catch (err) {
    console.error('[analytics] Failed to forward event to Amplitude:', err);
    return res.status(500).json({ error: 'Failed to forward analytics event' });
  }
});

export default router;
