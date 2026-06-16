const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { loadOrgContext } = require('../middleware/org');

router.use(verifyToken);
router.use(loadOrgContext);

// Aggregated overview for the Dashboard: counts + connected systems in one call.
router.get('/overview', async (req, res) => {
  try {
    const orgId = req.orgId;
    const [conversations, totalMessages, totalContacts, members, bots, integrations, inboxes] = await Promise.all([
      db.conversation.findMany({ where: { inbox: { orgId } }, select: { status: true } }),
      db.message.count({ where: { conversation: { inbox: { orgId } } } }),
      db.contact.count({ where: { inbox: { orgId } } }),
      db.membership.findMany({ where: { orgId }, select: { role: true } }),
      db.bot.findMany({ where: { orgId }, select: { id: true, name: true } }),
      db.integration.findMany({ where: { orgId }, select: { id: true, provider: true, kind: true, name: true, isActive: true } }),
      db.inbox.findMany({ where: { orgId }, select: { id: true, name: true, channelType: true } }),
    ]);

    const byStatus = (s) => conversations.filter((c) => c.status === s).length;

    // Integrations grouped by kind, with active counts + provider names.
    const integrationsByKind = {};
    for (const i of integrations) {
      const k = integrationsByKind[i.kind] || (integrationsByKind[i.kind] = { total: 0, active: 0, providers: [] });
      k.total++;
      if (i.isActive) k.active++;
      k.providers.push({ id: i.id, provider: i.provider, name: i.name, active: i.isActive });
    }

    res.json({
      counts: {
        conversations: conversations.length,
        open: byStatus('open'),
        pending: byStatus('pending'),
        resolved: byStatus('resolved'),
        messages: totalMessages,
        contacts: totalContacts,
        operators: members.length,
        admins: members.filter((m) => m.role === 'owner' || m.role === 'admin').length,
        bots: bots.length,
        channels: inboxes.length,
        integrations: integrations.length,
      },
      bots,
      integrations_by_kind: integrationsByKind,
      channels: inboxes.map((i) => ({ id: i.id, name: i.name, channel_type: i.channelType })),
    });
  } catch (err) {
    console.error('Error generating dashboard overview:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    // ── Date range ──────────────────────────────────────────
    const toDate   = req.query.to   ? new Date(req.query.to)   : new Date();
    const fromDate = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fromDate.setHours(0,  0,  0,   0);
    toDate.setHours(23, 59, 59, 999);

    // ── Filtered conversations ───────────────────────────────
    const conversations = await db.conversation.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate }, inbox: { orgId: req.orgId } },
      select: { id: true, status: true, inboxId: true }
    });

    const totalConversations    = conversations.length;
    const openConversations     = conversations.filter(c => c.status === 'open').length;
    const pendingConversations  = conversations.filter(c => c.status === 'pending').length;
    const resolvedConversations = conversations.filter(c => c.status === 'resolved').length;

    // ── Message count (filtered) ─────────────────────────────
    const totalMessages = await db.message.count({
      where: { createdAt: { gte: fromDate, lte: toDate }, conversation: { inbox: { orgId: req.orgId } } }
    });

    // ── Contact count (all time — contacts don't have creation filter) ─
    const totalContacts = await db.contact.count({ where: { inbox: { orgId: req.orgId } } });

    // ── Inbox breakdown (filtered) ───────────────────────────
    const inboxes = await db.inbox.findMany({
      where: { orgId: req.orgId },
      select: { id: true, name: true, channelType: true }
    });

    const inboxStats = inboxes.map(i => {
      const convs = conversations.filter(c => c.inboxId === i.id);
      return {
        id: i.id,
        name: i.name,
        channel_type: i.channelType,
        total_conversations:    convs.length,
        open_conversations:     convs.filter(c => c.status === 'open').length,
        resolved_conversations: convs.filter(c => c.status === 'resolved').length,
      };
    });

    // ── Time-series: conversations per day ───────────────────
    const convSeries = await db.$queryRaw`
      SELECT
        DATE_TRUNC('day', c.created_at AT TIME ZONE 'UTC')::date AS day,
        COUNT(*)::int                                            AS new_conversations,
        SUM(CASE WHEN c.status = 'resolved' THEN 1 ELSE 0 END)::int AS resolved_conversations
      FROM conversations c
      JOIN inboxes i ON i.id = c.inbox_id
      WHERE c.created_at >= ${fromDate} AND c.created_at <= ${toDate} AND i.org_id = ${req.orgId}::uuid
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    // ── Time-series: messages per day ────────────────────────
    const msgSeries = await db.$queryRaw`
      SELECT
        DATE_TRUNC('day', m.created_at AT TIME ZONE 'UTC')::date AS day,
        COUNT(*)::int AS messages
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN inboxes i ON i.id = c.inbox_id
      WHERE m.created_at >= ${fromDate} AND m.created_at <= ${toDate} AND i.org_id = ${req.orgId}::uuid
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    // ── Merge series + fill gaps ─────────────────────────────
    const msDay = 24 * 60 * 60 * 1000;
    const days = [];
    for (let d = new Date(fromDate); d <= toDate; d = new Date(+d + msDay)) {
      days.push(d.toISOString().slice(0, 10));
    }

    const convMap = Object.fromEntries(
      convSeries.map(r => [String(r.day).slice(0, 10), { new_conversations: r.new_conversations, resolved_conversations: r.resolved_conversations }])
    );
    const msgMap = Object.fromEntries(
      msgSeries.map(r => [String(r.day).slice(0, 10), r.messages])
    );

    const timeSeries = days.map(day => ({
      day,
      new_conversations:      convMap[day]?.new_conversations      ?? 0,
      resolved_conversations: convMap[day]?.resolved_conversations ?? 0,
      messages:               msgMap[day] ?? 0,
    }));

    res.json({
      summary: {
        total_conversations:    totalConversations,
        open_conversations:     openConversations,
        pending_conversations:  pendingConversations,
        resolved_conversations: resolvedConversations,
        total_messages:         totalMessages,
        total_contacts:         totalContacts,
      },
      inbox_breakdown: inboxStats,
      time_series:     timeSeries,
      date_range: {
        from: fromDate.toISOString(),
        to:   toDate.toISOString(),
      },
    });
  } catch (err) {
    console.error('Error generating dashboard stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
