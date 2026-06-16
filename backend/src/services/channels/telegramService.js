async function sendMessage(botToken, chatId, text) {
  if (!botToken) {
    console.warn('Telegram botToken is missing. Cannot send message.');
    return;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: parseInt(chatId, 10),
        text
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Telegram send failed: ${res.status} - ${errText}`);
    }
    return res.json();
  } catch (err) {
    console.error('Error sending Telegram message:', err);
    throw err;
  }
}

// Shows the "typing…" indicator in the chat. Telegram clears it after ~5s or
// when the next message arrives, so callers repeat it on an interval while a
// reply is being generated.
async function sendChatAction(botToken, chatId, action = 'typing') {
  if (!botToken) return;
  const url = `https://api.telegram.org/bot${botToken}/sendChatAction`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: parseInt(chatId, 10), action })
    });
  } catch (err) {
    // Non-fatal: typing indicator is cosmetic.
    console.warn('Telegram sendChatAction failed:', err.message);
  }
}

async function setWebhook(botToken, inboxId, secretToken) {
  if (!botToken) return;
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
  try {
    const body = {
      url: `${baseUrl}/api/webhooks/telegram/${inboxId}`
    };
    if (secretToken) body.secret_token = secretToken;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  } catch (err) {
    console.error('Error setting Telegram webhook:', err);
    throw err;
  }
}

async function getMe(botToken) {
  if (!botToken) return null;
  const url = `https://api.telegram.org/bot${botToken}/getMe`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.result : null;
  } catch (err) {
    console.error('Error getting Telegram bot details:', err);
    return null;
  }
}

module.exports = {
  sendMessage,
  sendChatAction,
  setWebhook,
  getMe
};
