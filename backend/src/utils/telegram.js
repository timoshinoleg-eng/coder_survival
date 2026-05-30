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

/**
 * Send an animation (GIF) to a Telegram chat.
 *
 * @param {number|string} chatId
 * @param {Buffer} buffer — GIF buffer
 * @param {string} caption
 * @returns {Promise<boolean>}
 */
export async function sendAnimationToChat(chatId, buffer, caption = '') {
  if (!BOT_TOKEN) {
    console.warn('[telegram] BOT_TOKEN not set, skipping animation');
    return false;
  }

  try {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('animation', new Blob([buffer], { type: 'image/gif' }), 'animation.gif');
    if (caption) formData.append('caption', caption);

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendAnimation`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[telegram] sendAnimation error for chat ${chatId}: ${response.status} ${errBody}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[telegram] Failed to send animation to chat ${chatId}:`, err.message);
    return false;
  }
}

/**
 * Send a poll to a Telegram chat.
 *
 * @param {number|string} chatId
 * @param {string} question
 * @param {string[]} options
 * @returns {Promise<boolean>}
 */
export async function sendPollToChat(chatId, question, options) {
  if (!BOT_TOKEN) {
    console.warn('[telegram] BOT_TOKEN not set, skipping poll');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPoll`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        question,
        options: options.map(o => ({ text: o })),
        is_anonymous: true
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[telegram] sendPoll error for chat ${chatId}: ${response.status} ${errBody}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[telegram] Failed to send poll to chat ${chatId}:`, err.message);
    return false;
  }
}
