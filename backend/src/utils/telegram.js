const BOT_TOKEN = process.env.BOT_TOKEN;

/**
 * Post a Markdown message to a Telegram chat.
 *
 * @param {number|string} chatId
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function postToTelegramChat(chatId, text) {
  if (!BOT_TOKEN) {
    console.warn('[telegram] BOT_TOKEN not set, skipping post');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[telegram] API error for chat ${chatId}: ${response.status} ${errBody}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[telegram] Failed to post to chat ${chatId}:`, err.message);
    return false;
  }
}
