const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

export async function sendAlert(message) {
  if (!BOT_TOKEN || !ALERT_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ALERT_CHAT_ID,
        text: `[Coder Survival]\n${message}\n${new Date().toISOString()}`
      })
    });
  } catch (err) {
    console.error('Alert delivery failed:', err.message);
  }
}
