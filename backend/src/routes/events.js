import { Router } from 'express';
import { pool } from '../index.js';
import {
  generateEventBonusQuest,
  getCurrentEvent,
  getLiveOpsWeekIndex,
  getLocalDateFromOffset,
  isEventActiveToday
} from '../utils/events.js';
import { STAGE4 } from '../config/balance.js';

const router = Router();

async function getUserId(client, telegramUser) {
  const result = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramUser.id]);
  return result.rows[0]?.id || null;
}

function getEventWindow(localNow) {
  const startedAt = new Date(localNow);
  startedAt.setHours(0, 0, 0, 0);
  startedAt.setDate(startedAt.getDate() - ((startedAt.getDay() + 6) % 7));
  const expiresAt = new Date(startedAt);
  expiresAt.setDate(startedAt.getDate() + STAGE4.EVENTS.EVENT_DURATION_DAYS);
  return { startedAt, expiresAt };
}

router.get('/', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const client = await pool.connect();
    try {
      const userId = await getUserId(client, telegramUser);
      if (!userId) return res.status(404).json({ error: 'User not found' });

      const progressResult = await client.query(
        `SELECT event_state, career_story, daily_quests_state, timezone_offset
         FROM progression
         WHERE user_id = $1`,
        [userId]
      );
      const row = progressResult.rows[0] || {};
      const timezoneOffset = Number(row.timezone_offset ?? req.query.timezoneOffset ?? 0);
      const localNow = getLocalDateFromOffset(timezoneOffset);
      const event = getCurrentEvent(getLiveOpsWeekIndex(localNow));
      const active = isEventActiveToday(event, localNow);
      const window = getEventWindow(localNow);
      const eventState = active && event
        ? {
            ...(row.event_state || {}),
            eventId: event.id,
            startedAt: window.startedAt.toISOString(),
            expiresAt: window.expiresAt.toISOString(),
            modifiersApplied: event.modifiers || {}
          }
        : (row.event_state || {});

      let dailyState = row.daily_quests_state || {};
      let quests = Array.isArray(dailyState.quests) ? dailyState.quests : [];
      const hasEventQuest = quests.some((quest) => quest.isEvent === true || quest.id === 'q_event_bonus');
      const bonusQuest = active && event ? generateEventBonusQuest(event) : null;

      if (active && bonusQuest && !hasEventQuest) {
        quests = [...quests, bonusQuest].slice(0, 6);
        dailyState = { ...dailyState, quests };
      }

      await client.query(
        `UPDATE progression
         SET event_state = $2,
             daily_quests_state = $3
         WHERE user_id = $1`,
        [userId, JSON.stringify(eventState), JSON.stringify(dailyState)]
      );

      return res.json({
        success: true,
        active,
        event: active && event
          ? {
              id: event.id,
              name: event.name,
              modifiers: event.modifiers || {},
              bonusQuest,
              startedAt: window.startedAt.toISOString(),
              expiresAt: window.expiresAt.toISOString()
            }
          : null,
        bonusQuestAvailable: Boolean(active && bonusQuest),
        careerStory: row.career_story || {}
      });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/career/dismiss', async (req, res, next) => {
  const telegramUser = req.telegramUser?.user;
  if (!telegramUser) return res.status(401).json({ error: 'Unauthorized' });
  const beatId = Number(req.body?.beatId);
  if (!Number.isInteger(beatId)) return res.status(400).json({ error: 'Invalid beatId' });

  try {
    const client = await pool.connect();
    try {
      const userId = await getUserId(client, telegramUser);
      if (!userId) return res.status(404).json({ error: 'User not found' });

      const result = await client.query(
        `SELECT career_story FROM progression WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      const story = result.rows[0]?.career_story || {};
      const dismissed = new Set((story.dismissedBeats || []).map(Number));
      dismissed.add(beatId);
      const nextStory = {
        ...story,
        dismissedBeats: Array.from(dismissed).sort((a, b) => a - b)
      };
      await client.query(
        `UPDATE progression SET career_story = $2 WHERE user_id = $1`,
        [userId, JSON.stringify(nextStory)]
      );
      return res.json({ success: true, careerStory: nextStory });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
