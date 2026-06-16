const { v4: uuidv4 } = require('uuid');

// Mock the SeaTable client so provisioning exercises the metadata→DDL→mapping
// logic without real network calls.
jest.mock('../src/services/adapters/seatableClient', () => ({
  makeClient: jest.fn(),
  getBaseToken: jest.fn(async () => ({ accessToken: 'acc', dtableUuid: 'base-uuid-1' }))
}));

const db = require('../src/config/db');
const { makeClient } = require('../src/services/adapters/seatableClient');
const integrationService = require('../src/services/integrationService');
const provisioning = require('../src/services/crmProvisioningService');

async function createOrg() {
  const s = uuidv4();
  const user = await db.user.create({
    data: { email: `prov-${s}@example.com`, name: `Prov ${s}`, role: 'admin', isActive: true }
  });
  const org = await db.organization.create({
    data: { name: `Prov Org ${s}`, slug: `prov-org-${s}`, ownerUserId: user.id, planKey: 'enterprise', status: 'active' }
  });
  await db.membership.create({ data: { orgId: org.id, userId: user.id, role: 'owner' } });
  return { org, user };
}

describe('CRM provisioning', () => {
  let org, user, seatableIntg, twentyIntg, fakeClient;

  beforeAll(async () => {
    ({ org, user } = await createOrg());
    seatableIntg = await integrationService.create(org.id, {
      provider: 'seatable', kind: 'crm', name: 'st',
      credentials: { server_url: 'https://seatable.example', api_token: 'tok' }
    });
    twentyIntg = await integrationService.create(org.id, {
      provider: 'twenty', kind: 'crm', name: 'tw',
      config: { api_url: 'https://api.twenty.com' }, credentials: { api_token: 'tok' }
    });
  });

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: org.id } });
    await db.user.deleteMany({ where: { id: user.id } });
    await db.$disconnect();
  });

  beforeEach(async () => {
    fakeClient = {
      getMetadata: jest.fn(async () => ({ tables: [] })),
      createTable: jest.fn(async () => ({})),
      ensureColumn: jest.fn(async () => ({}))
    };
    makeClient.mockReturnValue(fakeClient);
    await db.crmMapping.deleteMany({ where: { orgId: org.id, entity: 'lead' } });
  });

  test('SeaTable: creates Leads table when absent and wires the lead mapping', async () => {
    const res = await provisioning.provision(org.id, seatableIntg.id);

    expect(res.created).toBe(true);
    expect(fakeClient.createTable).toHaveBeenCalledWith('Leads', expect.any(Array));
    expect(fakeClient.ensureColumn).not.toHaveBeenCalled();

    const mapping = await db.crmMapping.findFirst({ where: { orgId: org.id, entity: 'lead' } });
    expect(mapping).not.toBeNull();
    expect(mapping.tableName).toBe('Leads');
    expect(mapping.baseUuid).toBe('base-uuid-1');
    expect(mapping.fieldMap.stage).toBe('Stage');
  });

  test('SeaTable: repairs missing columns when Leads already exists', async () => {
    fakeClient.getMetadata.mockResolvedValueOnce({
      tables: [{ name: 'Leads', columns: [{ name: 'Name' }, { name: 'Email' }] }]
    });

    const res = await provisioning.provision(org.id, seatableIntg.id);

    expect(res.created).toBe(false);
    expect(fakeClient.createTable).not.toHaveBeenCalled();
    // Missing columns (Phone, Channel, Score, Stage, Source, Notes, Created) added.
    expect(fakeClient.ensureColumn).toHaveBeenCalled();
    const addedStage = fakeClient.ensureColumn.mock.calls.some(([, c]) => c.column_name === 'Stage');
    expect(addedStage).toBe(true);
  });

  test('External CRM (twenty): seeds default mapping, no DDL', async () => {
    const res = await provisioning.provision(org.id, twentyIntg.id);

    expect(fakeClient.createTable).not.toHaveBeenCalled();
    const mapping = await db.crmMapping.findFirst({ where: { orgId: org.id, entity: 'lead' } });
    expect(mapping.tableName).toBe('people');
    expect(mapping.baseUuid).toBe('');
    expect(res.mapping.tableName).toBe('people');
  });
});
