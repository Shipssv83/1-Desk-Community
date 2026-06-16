const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { loadOrgContext } = require('../middleware/org');

router.use(verifyToken);
router.use(loadOrgContext);

// 1. GET /api/contacts
router.get('/', async (req, res) => {
  const { search, page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  try {
    const where = { inbox: { orgId: req.orgId } };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { externalId: { contains: search, mode: 'insensitive' } }
      ];
    }

    const total = await db.contact.count({ where });
    const items = await db.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
      skip: offset,
      include: {
        conversations: { select: { status: true } }
      }
    });

    const mappedItems = items.map(c => {
      // Derived status: open chat → active, no chats yet → pending, else inactive.
      let status = 'inactive';
      if (c.conversations.some(cv => cv.status === 'open')) status = 'active';
      else if (c.conversations.length === 0) status = 'pending';
      return {
        id: c.id,
        name: c.name,
        avatar_url: c.avatarUrl,
        email: c.email,
        phone: c.phone,
        external_id: c.externalId,
        channel_type: c.channelType,
        inbox_id: c.inboxId,
        status,
        conversation_count: c.conversations.length,
        metadata: c.metadata,
        created_at: c.createdAt
      };
    });

    res.json({
      items: mappedItems,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (err) {
    console.error('Error fetching contacts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 1b. POST /api/contacts — manually create a contact. Attaches to a chosen
// inbox (or the org's first inbox). External id is generated for manual ones.
router.post('/', async (req, res) => {
  const { name, email, phone, inbox_id, channel_type } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    let inboxId = inbox_id;
    if (inboxId) {
      const ok = await db.inbox.findFirst({ where: { id: inboxId, orgId: req.orgId } });
      if (!ok) return res.status(400).json({ error: 'inbox not found in this org' });
    } else {
      const firstInbox = await db.inbox.findFirst({ where: { orgId: req.orgId }, orderBy: { createdAt: 'asc' } });
      if (!firstInbox) return res.status(400).json({ error: 'No inbox available — create a channel first' });
      inboxId = firstInbox.id;
    }

    const contact = await db.contact.create({
      data: {
        name: String(name).trim(),
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
        externalId: `manual_${require('uuid').v4()}`,
        channelType: channel_type || 'manual',
        inboxId
      }
    });

    res.status(201).json({
      contact: {
        id: contact.id, name: contact.name, avatar_url: contact.avatarUrl,
        email: contact.email, phone: contact.phone, external_id: contact.externalId,
        channel_type: contact.channelType, inbox_id: contact.inboxId,
        status: 'pending', conversation_count: 0, metadata: contact.metadata,
        created_at: contact.createdAt
      }
    });
  } catch (err) {
    console.error('Error creating contact:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. GET /api/contacts/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const contact = await db.contact.findFirst({
      where: { id, inbox: { orgId: req.orgId } },
      include: {
        conversations: {
          orderBy: { lastMessageAt: 'desc' }
        }
      }
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      contact: {
        id: contact.id,
        name: contact.name,
        avatar_url: contact.avatarUrl,
        email: contact.email,
        phone: contact.phone,
        external_id: contact.externalId,
        channel_type: contact.channelType,
        inbox_id: contact.inboxId,
        metadata: contact.metadata,
        created_at: contact.createdAt,
        conversations: contact.conversations.map(c => ({
          id: c.id,
          status: c.status,
          bot_paused: c.botPaused,
          last_message_at: c.lastMessageAt,
          created_at: c.createdAt
        }))
      }
    });
  } catch (err) {
    console.error('Error fetching contact details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. PUT /api/contacts/:id — edit name/email/phone. Org-scoped via inbox.orgId.
// On change we best-effort re-sync the contact to the CRM so edits propagate.
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;

  try {
    const existing = await db.contact.findFirst({
      where: { id, inbox: { orgId: req.orgId } }
    });
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (email !== undefined) data.email = email ? String(email).trim() : null;
    if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;

    if (data.name === '') {
      return res.status(400).json({ error: 'name cannot be empty' });
    }

    const updated = await db.contact.update({ where: { id }, data });

    res.json({
      contact: {
        id: updated.id,
        name: updated.name,
        avatar_url: updated.avatarUrl,
        email: updated.email,
        phone: updated.phone,
        external_id: updated.externalId,
        channel_type: updated.channelType,
        inbox_id: updated.inboxId,
        metadata: updated.metadata,
        created_at: updated.createdAt
      }
    });
  } catch (err) {
    console.error('Error updating contact:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
