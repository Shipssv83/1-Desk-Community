const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { loadOrgContext } = require('../middleware/org');
const { assertWithinLimit } = require('../services/entitlementService');
const telegramService = require('../services/channels/telegramService');

router.use(verifyToken);
router.use(loadOrgContext);

// For Telegram inboxes with a bot_token, (re)registers the Telegram webhook
// pointing at this inbox. Generates and persists a telegram_secret_token if
// missing, so incoming updates can be verified (see middleware/webhookAuth.js).
// Failures are logged but don't block saving the inbox.
async function syncTelegramWebhook(inbox) {
  if (inbox.channelType !== 'telegram') return inbox;

  const cfg = inbox.channelConfig || {};
  if (!cfg.bot_token) return inbox;

  let secretToken = cfg.telegram_secret_token;
  if (!secretToken) {
    secretToken = crypto.randomBytes(32).toString('hex');
    inbox = await db.inbox.update({
      where: { id: inbox.id },
      data: { channelConfig: { ...cfg, telegram_secret_token: secretToken } }
    });
  }

  try {
    const result = await telegramService.setWebhook(cfg.bot_token, inbox.id, secretToken);
    if (!result?.ok) {
      console.error(`[telegram] webhook registration failed for inbox ${inbox.id}:`, result);
    }
  } catch (err) {
    console.error(`[telegram] webhook registration error for inbox ${inbox.id}:`, err);
  }

  return inbox;
}

// 1. GET /api/inboxes
router.get('/', async (req, res) => {
  try {
    const inboxes = await db.inbox.findMany({
      where: { orgId: req.orgId },
      include: {
        bot: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // channel_config holds secrets (bot tokens, app secrets, API keys). Only
    // admins manage integrations, so operators get inbox metadata without it.
    const isAdmin = req.user.role === 'admin';
    const mapped = inboxes.map(i => ({
      id: i.id,
      name: i.name,
      channel_type: i.channelType,
      channel_config: isAdmin ? i.channelConfig : undefined,
      bot_id: i.botId,
      bot_name: i.bot?.name,
      is_active: i.isActive,
      created_at: i.createdAt
    }));

    res.json(mapped);
  } catch (err) {
    console.error('Error fetching inboxes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. POST /api/inboxes
router.post('/', requireAdmin, async (req, res) => {
  const { name, channel_type, channel_config, bot_id } = req.body;

  if (!name || !channel_type) {
    return res.status(400).json({ error: 'Name and channel_type are required' });
  }

  try {
    await assertWithinLimit(db, req.org, 'inboxes');

    let inbox = await db.inbox.create({
      data: {
        name,
        channelType: channel_type,
        channelConfig: channel_config || {},
        botId: (bot_id && bot_id !== 'none') ? bot_id : null,
        orgId: req.orgId,
        createdByUserId: req.user.id
      }
    });

    inbox = await syncTelegramWebhook(inbox);

    res.status(201).json({
      id: inbox.id,
      name: inbox.name,
      channel_type: inbox.channelType,
      channel_config: inbox.channelConfig,
      bot_id: inbox.botId,
      is_active: inbox.isActive,
      created_at: inbox.createdAt
    });
  } catch (err) {
    if (err.code === 'PLAN_LIMIT_REACHED') {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    console.error('Error creating inbox:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. PUT /api/inboxes/:id
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, channel_config, bot_id, is_active } = req.body;

  try {
    const existing = await db.inbox.findFirst({ where: { id, orgId: req.orgId } });
    if (!existing) {
      return res.status(404).json({ error: 'Inbox not found' });
    }

    // Merge into the existing channelConfig instead of replacing it wholesale.
    // The frontend form doesn't round-trip server-managed keys like
    // telegram_secret_token, so a full replace would drop the secret and force
    // syncTelegramWebhook to regenerate it on every save.
    const mergedConfig = channel_config !== undefined
      ? { ...(existing.channelConfig || {}), ...channel_config }
      : undefined;

    let updated = await db.inbox.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        channelConfig: mergedConfig,
        botId: bot_id !== undefined ? (bot_id === null || bot_id === 'none' ? null : bot_id) : undefined,
        isActive: is_active !== undefined ? is_active : undefined
      }
    });

    if (channel_config !== undefined) {
      updated = await syncTelegramWebhook(updated);
    }

    res.json({
      id: updated.id,
      name: updated.name,
      channel_type: updated.channelType,
      channel_config: updated.channelConfig,
      bot_id: updated.botId,
      is_active: updated.isActive,
      created_at: updated.createdAt
    });
  } catch (err) {
    console.error('Error updating inbox:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. DELETE /api/inboxes/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.inbox.findFirst({ where: { id, orgId: req.orgId } });
    if (!existing) {
      return res.status(404).json({ error: 'Inbox not found' });
    }

    await db.inbox.delete({
      where: { id }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting inbox:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
