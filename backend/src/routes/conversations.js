const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { loadOrgContext } = require('../middleware/org');
const difyService = require('../services/difyService');
const { getIO } = require('../socket');

// All routes require authentication
router.use(verifyToken);
router.use(loadOrgContext);

// Helper to map database model to snake_case object for frontend
function mapConversation(c) {
  if (!c) return null;
  return {
    id: c.id,
    contact_id: c.contactId,
    inbox_id: c.inboxId,
    assigned_to: c.assignedTo,
    status: c.status,
    bot_paused: c.botPaused,
    dify_conversation_id: c.difyConversationId,
    last_message_at: c.lastMessageAt,
    created_at: c.createdAt,
    contact_name: c.contact?.name,
    contact_avatar: c.contact?.avatarUrl,
    contact_email: c.contact?.email,
    contact_phone: c.contact?.phone,
    contact_channel: c.contact?.channelType,
    contact_metadata: c.contact?.metadata,
    contact_created_at: c.contact?.createdAt,
    inbox_name: c.inbox?.name,
    inbox_channel: c.inbox?.channelType,
    inbox_config: c.inbox?.channelConfig,
    assignee_name: c.assignee?.name,
    assignee_email: c.assignee?.email,
    last_message_content: c.messages?.[0]?.content || null,
    last_message_type: c.messages?.[0]?.messageType || null
  };
}

function mapMessage(m, agentName = null) {
  if (!m) return null;
  return {
    id: m.id,
    conversation_id: m.conversationId,
    sender_type: m.senderType,
    sender_id: m.senderId,
    content: m.content,
    message_type: m.messageType,
    metadata: m.metadata,
    created_at: m.createdAt,
    sender_name: agentName
  };
}

async function getMessagesWithSenders(conversationId, whereClause = {}, limit = 30) {
  const messages = await db.message.findMany({
    where: {
      conversationId,
      ...whereClause
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  const agentIds = [...new Set(messages.filter(m => m.senderType === 'agent' && m.senderId).map(m => m.senderId))];
  const agents = await db.user.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true }
  });
  const agentMap = agents.reduce((acc, a) => ({ ...acc, [a.id]: a.name }), {});

  return messages.map(m => mapMessage(m, m.senderType === 'agent' ? agentMap[m.senderId] : null));
}

// 1. GET /api/conversations
router.get('/', async (req, res) => {
  const { status, inbox_id, assigned_to, search, page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  try {
    const where = { inbox: { orgId: req.orgId } };

    if (status) {
      where.status = status;
    }

    if (inbox_id) {
      where.inboxId = inbox_id;
    }

    if (assigned_to) {
      if (assigned_to === 'me') {
        where.assignedTo = req.user.id;
      } else if (assigned_to === 'unassigned') {
        where.assignedTo = null;
      } else {
        where.assignedTo = assigned_to;
      }
    }

    if (search) {
      where.contact = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    const total = await db.conversation.count({ where });

    const items = await db.conversation.findMany({
      where,
      include: {
        contact: true,
        inbox: true,
        assignee: {
          select: { name: true, email: true }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { lastMessageAt: 'desc' },
      take: parseInt(limit, 10),
      skip: offset
    });

    res.json({
      items: items.map(mapConversation),
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. GET /api/conversations/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const conv = await db.conversation.findFirst({
      where: { id, inbox: { orgId: req.orgId } },
      include: {
        contact: true,
        inbox: true,
        assignee: {
          select: { name: true, email: true }
        }
      }
    });

    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await getMessagesWithSenders(id, {}, 30);

    res.json({
      conversation: mapConversation(conv),
      messages: messages.reverse() // Return in chronological order
    });
  } catch (err) {
    console.error('Error fetching conversation details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. PATCH /api/conversations/:id
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, assigned_to, bot_paused } = req.body;

  const data = {};
  if (status !== undefined) {
    data.status = status;
  }
  if (assigned_to !== undefined) {
    data.assignedTo = assigned_to === 'unassigned' || assigned_to === null ? null : assigned_to;
  }
  if (bot_paused !== undefined) {
    data.botPaused = bot_paused;
  }

  try {
    const existing = await db.conversation.findFirst({ where: { id, inbox: { orgId: req.orgId } } });
    if (!existing) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const updatedConv = await db.conversation.update({
      where: { id },
      data,
      include: {
        contact: true,
        inbox: true,
        assignee: {
          select: { name: true, email: true }
        }
      }
    });

    // Emit Realtime updates to operators
    let io;
    try {
      io = getIO();
      const payload = {
        conversationId: updatedConv.id,
        status: updatedConv.status,
        assigned_to: updatedConv.assignedTo,
        bot_paused: updatedConv.botPaused
      };
      io.to(`inbox:${updatedConv.inboxId}`).emit('conversation:updated', payload);
      io.to(`conversation:${updatedConv.id}`).emit('conversation:updated', payload);
    } catch {}

    res.json({ conversation: mapConversation(updatedConv) });
  } catch (err) {
    console.error('Error updating conversation:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. GET /api/conversations/:id/messages
router.get('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { before_id, limit = 30 } = req.query;

  try {
    const conv = await db.conversation.findFirst({ where: { id, inbox: { orgId: req.orgId } } });
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const whereClause = {};

    if (before_id) {
      const beforeMsg = await db.message.findUnique({
        where: { id: before_id },
        select: { createdAt: true }
      });
      if (beforeMsg) {
        whereClause.createdAt = { lt: beforeMsg.createdAt };
      }
    }

    const messages = await getMessagesWithSenders(id, whereClause, parseInt(limit, 10));

    res.json({
      messages: messages.reverse() // Send in chronological order
    });
  } catch (err) {
    console.error('Error fetching messages page:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. POST /api/conversations/:id/messages
router.post('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { content, message_type = 'text', metadata = {} } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    // 1. Fetch conversation, inbox, and contact
    const conv = await db.conversation.findFirst({
      where: { id, inbox: { orgId: req.orgId } },
      include: {
        contact: true,
        inbox: true
      }
    });

    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // 2. Insert message (sender_type='agent', sender_id=req.user.id)
    const message = await db.message.create({
      data: {
        conversationId: id,
        senderType: 'agent',
        senderId: req.user.id,
        content,
        messageType: message_type,
        metadata: metadata || {}
      }
    });

    // 3. Update conversation last_message_at
    await db.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() }
    });

    // Format output message
    const formattedMessage = mapMessage(message, req.user.name);

    // 4. Emit realtime updates
    let io;
    try {
      io = getIO();
      io.to(`conversation:${id}`).emit('message:new', { message: formattedMessage });
      io.to(`inbox:${conv.inboxId}`).emit('message:new', { message: formattedMessage, conversationId: id });
      io.to(`inbox:${conv.inboxId}`).emit('conversation:updated', {
        conversationId: id,
        lastMessage: content,
        lastMessageAt: new Date().toISOString()
      });
    } catch {}

    // 5. Send message outbound through the channel
    const contact = {
      id: conv.contact.id,
      external_id: conv.contact.externalId,
      name: conv.contact.name,
      avatar_url: conv.contact.avatarUrl
    };

    const inbox = {
      id: conv.inbox.id,
      channel_type: conv.inbox.channelType,
      channel_config: conv.inbox.channelConfig
    };

    await difyService.sendViaChannel(inbox, contact, content);

    res.json({ message: formattedMessage });
  } catch (err) {
    console.error('Error creating outgoing message:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
