const { v4: uuidv4 } = require('uuid');

// Mock the SeaTable HTTP client so the test exercises the idempotency + mapping
// logic without real network calls.
jest.mock('../src/services/adapters/seatableClient', () => ({
  makeClient: jest.fn()
}));

const db = require('../src/config/db');
const { makeClient } = require('../src/services/adapters/seatableClient');
const integrationService = require('../src/services/integrationService');
const crmSync = require('../src/services/crmSyncService');

async function createOrg() {
  const s = uuidv4();
  const user = await db.user.create({
    data: { email: `crm-${s}@example.com`, name: `CRM ${s}`, role: 'admin', isActive: true }
  });
  const org = await db.organization.create({
    data: { name: `CRM Org ${s}`, slug: `crm-org-${s}`, ownerUserId: user.id, planKey: 'enterprise', status: 'active' }
  });
  await db.membership.create({ data: { orgId: org.id, userId: user.id, role: 'owner' } });
  return { org, user };
}

describe('SeaTable CRM sync (idempotent)', () => {
  let org, user, inbox, contact, integration;
  let fakeClient;

  beforeAll(async () => {
    ({ org, user } = await createOrg());
    inbox = await db.inbox.create({ data: { name: 'crm-inbox', channelType: 'telegram', orgId: org.id } });
    contact = await db.contact.create({
      data: { name: 'Lead Person', externalId: `ext-${uuidv4()}`, channelType: 'telegram', inboxId: inbox.id, email: 'lead@example.com' }
    });

    integration = await integrationService.create(org.id, {
      provider: 'seatable', kind: 'crm', name: 'crm',
      credentials: { server_url: 'https://seatable.example', api_token: 'tok' }
    });
    await db.crmMapping.create({
      data: {
        orgId: org.id, integrationId: integration.id, entity: 'contact',
        baseUuid: 'base-1', tableName: 'Contacts',
        fieldMap: { name: 'Name', email: 'Email', phone: 'Phone' }
      }
    });
  });

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: org.id } });
    await db.user.deleteMany({ where: { id: user.id } });
    await db.$disconnect();
  });

  beforeEach(() => {
    fakeClient = {
      appendRow: jest.fn(async () => 'row-1'),
      updateRow: jest.fn(async () => true),
      findRowId: jest.fn(async () => null)
    };
    makeClient.mockReturnValue(fakeClient);
  });

  test('first sync appends a row and creates a CrmLink', async () => {
    const res = await crmSync.syncRecord(org.id, {
      entity: 'contact', localType: 'contact', localId: contact.id,
      fields: { name: 'Lead Person', email: 'lead@example.com' }, dedupeKey: 'email'
    });

    expect(res.created).toBe(true);
    expect(res.externalRowId).toBe('row-1');
    expect(fakeClient.appendRow).toHaveBeenCalledTimes(1);
    // Only mapped, non-empty fields are written.
    expect(fakeClient.appendRow).toHaveBeenCalledWith('Contacts', { Name: 'Lead Person', Email: 'lead@example.com' });

    const link = await db.crmLink.findFirst({ where: { orgId: org.id, localId: contact.id } });
    expect(link).not.toBeNull();
    expect(link.externalRowId).toBe('row-1');
  });

  test('second sync updates the same row (idempotent, no duplicate)', async () => {
    const res = await crmSync.syncRecord(org.id, {
      entity: 'contact', localType: 'contact', localId: contact.id,
      fields: { name: 'Lead Person Renamed' }
    });

    expect(res.created).toBe(false);
    expect(res.externalRowId).toBe('row-1');
    expect(fakeClient.updateRow).toHaveBeenCalledWith('Contacts', 'row-1', { Name: 'Lead Person Renamed' });
    expect(fakeClient.appendRow).not.toHaveBeenCalled();

    const links = await db.crmLink.findMany({ where: { orgId: org.id, localId: contact.id } });
    expect(links.length).toBe(1); // still one link → no duplicate row
  });

  test('skips when org has no CRM mapping for the entity', async () => {
    const res = await crmSync.syncRecord(org.id, {
      entity: 'deal', localType: 'conversation', localId: uuidv4(),
      fields: { name: 'x' }
    });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no_mapping');
  });

  test('dedupe by email links to an existing external row instead of appending', async () => {
    // Fresh contact with no link yet; client reports an existing row by email.
    const c2 = await db.contact.create({
      data: { name: 'Existing', externalId: `ext-${uuidv4()}`, channelType: 'telegram', inboxId: inbox.id, email: 'dupe@example.com' }
    });
    fakeClient.findRowId.mockResolvedValueOnce('row-existing');

    const res = await crmSync.syncRecord(org.id, {
      entity: 'contact', localType: 'contact', localId: c2.id,
      fields: { name: 'Existing', email: 'dupe@example.com' }, dedupeKey: 'email'
    });

    expect(res.created).toBe(false);
    expect(res.externalRowId).toBe('row-existing');
    expect(fakeClient.findRowId).toHaveBeenCalledWith('Contacts', 'Email', 'dupe@example.com');
    expect(fakeClient.updateRow).toHaveBeenCalledWith('Contacts', 'row-existing', expect.any(Object));
    expect(fakeClient.appendRow).not.toHaveBeenCalled();
  });
});
