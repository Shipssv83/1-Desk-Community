const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { loadOrgContext } = require('../middleware/org');
const { assertWithinLimit } = require('../services/entitlementService');

router.use(verifyToken);
router.use(loadOrgContext);

function toPublic(b) {
  return {
    id: b.id,
    name: b.name,
    webhook_url: b.webhookUrl,
    api_key: b.apiKey,
    config: b.config,
    created_at: b.createdAt
  };
}

// 1. GET /api/bots — admin only (exposes api_key)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const bots = await db.bot.findMany({
      where: { orgId: req.orgId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(bots.map(toPublic));
  } catch (err) {
    console.error('Error fetching bots:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. POST /api/bots
router.post('/', requireAdmin, async (req, res) => {
  const { name, webhook_url, api_key, config } = req.body;

  if (!name || !webhook_url) {
    return res.status(400).json({ error: 'Name and webhook_url are required' });
  }

  try {
    await assertWithinLimit(db, req.org, 'bots');

    const bot = await db.bot.create({
      data: {
        name,
        webhookUrl: webhook_url,
        apiKey: api_key || null,
        config: config || {},
        orgId: req.orgId,
        createdByUserId: req.user.id
      }
    });

    res.status(201).json(toPublic(bot));
  } catch (err) {
    console.error('Error creating bot:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. PUT /api/bots/:id
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, webhook_url, api_key, config } = req.body;

  try {
    const existing = await db.bot.findFirst({ where: { id, orgId: req.orgId } });
    if (!existing) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const updated = await db.bot.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        webhookUrl: webhook_url !== undefined ? webhook_url : undefined,
        apiKey: api_key !== undefined ? api_key : undefined,
        config: config !== undefined ? config : undefined
      }
    });

    res.json(toPublic(updated));
  } catch (err) {
    console.error('Error updating bot:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. DELETE /api/bots/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.bot.findFirst({ where: { id, orgId: req.orgId } });
    if (!existing) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    await db.bot.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting bot:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
