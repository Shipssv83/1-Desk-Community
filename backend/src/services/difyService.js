const db = require('../config/db');
const fetch = require('node-fetch');

// Parses a Dify SSE stream and accumulates the final answer.
// Chatflow/Workflow apps don't support response_mode "blocking" reliably,
// so we always stream and reassemble the "message" event deltas.
function readDifyStream(stream) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let answer = '';
    let conversationId = '';
    let error = null;

    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const events = buffer.split('\n\n');
      buffer = events.pop();

      for (const evt of events) {
        const dataLine = evt.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.conversation_id) conversationId = parsed.conversation_id;
          if (parsed.event === 'message' || parsed.event === 'agent_message') {
            answer += parsed.answer || '';
          } else if (parsed.event === 'error') {
            error = parsed.message || 'Unknown Dify error';
          }
        } catch {
          // Non-JSON SSE lines (e.g. "event: ping") are ignored
        }
      }
    });

    stream.on('end', () => resolve({ answer, conversationId, error }));
    stream.on('error', reject);
  });
}

async function forward({ inbox, conv, contact, content, channelType }) {
  // While Dify generates the reply, show a "typing…" indicator in the chat so
  // the user sees the bot is working. Telegram clears it after ~5s, so refresh
  // it on an interval until the answer is sent (cleared in finally).
  let typingInterval = null;
  if (channelType === 'telegram') {
    const cfg = inbox.channelConfig || inbox.channel_config || {};
    const chatId = contact.externalId || contact.external_id;
    if (cfg.bot_token && chatId) {
      const ping = () => require('./channels/telegramService')
        .sendChatAction(cfg.bot_token, chatId, 'typing');
      ping();
      typingInterval = setInterval(ping, 4000);
    }
  }

  try {
    const webhookUrl = inbox.bot?.webhookUrl || inbox.webhook_url;
    const apiKey = inbox.bot?.apiKey || inbox.api_key;
    if (!webhookUrl || !apiKey) {
      throw new Error(`Inbox ${inbox.id} has no bot configured (webhookUrl/apiKey missing)`);
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {
          channel: channelType,
          contact_name: contact.name || 'User'
        },
        query: content,
        response_mode: 'streaming',
        conversation_id: conv.difyConversationId || conv.dify_conversation_id || '',
        user: contact.externalId || contact.external_id
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Dify API responded with ${response.status}: ${errText}`);
    }

    const streamResult = await readDifyStream(response.body);
    if (streamResult.error) {
      throw new Error(`Dify stream error: ${streamResult.error}`);
    }

    // 1. Save dify_conversation_id if it's new/changed
    const currentDifyConvId = conv.difyConversationId || conv.dify_conversation_id;
    if (streamResult.conversationId && streamResult.conversationId !== currentDifyConvId) {
      await db.conversation.update({
        where: { id: conv.id },
        data: { difyConversationId: streamResult.conversationId }
      });
    }

    const answer = streamResult.answer?.trim();
    if (!answer) return;

    // 2. Save bot reply message
    const botMsg = await db.message.create({
      data: {
        conversationId: conv.id,
        senderType: 'bot',
        content: answer,
        messageType: 'text'
      }
    });

    // 3. Update last_message_at
    await db.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: new Date() }
    });

    // Format output message to keep compatibility with snake_case naming
    const formattedBotMsg = {
      id: botMsg.id,
      conversation_id: botMsg.conversationId,
      sender_type: botMsg.senderType,
      sender_id: botMsg.senderId,
      content: botMsg.content,
      message_type: botMsg.messageType,
      metadata: botMsg.metadata,
      created_at: botMsg.createdAt
    };

    // 4. Emit Socket.IO events to operators
    const { getIO } = require('../socket');
    let io;
    try {
      io = getIO();
      io.to(`conversation:${conv.id}`).emit('message:new', { message: formattedBotMsg });
      io.to(`inbox:${conv.inbox_id || conv.inboxId}`).emit('conversation:updated', {
        conversationId: conv.id,
        lastMessage: answer,
        lastMessageAt: new Date().toISOString()
      });
    } catch (socketErr) {
      // socket.io not loaded/initialized
    }

    // 5. Send message back through the specific channel
    await sendViaChannel(inbox, contact, answer);

  } catch (err) {
    console.error('Error in difyService forward:', err);
    throw err;
  } finally {
    if (typingInterval) clearInterval(typingInterval);
  }
}

async function sendViaChannel(inbox, contact, text) {
  const cfg = inbox.channelConfig || inbox.channel_config || {};
  const channelType = inbox.channelType || inbox.channel_type;
  const externalId = contact.externalId || contact.external_id;

  if (channelType === 'telegram') {
    return require('./channels/telegramService').sendMessage(cfg.bot_token, externalId, text);
  }
  // Unknown channel — nothing to push.
}

module.exports = {
  forward,
  sendViaChannel
};
