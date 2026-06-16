const jwt = require('jsonwebtoken');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../src/app');
const db = require('../src/config/db');
const env = require('../src/config/env');

function tokenFor(userId) {
  return jwt.sign({ id: userId }, env.jwtSecret, { expiresIn: '1h' });
}

function authHeader(userId) {
  return { Authorization: `Bearer ${tokenFor(userId)}` };
}

async function createOrgWithOwner({ planKey = 'free' } = {}) {
  const suffix = uuidv4();
  const user = await db.user.create({
    data: {
      email: `tenant-${suffix}@example.com`,
      name: `Test User ${suffix}`,
      role: 'admin',
      isActive: true
    }
  });
  const org = await db.organization.create({
    data: {
      name: `Test Org ${suffix}`,
      slug: `test-org-${suffix}`,
      ownerUserId: user.id,
      planKey,
      status: 'active'
    }
  });
  await db.membership.create({
    data: { orgId: org.id, userId: user.id, role: 'owner' }
  });
  return { user, org };
}

describe('Multi-tenancy isolation and entitlements', () => {
  let orgA, userA, orgB, userB, orgFree, userFree;
  const createdOrgIds = [];
  const createdUserIds = [];

  beforeAll(async () => {
    ({ user: userA, org: orgA } = await createOrgWithOwner({ planKey: 'enterprise' }));
    ({ user: userB, org: orgB } = await createOrgWithOwner({ planKey: 'enterprise' }));
    ({ user: userFree, org: orgFree } = await createOrgWithOwner({ planKey: 'free' }));

    createdOrgIds.push(orgA.id, orgB.id, orgFree.id);
    createdUserIds.push(userA.id, userB.id, userFree.id);
  });

  afterAll(async () => {
    const inboxes = await db.inbox.findMany({ where: { orgId: { in: createdOrgIds } }, select: { id: true } });
    const inboxIds = inboxes.map(i => i.id);

    await db.message.deleteMany({ where: { conversation: { inboxId: { in: inboxIds } } } });
    await db.conversation.deleteMany({ where: { inboxId: { in: inboxIds } } });
    await db.contact.deleteMany({ where: { inboxId: { in: inboxIds } } });
    await db.widgetSession.deleteMany({ where: { inboxId: { in: inboxIds } } });
    await db.inbox.deleteMany({ where: { id: { in: inboxIds } } });
    await db.bot.deleteMany({ where: { orgId: { in: createdOrgIds } } });
    await db.membership.deleteMany({ where: { orgId: { in: createdOrgIds } } });
    await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await db.$disconnect();
  });

  test('org isolation: a user cannot see another org\'s bots', async () => {
    const botA = await request(app)
      .post('/api/bots')
      .set(authHeader(userA.id))
      .send({ name: 'Bot A', webhook_url: 'https://example.com/a' });
    expect(botA.status).toBe(201);

    const botB = await request(app)
      .post('/api/bots')
      .set(authHeader(userB.id))
      .send({ name: 'Bot B', webhook_url: 'https://example.com/b' });
    expect(botB.status).toBe(201);

    const listA = await request(app).get('/api/bots').set(authHeader(userA.id));
    expect(listA.status).toBe(200);
    const idsA = listA.body.map(b => b.id);
    expect(idsA).toContain(botA.body.id);
    expect(idsA).not.toContain(botB.body.id);
  });

  test('org isolation: a user cannot update another org\'s inbox', async () => {
    const inboxA = await request(app)
      .post('/api/inboxes')
      .set(authHeader(userA.id))
      .send({ name: 'Inbox A', channel_type: 'api', channel_config: {} });
    expect(inboxA.status).toBe(201);

    const inboxB = await request(app)
      .post('/api/inboxes')
      .set(authHeader(userB.id))
      .send({ name: 'Inbox B', channel_type: 'api', channel_config: {} });
    expect(inboxB.status).toBe(201);

    const crossUpdate = await request(app)
      .put(`/api/inboxes/${inboxB.body.id}`)
      .set(authHeader(userA.id))
      .send({ name: 'Hijacked' });
    expect(crossUpdate.status).toBe(404);

    const listA = await request(app).get('/api/inboxes').set(authHeader(userA.id));
    const idsA = listA.body.map(i => i.id);
    expect(idsA).toContain(inboxA.body.id);
    expect(idsA).not.toContain(inboxB.body.id);
  });

  test('free plan enforces bot limit (max 1)', async () => {
    const first = await request(app)
      .post('/api/bots')
      .set(authHeader(userFree.id))
      .send({ name: 'Free Bot 1', webhook_url: 'https://example.com/free1' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/bots')
      .set(authHeader(userFree.id))
      .send({ name: 'Free Bot 2', webhook_url: 'https://example.com/free2' });
    expect(second.status).toBe(403);
    expect(second.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  test('enterprise plan allows multiple bots', async () => {
    const second = await request(app)
      .post('/api/bots')
      .set(authHeader(userA.id))
      .send({ name: 'Bot A2', webhook_url: 'https://example.com/a2' });
    expect(second.status).toBe(201);
  });

  test('conversation/contact isolation across orgs', async () => {
    const inboxA = await db.inbox.create({
      data: { name: 'Conv Inbox A', channelType: 'api', channelConfig: {}, orgId: orgA.id, createdByUserId: userA.id }
    });
    const contactA = await db.contact.create({
      data: { name: 'Contact A', externalId: `ext-${uuidv4()}`, channelType: 'api', inboxId: inboxA.id }
    });
    const conversationA = await db.conversation.create({
      data: { contactId: contactA.id, inboxId: inboxA.id }
    });

    const ownView = await request(app).get(`/api/conversations/${conversationA.id}`).set(authHeader(userA.id));
    expect(ownView.status).toBe(200);

    const crossView = await request(app).get(`/api/conversations/${conversationA.id}`).set(authHeader(userB.id));
    expect(crossView.status).toBe(404);

    const crossContact = await request(app).get(`/api/contacts/${contactA.id}`).set(authHeader(userB.id));
    expect(crossContact.status).toBe(404);
  });
});
