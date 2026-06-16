const express = require('express');
const router = express.Router();
const conversationService = require('../services/conversationService');
const { verifyTelegram } = require('../middleware/webhookAuth');

// Telegram Webhook. Telegram echoes the secret token set via setWebhook in
// X-Telegram-Bot-Api-Secret-Token; verifyTelegram() checks it (see webhookAuth).
router.post('/telegram/:inbox_id', verifyTelegram(), async (req, res) => {
  const { inbox_id } = req.params;
  const update = req.body;

  try {
    // Regular chats/groups send "message"; channels send "channel_post".
    const message = update.message || update.channel_post;
    if (message) {
      const chat = message.chat;
      const contactName = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || `TG User ${chat.id}`;
      const text = message.text || '';

      if (text) {
        await conversationService.ingestMessage({
          inboxId: inbox_id,
          externalContactId: String(chat.id),
          contactName,
          channelType: 'telegram',
          content: text
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error handling Telegram webhook:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
