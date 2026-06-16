const { v4: uuidv4 } = require('uuid');
const db = require('../src/config/db');
const integrationService = require('../src/services/integrationService');
const entitlement = require('../src/services/entitlementService');
const enforcement = require('../src/services/enforcementService');
const { forOrg } = require('../src/lib/tenant');

async function createOrg({ planKey = 'free', entitlements = undefined } = {}) {
  const s = uuidv4();
  const user = await db.user.create({
    data: { email: `il-${s}@example.com`, name: `IL ${s}`, role: 'admin', isActive: true }
  });
  const org = await db.organization.create({
    data: { name: `IL Org ${s}`, slug: `il-org-${s}`, ownerUserId: user.id, planKey, status: 'active', entitlements }
  });
  await db.membership.create({ data: { orgId: org.id, userId: user.id, role: 'owner' } });
  return { org, user };
}

describe('Integration layer: isolation, credentials, billing, soft-block', () => {
  const orgIds = [];
  const userIds = [];

  async function track(maker) {
    const { org, user } = await maker;
    orgIds.push(org.id);
    userIds.push(user.id);
    return { org, user };
  }

  afterAll(async () => {
    // Org-scoped rows cascade from organizations; delete orgs first (owner FK is
    // RESTRICT), then the owner users.
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  test('integration created in org A is invisible to org B (no cross-org leak)', async () => {
    const { org: orgA } = await track(createOrg());
    const { org: orgB } = await track(createOrg());

    const created = await integrationService.create(orgA.id, {
      provider: 'dify', kind: 'conversational', name: 'brain', credentials: { api_key: 'k' }
    });

    expect(await integrationService.get(orgB.id, created.id)).toBeNull();
    expect(await forOrg(orgB.id).integration.findById(created.id)).toBeNull();
    expect(await integrationService.get(orgA.id, created.id)).not.toBeNull();
  });

  test('credentials are encrypted at rest, masked in API, decryptable internally', async () => {
    const { org } = await track(createOrg());
    const created = await integrationService.create(org.id, {
      provider: 'seatable', kind: 'crm', name: 'crm', credentials: { api_token: 'super-secret' }
    });

    const raw = await db.integration.findUnique({ where: { id: created.id } });
    expect(raw.credentials.api_token).not.toBe('super-secret'); // encrypted at rest
    expect(created.credentials.api_token).toBe(true);           // masked in API shape

    const decrypted = await integrationService.getDecrypted(org.id, created.id);
    expect(decrypted.credentials.api_token).toBe('super-secret');
  });

  test('billing limit: free plan caps integrations at 1', async () => {
    const { org } = await track(createOrg({ planKey: 'free' }));
    await integrationService.create(org.id, { provider: 'dify', kind: 'conversational', name: 'one', credentials: {} });

    await expect(entitlement.assertWithinLimit(db, org, 'integrations'))
      .rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED', statusCode: 403 });
  });

  test('per-org override raises the limit without a plan change', async () => {
    const { org } = await track(createOrg({ planKey: 'free', entitlements: { integrations: 3 } }));
    await integrationService.create(org.id, { provider: 'dify', kind: 'conversational', name: 'a', credentials: {} });
    await integrationService.create(org.id, { provider: 'n8n', kind: 'workflow', name: 'b', config: { webhook_url: 'x' } });
    // 2 < 3 → still allowed
    await expect(entitlement.assertWithinLimit(db, org, 'integrations')).resolves.toBeUndefined();
  });

  test('enterprise plan is unlimited', async () => {
    const { org } = await track(createOrg({ planKey: 'enterprise' }));
    const limits = entitlement.getEffectiveLimits(org);
    expect(entitlement.isUnlimited(limits.integrations)).toBe(true);
    await expect(entitlement.assertWithinLimit(db, org, 'integrations')).resolves.toBeUndefined();
  });

  test('soft-block: inboxes over the limit are blocked newest-first, oldest stay active', async () => {
    const { org } = await track(createOrg({ planKey: 'free', entitlements: { inboxes: 1 } }));
    const older = await db.inbox.create({
      data: { name: 'older', channelType: 'telegram', orgId: org.id, createdAt: new Date(Date.now() - 5000) }
    });
    const newer = await db.inbox.create({
      data: { name: 'newer', channelType: 'telegram', orgId: org.id, createdAt: new Date() }
    });

    const blocked = await enforcement.softBlockedIds(db, org, 'inboxes');
    expect(blocked.has(newer.id)).toBe(true);  // excess → blocked
    expect(blocked.has(older.id)).toBe(false); // kept active

    expect(await enforcement.isResourceBlocked(db, org, 'inboxes', newer.id)).toBe(true);
    expect(await enforcement.isResourceBlocked(db, org, 'inboxes', older.id)).toBe(false);
  });

  test('canDispatch blocks suspended orgs and soft-blocked inboxes', async () => {
    const { org } = await track(createOrg({ planKey: 'free', entitlements: { inboxes: 1 } }));
    const activeInbox = await db.inbox.create({
      data: { name: 'a', channelType: 'telegram', orgId: org.id, createdAt: new Date(Date.now() - 5000) }
    });
    const blockedInbox = await db.inbox.create({
      data: { name: 'b', channelType: 'telegram', orgId: org.id, createdAt: new Date() }
    });

    expect((await enforcement.canDispatch(db, org, activeInbox)).allowed).toBe(true);
    expect((await enforcement.canDispatch(db, org, blockedInbox))).toMatchObject({ allowed: false, reason: 'inbox_soft_blocked' });

    const suspended = { ...org, status: 'suspended' };
    expect((await enforcement.canDispatch(db, suspended, activeInbox))).toMatchObject({ allowed: false, reason: 'org_inactive' });
  });
});
