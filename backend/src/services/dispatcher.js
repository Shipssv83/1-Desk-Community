const db = require('../config/db');
const { forOrg } = require('../lib/tenant');
const integrationService = require('./integrationService');
const { getAdapter } = require('./adapters');
const difyService = require('./difyService'); // reuse sendViaChannel for outbound

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// RouteSelector — explicit, no if/else chains over providers. Reads the inbox's
// configured integrations + routingPolicy and returns the plan. Adding a brain
// later needs no change here.
function selectRoute(inbox) {
  return {
    agentId: inbox.agentIntegrationId || inbox.agent_integration_id || null,
    policy: inbox.routingPolicy || inbox.routing_policy || {}
  };
}

async function withRetry(fn, { attempts = 3, baseDelay = 400 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (last && last.ok) return { result: last, attempts: i + 1 };
    if (i < attempts - 1) await sleep(baseDelay * Math.pow(2, i));
  }
  return { result: last, attempts };
}

async function logDispatch(orgId, { integrationId, kind, idem, status, attempts, error, request, response }) {
  const t = forOrg(orgId);
  await t.dispatch.upsert({
    where: { orgId_idempotencyKey: { orgId, idempotencyKey: idem } },
    create: { integrationId, kind, idempotencyKey: idem, status, attempts, lastError: error || null, request: request || {}, response: response || {} },
    update: { status, attempts, lastError: error || null, response: response || {} }
  });
}

// Save bot reply, bump conversation, emit sockets, send through the channel.
async function deliverReply({ conversation, inbox, contact, reply }) {
  const botMsg = await db.message.create({
    data: { conversationId: conversation.id, senderType: 'bot', content: reply, messageType: 'text' }
  });
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

  const formatted = {
    id: botMsg.id,
    conversation_id: botMsg.conversationId,
    sender_type: botMsg.senderType,
    content: botMsg.content,
    message_type: botMsg.messageType,
    created_at: botMsg.createdAt
  };
  try {
    const { getIO } = require('../socket');
    const io = getIO();
    io.to(`conversation:${conversation.id}`).emit('message:new', { message: formatted });
    io.to(`inbox:${inbox.id}`).emit('conversation:updated', {
      conversationId: conversation.id,
      lastMessage: reply,
      lastMessageAt: new Date().toISOString()
    });
  } catch { /* socket not ready */ }

  await difyService.sendViaChannel(inbox, contact, reply);
}

// Main inbound dispatch. Orchestrates: brain → persist → CRM sync → reply.
// Idempotent per (conversation, message); retried with backoff; logged.
async function handleInbound(orgId, { inbox, conversation, contact, message }) {
  const route = selectRoute(inbox);
  if (!route.agentId) return { skipped: true, reason: 'no_agent' };

  const integration = await integrationService.getDecrypted(orgId, route.agentId);
  if (!integration || !integration.isActive) return { skipped: true, reason: 'agent_inactive' };

  const adapter = getAdapter(integration.provider);
  if (!adapter || typeof adapter.handleInbound !== 'function') {
    return { skipped: true, reason: 'no_adapter' };
  }

  const idem = `inbound:${conversation.id}:${message.id}`;
  const t = forOrg(orgId);
  const prior = await t.dispatch.findFirst({ where: { idempotencyKey: idem, status: 'success' } });
  if (prior) return { skipped: true, reason: 'already_processed' };

  const ctx = { orgId, integration, inbox, conversation, contact };
  const { result, attempts } = await withRetry(() => adapter.handleInbound(ctx, message));

  await logDispatch(orgId, {
    integrationId: integration.id, kind: integration.kind, idem,
    status: result && result.ok ? 'success' : 'failed', attempts,
    error: result && result.error, request: { content: message.content },
    response: { ok: !!(result && result.ok) }
  });

  if (!result || !result.ok) return { ok: false, error: result && result.error };

  // Persist upstream conversation id (e.g. Dify) for memory continuity.
  if (result.conversationId && result.conversationId !== conversation.difyConversationId) {
    await db.conversation.update({ where: { id: conversation.id }, data: { difyConversationId: result.conversationId } });
  }

  if (result.reply) {
    await deliverReply({ conversation, inbox, contact, reply: result.reply });
  }

  return { ok: true, reply: result.reply };
}

module.exports = { selectRoute, withRetry, handleInbound, deliverReply };
