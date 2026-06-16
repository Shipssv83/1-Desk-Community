const crypto = require('crypto');
const db = require('../config/db');

function safeCompare(received, expected) {
  const bufA = Buffer.from(String(received || ''));
  const bufB = Buffer.from(String(expected || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function loadInbox(req, res) {
  let inbox;
  try {
    inbox = await db.inbox.findUnique({
      where: { id: req.params.inbox_id }
    });
  } catch (err) {
    // Malformed inbox_id (not a UUID) throws Prisma P2023 — treat as not found
    // instead of letting it bubble up as an unhandled rejection and crash the process.
    inbox = null;
  }
  if (!inbox) {
    res.status(404).json({ error: 'Inbox not found' });
    return null;
  }
  req.inbox = inbox;
  return inbox;
}

// Telegram: requires Bot API setWebhook to be called with the same secret_token,
// which Telegram then echoes back in X-Telegram-Bot-Api-Secret-Token on every update.
function verifyTelegram() {
  return async (req, res, next) => {
    const inbox = await loadInbox(req, res);
    if (!inbox) return;

    const expected = inbox.channelConfig?.telegram_secret_token;
    if (!expected) {
      console.warn(`[webhook] inbox ${inbox.id}: telegram_secret_token not configured, skipping signature check`);
      return next();
    }

    const received = req.headers['x-telegram-bot-api-secret-token'];
    if (!safeCompare(received, expected)) {
      return res.status(401).json({ error: 'Invalid secret token' });
    }
    next();
  };
}

module.exports = {
  verifyTelegram,
  loadInbox,
  safeCompare
};
