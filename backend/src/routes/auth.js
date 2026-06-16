const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { assertWithinLimit } = require('../services/entitlementService');
const { generateSecret, verifyToken: verifyTotp, otpauthURI, generateRecoveryCodes, hashRecovery } = require('../lib/totp');
const { encrypt, decrypt } = require('../lib/secretCrypto');
const QRCode = require('qrcode');

// Verify a 2FA challenge: a 6-digit TOTP, or a one-time recovery code which is
// consumed on use. Returns { ok, recoveryUsed }. `user` must include
// twofaSecret (encrypted) + twofaRecovery (array of hashes).
async function verifyTwofaChallenge(user, code) {
  const clean = String(code || '').trim();
  if (/^\d{6}$/.test(clean) && verifyTotp(decrypt(user.twofaSecret), clean)) {
    return { ok: true, recoveryUsed: false };
  }
  const hashes = Array.isArray(user.twofaRecovery) ? user.twofaRecovery : [];
  const h = hashRecovery(clean);
  if (hashes.includes(h)) {
    // Consume the used recovery code.
    await db.user.update({ where: { id: user.id }, data: { twofaRecovery: hashes.filter((x) => x !== h) } });
    return { ok: true, recoveryUsed: true };
  }
  return { ok: false };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

const isProd = env.nodeEnv === 'production';

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('access_token', accessToken, {
    maxAge: 15 * 60 * 1000,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax'
  });
  res.cookie('refresh_token', refreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax'
  });
};

const issueTokensForUser = async (res, user) => {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role },
    env.jwtSecret,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    env.jwtRefreshSecret,
    { expiresIn: '7d' }
  );
  await db.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });
  setAuthCookies(res, accessToken, refreshToken);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
};

