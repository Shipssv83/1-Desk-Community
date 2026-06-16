const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { loadOrgContext, requireOrgRole } = require('../middleware/org');
const { getEffectiveLimits } = require('../services/entitlementService');

router.use(verifyToken);
router.use(loadOrgContext);

// GET /api/organizations/me
router.get('/me', async (req, res) => {
  res.json({
    id: req.org.id,
    name: req.org.name,
    slug: req.org.slug,
    plan_key: req.org.planKey,
    status: req.org.status,
    role: req.membership.role,
    limits: getEffectiveLimits(req.org)
  });
});

// GET /api/organizations/me/members
router.get('/me/members', requireOrgRole('owner', 'admin'), async (req, res) => {
  try {
    const members = await db.membership.findMany({
      where: { orgId: req.orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' }
    });

    res.json(members.map(m => ({
      user_id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      created_at: m.createdAt
    })));
  } catch (err) {
    console.error('Error fetching organization members:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
