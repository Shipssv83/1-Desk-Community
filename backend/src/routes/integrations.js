const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { loadOrgContext } = require('../middleware/org');
const db = require('../config/db');
const svc = require('../services/integrationService');
const { assertWithinLimit } = require('../services/entitlementService');

router.use(verifyToken);
router.use(loadOrgContext);
// Integrations carry credentials and routing power — admin only.
router.use(requireAdmin);

function handleError(res, err, ctx) {
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(`Error in integrations ${ctx}:`, err);
  return res.status(500).json({ error: 'Internal server error' });
}

// GET /api/integrations?kind=&provider=&active=1
router.get('/', async (req, res) => {
  try {
    const items = await svc.list(req.orgId, {
      kind: req.query.kind,
      provider: req.query.provider,
      activeOnly: req.query.active === '1'
    });
    res.json(items);
  } catch (err) {
    handleError(res, err, 'list');
  }
});

// GET /api/integrations/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await svc.get(req.orgId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Integration not found' });
    res.json(item);
  } catch (err) {
    handleError(res, err, 'get');
  }
});

// POST /api/integrations
router.post('/', async (req, res) => {
  try {
    await assertWithinLimit(db, req.org, 'integrations');
    const { provider, kind, name, config, credentials } = req.body;
    const created = await svc.create(req.orgId, {
      provider, kind, name, config, credentials,
      createdByUserId: req.user.id
    });
    res.status(201).json(created);
  } catch (err) {
    handleError(res, err, 'create');
  }
});

// PUT /api/integrations/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, config, credentials, is_active } = req.body;
    const updated = await svc.update(req.orgId, req.params.id, {
      name, config, credentials, isActive: is_active
    });
    res.json(updated);
  } catch (err) {
    handleError(res, err, 'update');
  }
});

// DELETE /api/integrations/:id
router.delete('/:id', async (req, res) => {
  try {
    const ok = await svc.remove(req.orgId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Integration not found' });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 'delete');
  }
});

module.exports = router;