// ── 1. POST /api/auth/login ──────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.isActive) return res.status(403).json({ error: 'User account is deactivated' });
    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    // Two-factor gate: password + turnstile passed, but if 2FA is on we don't
    // issue tokens yet. Return a short-lived "pending" token; the client submits
    // it with the TOTP code to /2fa/login (no fresh turnstile needed there).
    if (user.twofaEnabled) {
      const pending = jwt.sign({ id: user.id, twofa: true }, env.jwtSecret, { expiresIn: '5m' });
      return res.status(401).json({ twofa_required: true, pending });
    }

    const userData = await issueTokensForUser(res, user);
    res.json({ user: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 1b. POST /api/auth/2fa/login — complete login with a TOTP code ──
router.post('/2fa/login', loginLimiter, async (req, res) => {
  const { pending, code } = req.body;
  if (!pending || !code) return res.status(400).json({ error: 'Pending token and code are required' });
  try {
    let payload;
    try {
      payload = jwt.verify(pending, env.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Session expired — sign in again' });
    }
    if (!payload.twofa) return res.status(401).json({ error: 'Invalid session' });

    const user = await db.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive || !user.twofaEnabled) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    const challenge = await verifyTwofaChallenge(user, code);
    if (!challenge.ok) {
      return res.status(401).json({ error: 'Invalid 2FA or recovery code' });
    }
    const userData = await issueTokensForUser(res, user);
    res.json({ user: userData, recovery_used: challenge.recoveryUsed });
  } catch (err) {
    console.error('2FA login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 2. POST /api/auth/refresh ────────────────────────────────
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) {
    return res.status(401).json({ error: 'No refresh token provided', code: 'NO_REFRESH_TOKEN' });
  }
  try {
    const payload = jwt.verify(token, env.jwtRefreshSecret);
    const storedToken = await db.refreshToken.findFirst({
      where: { token, revoked: false, expiresAt: { gt: new Date() } }
    });
    if (!storedToken) {
      return res.status(401).json({ error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }
    const user = await db.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User is not active', code: 'USER_INACTIVE' });
    }
    const newAccessToken = jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign({ id: user.id }, env.jwtRefreshSecret, { expiresIn: '7d' });
    await db.$transaction([
      db.refreshToken.update({ where: { id: storedToken.id }, data: { revoked: true } }),
      db.refreshToken.create({
        data: {
          userId: user.id,
          token: newRefreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      })
    ]);
    setAuthCookies(res, newAccessToken, newRefreshToken);
    res.json({ ok: true });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(401).json({ error: 'Invalid or expired refresh token', code: 'REFRESH_ERROR' });
  }
});

// ── 3. POST /api/auth/logout ─────────────────────────────────
router.post('/logout', async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) {
    try {
      await db.refreshToken.updateMany({ where: { token }, data: { revoked: true } });
    } catch (err) {
      console.error('Logout db error:', err);
    }
  }
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.json({ ok: true });
});

// ── 4. GET /api/auth/me ──────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, lastName: true,
        bio: true, role: true, avatarUrl: true,
        oauthProvider: true, passwordHash: true, twofaEnabled: true, twofaRecovery: true
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.lastName,
        bio: user.bio,
        role: user.role,
        avatarUrl: user.avatarUrl,
        oauthProvider: user.oauthProvider,
        hasPassword: !!user.passwordHash,
        twofaEnabled: user.twofaEnabled,
        recoveryRemaining: Array.isArray(user.twofaRecovery) ? user.twofaRecovery.length : 0,
      }
    });
  } catch (err) {
    console.error('GET /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 2FA (TOTP) ───────────────────────────────────────────────
// Setup: generate a pending secret + QR. Not enabled until the user confirms a
// code via /2fa/enable. Re-running before enabling rotates the pending secret.
router.post('/2fa/setup', verifyToken, async (req, res) => {
  try {
    const user = await db.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true, twofaEnabled: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.twofaEnabled) return res.status(400).json({ error: '2FA is already enabled' });

    const secret = generateSecret();
    // Store the secret encrypted at rest (AES-256-GCM via secretCrypto).
    await db.user.update({ where: { id: req.user.id }, data: { twofaSecret: encrypt(secret) } });

    const uri = otpauthURI(secret, { account: user.email || user.name || 'account', issuer: '1-Desk' });
    const qr = await QRCode.toDataURL(uri);
    res.json({ secret, otpauth_uri: uri, qr });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enable: confirm a code generated from the pending secret, then flip the flag.
router.post('/2fa/enable', verifyToken, async (req, res) => {
  const { code } = req.body;
  try {
    const user = await db.user.findUnique({ where: { id: req.user.id }, select: { twofaSecret: true, twofaEnabled: true } });
    if (!user || !user.twofaSecret) return res.status(400).json({ error: 'Start 2FA setup first' });
    if (user.twofaEnabled) return res.status(400).json({ error: '2FA is already enabled' });
    if (!verifyTotp(decrypt(user.twofaSecret), code)) return res.status(400).json({ error: 'Invalid code — try again' });

    // Issue one-time recovery codes (stored hashed, shown to the user once).
    const { codes, hashes } = generateRecoveryCodes(10);
    await db.user.update({ where: { id: req.user.id }, data: { twofaEnabled: true, twofaRecovery: hashes } });
    res.json({ ok: true, twofaEnabled: true, recovery_codes: codes });
  } catch (err) {
    console.error('2FA enable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Disable: require a current TOTP code (proves possession) before turning off.
router.post('/2fa/disable', verifyToken, async (req, res) => {
  const { code } = req.body;
  try {
    const user = await db.user.findUnique({ where: { id: req.user.id }, select: { id: true, twofaSecret: true, twofaEnabled: true, twofaRecovery: true } });
    if (!user || !user.twofaEnabled) return res.status(400).json({ error: '2FA is not enabled' });
    const challenge = await verifyTwofaChallenge(user, code);
    if (!challenge.ok) return res.status(400).json({ error: 'Invalid 2FA or recovery code' });

    await db.user.update({ where: { id: req.user.id }, data: { twofaEnabled: false, twofaSecret: null, twofaRecovery: [] } });
    res.json({ ok: true, twofaEnabled: false });
  } catch (err) {
    console.error('2FA disable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Regenerate recovery codes (invalidates old ones). Requires a current TOTP or
// recovery code to prove possession. Returns the new plaintext codes once.
router.post('/2fa/recovery/regenerate', verifyToken, async (req, res) => {
  const { code } = req.body;
  try {
    const user = await db.user.findUnique({ where: { id: req.user.id }, select: { id: true, twofaSecret: true, twofaEnabled: true, twofaRecovery: true } });
    if (!user || !user.twofaEnabled) return res.status(400).json({ error: '2FA is not enabled' });
    const challenge = await verifyTwofaChallenge(user, code);
    if (!challenge.ok) return res.status(400).json({ error: 'Invalid 2FA or recovery code' });

    const { codes, hashes } = generateRecoveryCodes(10);
    await db.user.update({ where: { id: req.user.id }, data: { twofaRecovery: hashes } });
    res.json({ ok: true, recovery_codes: codes });
  } catch (err) {
    console.error('2FA recovery regenerate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 4a. PUT /api/auth/profile ────────────────────────────────
router.put('/profile', verifyToken, async (req, res) => {
  const { name, lastName, bio, avatarUrl, email } = req.body;

  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }

  try {
    const data = {};
    if (name      !== undefined) data.name      = String(name).trim();
    if (lastName  !== undefined) data.lastName  = lastName ? String(lastName).trim() : null;
    if (bio       !== undefined) data.bio       = bio ? String(bio).trim() : null;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null;

    if (email !== undefined) {
      const trimmed = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      // Check uniqueness
      const existing = await db.user.findFirst({
        where: { email: trimmed, id: { not: req.user.id } }
      });
      if (existing) return res.status(409).json({ error: 'Email already in use' });
      data.email = trimmed;
    }

    const updated = await db.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true, email: true, name: true, lastName: true,
        bio: true, role: true, avatarUrl: true,
        oauthProvider: true, passwordHash: true
      }
    });

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        lastName: updated.lastName,
        bio: updated.bio,
        role: updated.role,
        avatarUrl: updated.avatarUrl,
        oauthProvider: updated.oauthProvider,
        hasPassword: !!updated.passwordHash,
      }
    });
  } catch (err) {
    console.error('PUT /profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 4b. POST /api/auth/change-password ──────────────────────
router.post('/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { passwordHash: true }
    });

    if (user.passwordHash) {
      // Existing password — must verify current
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db.user.update({
      where: { id: req.user.id },
      data: { passwordHash: hash }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /change-password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 5. GET /api/auth/operators ───────────────────────────────
router.get('/operators', verifyToken, async (req, res) => {
  try {
    // Admins managing the operator list pass ?include_inactive=1 to also see
    // disabled accounts (with their status). Default stays active-only for the
    // conversation assignment dropdown.
    const includeInactive = req.query.include_inactive === '1' && req.user.role === 'admin';
    const operators = await db.user.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: { id: true, name: true, email: true, role: true, isActive: true },
      orderBy: { createdAt: 'asc' }
    });
    res.json(operators.map(o => ({
      id: o.id, name: o.name, email: o.email, role: o.role, is_active: o.isActive
    })));
  } catch (err) {
    console.error('Error fetching operators:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 5a. POST /api/auth/operators — admin creates an operator ──
router.post('/operators', verifyToken, requireAdmin, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    // Add the new operator to the admin's organization so they share its data.
    const adminMembership = await db.membership.findFirst({
      where: { userId: req.user.id },
      include: { org: true },
      orderBy: { createdAt: 'asc' }
    });

    // Enforce the org's seat (operators) entitlement before creating the user.
    if (adminMembership && adminMembership.org) {
      try {
        await assertWithinLimit(db, adminMembership.org, 'operators');
      } catch (limitErr) {
        if (limitErr.code === 'PLAN_LIMIT_REACHED') {
          return res.status(limitErr.statusCode).json({ error: limitErr.message, code: limitErr.code });
        }
        throw limitErr;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        role: 'operator',
        isActive: true
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
    });

    if (adminMembership) {
      await db.membership.create({
        data: { orgId: adminMembership.orgId, userId: user.id, role: 'member' }
      });
    }

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.isActive,
      created_at: user.createdAt
    });
  } catch (err) {
    console.error('Error creating operator:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 5b. PATCH /api/auth/operators/:id — admin updates an operator ──
router.patch('/operators/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, is_active, password } = req.body;

  try {
    const target = await db.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.role === 'admin') {
      return res.status(403).json({ error: 'Cannot modify an admin account here' });
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (is_active !== undefined) data.isActive = !!is_active;
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });

    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      is_active: updated.isActive
    });
  } catch (err) {
    console.error('Error updating operator:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
