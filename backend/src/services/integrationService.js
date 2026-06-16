const { forOrg } = require('../lib/tenant');
const { encryptCredentials, decryptCredentials, maskCredentials } = require('../lib/secretCrypto');

// Org-scoped CRUD for integrations. Credentials are encrypted at rest and never
// returned in plaintext through the API — callers that need them (adapters) use
// getDecrypted(). Everything goes through forOrg() so no query can escape the org.

const VALID_KINDS = ['agent', 'workflow', 'conversational', 'crm', 'channel'];

// Public/API shape: credentials are masked to presence booleans.
function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    kind: row.kind,
    name: row.name,
    config: row.config,
    credentials: maskCredentials(row.credentials),
    is_active: row.isActive,
    created_at: row.createdAt
  };
}

async function list(orgId, filter = {}) {
  const t = forOrg(orgId);
  const where = {};
  if (filter.kind) where.kind = filter.kind;
  if (filter.provider) where.provider = filter.provider;
  if (filter.activeOnly) where.isActive = true;
  const rows = await t.integration.findMany({ where, orderBy: { createdAt: 'desc' } });
  return rows.map(toPublic);
}

async function get(orgId, id) {
  const t = forOrg(orgId);
  return toPublic(await t.integration.findById(id));
}

// Internal: full row with DECRYPTED credentials. Adapters/dispatcher use this.
// Never expose the result through an API response.
async function getDecrypted(orgId, id) {
  const t = forOrg(orgId);
  const row = await t.integration.findById(id);
  if (!row) return null;
  return { ...row, credentials: decryptCredentials(row.credentials) };
}

async function create(orgId, { provider, kind, name, config, credentials, createdByUserId }) {
  if (!provider || !kind || !name) {
    const err = new Error('provider, kind and name are required');
    err.statusCode = 400;
    throw err;
  }
  if (!VALID_KINDS.includes(kind)) {
    const err = new Error(`kind must be one of: ${VALID_KINDS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  const t = forOrg(orgId);
  try {
    const row = await t.integration.create({
      data: {
        provider,
        kind,
        name,
        config: config || {},
        credentials: encryptCredentials(credentials || {}),
        createdByUserId: createdByUserId || null
      }
    });
    return toPublic(row);
  } catch (e) {
    if (e.code === 'P2002') {
      const err = new Error('An integration with this provider and name already exists');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

async function update(orgId, id, { name, config, credentials, isActive }) {
  const t = forOrg(orgId);
  const existing = await t.integration.findById(id);
  if (!existing) {
    const err = new Error('Integration not found');
    err.statusCode = 404;
    throw err;
  }
  const data = {};
  if (name !== undefined) data.name = name;
  if (config !== undefined) data.config = config;
  if (isActive !== undefined) data.isActive = !!isActive;
  if (credentials !== undefined) {
    // Merge: only re-encrypt provided keys; keep existing for omitted ones.
    data.credentials = { ...existing.credentials, ...encryptCredentials(credentials) };
  }
  await t.integration.updateMany({ where: { id }, data });
  return get(orgId, id);
}

async function remove(orgId, id) {
  const t = forOrg(orgId);
  const res = await t.integration.deleteMany({ where: { id } });
  return res.count > 0;
}

module.exports = {
  VALID_KINDS,
  toPublic,
  list,
  get,
  getDecrypted,
  create,
  update,
  remove
};
