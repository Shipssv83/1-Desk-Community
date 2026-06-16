const db = require('./config/db');

// Idempotent: backfills a single "Default Organization" for existing
// pre-multi-tenancy data, owned by the first admin user, on planKey
// 'enterprise' (unlimited) so current prod usage isn't blocked by the new
// entitlement checks. New orgs created after this point default to 'free'.
async function backfillOrg() {
  const orgCount = await db.organization.count();
  if (orgCount > 0) {
    console.log('Organizations already exist. Skipping org backfill.');
    return;
  }

  console.log('Running organization backfill...');

  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } });
  if (users.length === 0) {
    console.log('No users found. Skipping org backfill.');
    return;
  }

  const owner = users.find(u => u.role === 'admin') || users[0];

  const org = await db.organization.create({
    data: {
      name: 'Default Organization',
      slug: 'default',
      ownerUserId: owner.id,
      planKey: 'enterprise',
      status: 'active'
    }
  });
  console.log(`Created organization: ${org.name} (ID: ${org.id})`);

  for (const user of users) {
    const role = user.id === owner.id ? 'owner' : (user.role === 'admin' ? 'admin' : 'member');
    await db.membership.create({
      data: { orgId: org.id, userId: user.id, role }
    });
  }
  console.log(`Created ${users.length} membership(s).`);

  const botsResult = await db.bot.updateMany({
    where: { orgId: null },
    data: { orgId: org.id }
  });
  const inboxesResult = await db.inbox.updateMany({
    where: { orgId: null },
    data: { orgId: org.id }
  });
  console.log(`Backfilled orgId on ${botsResult.count} bot(s) and ${inboxesResult.count} inbox(es).`);
  console.log('Organization backfill completed successfully.');
}

module.exports = backfillOrg;
