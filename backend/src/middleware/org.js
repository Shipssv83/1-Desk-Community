const db = require('../config/db');

// Loads the organization context for the authenticated user. Stage 1 picks
// the user's first membership (earliest created) since multi-org-per-user
// switching UI doesn't exist yet.
async function loadOrgContext(req, res, next) {
  try {
    const membership = await db.membership.findFirst({
      where: { userId: req.user.id },
      include: { org: true },
      orderBy: { createdAt: 'asc' }
    });

    if (!membership) {
      return res.status(403).json({ error: 'No organization membership' });
    }

    req.orgId = membership.orgId;
    req.org = membership.org;
    req.membership = membership;
    next();
  } catch (err) {
    console.error('Error loading org context:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function requireOrgRole(...roles) {
  return (req, res, next) => {
    if (!req.membership || !roles.includes(req.membership.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { loadOrgContext, requireOrgRole };
