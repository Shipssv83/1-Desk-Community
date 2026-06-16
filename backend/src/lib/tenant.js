const db = require('../config/db');

// Tenant context: a thin wrapper that forces every integration-layer query to
// be scoped to a single orgId. Use forOrg(orgId) at the start of any flow that
// touches org data so cross-org leakage is structurally impossible — the helpers
// always inject orgId into `where`, and writes always stamp orgId.
//
// Usage:
//   const t = forOrg(req.orgId);
//   await t.integration.findMany();           // auto-scoped to org
//   await t.integration.create({ provider }); // orgId stamped automatically
function forOrg(orgId) {
  if (!orgId) {
    throw new Error('tenant.forOrg: orgId is required');
  }

  const scoped = (model) => ({
    findMany: (args = {}) =>
      db[model].findMany({ ...args, where: { ...(args.where || {}), orgId } }),
    findFirst: (args = {}) =>
      db[model].findFirst({ ...args, where: { ...(args.where || {}), orgId } }),
    // findById guards by orgId so an id from another org returns null, not data.
    findById: (id, args = {}) =>
      db[model].findFirst({ ...args, where: { ...(args.where || {}), id, orgId } }),
    count: (args = {}) =>
      db[model].count({ ...args, where: { ...(args.where || {}), orgId } }),
    create: (args = {}) =>
      db[model].create({ ...args, data: { ...(args.data || {}), orgId } }),
    // updateMany/deleteMany are used (not update/delete by id) so the orgId
    // filter is always part of the mutation and a wrong-org id is a no-op.
    updateMany: (args = {}) =>
      db[model].updateMany({ ...args, where: { ...(args.where || {}), orgId } }),
    deleteMany: (args = {}) =>
      db[model].deleteMany({ ...args, where: { ...(args.where || {}), orgId } }),
    upsert: (args) =>
      db[model].upsert({
        ...args,
        where: { ...(args.where || {}) },
        create: { ...(args.create || {}), orgId },
        update: { ...(args.update || {}) }
      })
  });

  return {
    orgId,
    raw: db,
    integration: scoped('integration'),
    dispatch: scoped('integrationDispatch'),
    webhookEvent: scoped('webhookEvent'),
    bot: scoped('bot'),
    inbox: scoped('inbox')
  };
}

module.exports = { forOrg };
