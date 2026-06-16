const db = require('../config/db');

async function ingestMessage({
  inboxId,
  externalContactId,
  contactName,
  contactAvatar = null,
  channelType,
  content,
  messageType = 'text',
  metadata = {}
}) {
  try {
    // 1. UPSERT contact
    const contact = await db.contact.upsert({
      where: {
        externalId_inboxId: {
          externalId: externalContactId,
          inboxId: inboxId
        }
      },
      create: {
        name: contactName,
        avatarUrl: contactAvatar,
        externalId: externalContactId,
        channelType,
        inboxId,
        metadata: {}
      },
      update: {
        name: contactName || undefined,
        avatarUrl: contactAvatar || undefined
      }
    });

    // 2. Find open/pending conversation or create a new one
    let conv = await db.conversation.findFirst({
      where: {
        contactId: contact.id,
        inboxId,
        status: { not: 'resolved' }
      },
      orderBy: { lastMessageAt: 'desc' }
    });

    if (!conv) {
      conv = await db.conversation.create({
        data: {
          contactId: contact.id,
          inboxId,
          status: 'open',
          botPaused: false
        }
      });
    } else {
      // If conversation was pending, open it on new contact message
      if (conv.status === 'pending') {
        conv = await db.conversation.update({
          where: { id: conv.id },
          data: { status: 'open' }
        });
      }
    }

    // 3. Save message
    const message = await db.message.create({
      data: {
        conversationId: conv.id,
        senderType: 'contact',
        content,
        messageType,
        metadata: metadata || {}
      }
    });

    // 4. Update last_message_at
    conv = await db.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: new Date() }
    });

    // Format output message to keep compatibility with snake_case naming
    const formattedMessage = {
      id: message.id,
      conversation_id: message.conversationId,
      sender_type: message.senderType,
      sender_id: message.senderId,
      content: message.content,
      message_type: message.messageType,
      metadata: message.metadata,
      created_at: message.createdAt,
      // Extra context so operator-side notifications can show the sender name
      // and route to the right inbox without an additional lookup.
      inbox_id: inboxId,
      contact_name: contact.name
    };

    // 5. Emit real-time Socket.IO events
    const socketModule = require('../socket');
    let io;
    try {
      io = socketModule.getIO();
      io.to(`inbox:${inboxId}`).emit('message:new', { message: formattedMessage, conversationId: conv.id });
      io.to(`conversation:${conv.id}`).emit('message:new', { message: formattedMessage });
      io.to(`inbox:${inboxId}`).emit('conversation:updated', {
        conversationId: conv.id,
        lastMessage: content,
        lastMessageAt: new Date().toISOString()
      });
    } catch (socketErr) {
      console.warn('Socket emit ignored (Socket not initialized yet):', socketErr.message);
    }

    // 6. Route to an AI brain if enabled and not paused.
    //    New path: inbox.agentIntegrationId → pluggable dispatcher (adapters,
    //    routing, CRM sync, idempotency). Legacy path: inbox.bot.webhookUrl →
    //    difyService.forward (kept working until inboxes are migrated to
    //    integrations). Selecting one path avoids double replies.
    if (!conv.botPaused) {
      const inbox = await db.inbox.findUnique({
        where: { id: inboxId },
        include: { bot: true }
      });

      if (inbox && inbox.agentIntegrationId && inbox.orgId) {
        if (io) {
          io.to(`conversation:${conv.id}`).emit('bot:typing', { conversationId: conv.id });
        }
        const dispatcher = require('./dispatcher');
        dispatcher.handleInbound(inbox.orgId, {
          inbox,
          conversation: conv,
          contact,
          message: { id: message.id, content, channelType, contactName: contact.name }
        }).catch(err => console.error('Dispatch failed:', err));
      } else if (inbox && inbox.bot && inbox.bot.webhookUrl) {
        if (io) {
          io.to(`conversation:${conv.id}`).emit('bot:typing', { conversationId: conv.id });
        }
        // Dynamically import and trigger difyService to prevent circular dependencies
        const difyService = require('./difyService');
        difyService.forward({ inbox, conv, contact, content, channelType })
          .catch(err => console.error('Dify forwarding failed:', err));
      }
    }

    // Return with snake_case matching format
    return {
      contact: {
        id: contact.id,
        name: contact.name,
        avatar_url: contact.avatarUrl,
        external_id: contact.externalId,
        channel_type: contact.channelType,
        inbox_id: contact.inboxId,
        metadata: contact.metadata,
        created_at: contact.createdAt
      },
      conversation: {
        id: conv.id,
        contact_id: conv.contactId,
        inbox_id: conv.inboxId,
        assigned_to: conv.assignedTo,
        status: conv.status,
        bot_paused: conv.botPaused,
        dify_conversation_id: conv.difyConversationId,
        last_message_at: conv.lastMessageAt,
        created_at: conv.createdAt
      },
      message: formattedMessage
    };
  } catch (error) {
    console.error('Error in ingestMessage service:', error);
    throw error;
  }
}

module.exports = {
  ingestMessage
};
