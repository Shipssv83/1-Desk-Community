const crypto = require('crypto');

// Minimal RFC 6238 TOTP (SHA-1, 6 digits, 30s step) + RFC 3548 base32 — no
// external dependency. Used for admin/operator two-factor auth.

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// New random base32 secret (160 bits — standard for TOTP).
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

// Verify a user-supplied token against the secret, allowing ±1 step of clock
// drift. Constant-time-ish compare per candidate.
function verifyToken(secret, token, { window = 1, step = 30 } = {}) {
  if (!secret || !token) return false;
  const clean = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const secretBuf = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const candidate = hotp(secretBuf, counter + w);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
  }
  return false;
}

// otpauth:// URI for authenticator apps (Google Authenticator, Authy, 1Password).
function otpauthURI(secret, { account, issuer = '1-Desk' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Recovery codes ───────────────────────────────────────────────────────────
// One-time backup codes for when the authenticator device is lost. We store only
// SHA-256 hashes; the plaintext is shown to the user exactly once.

function normalizeRecovery(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashRecovery(code) {
  return crypto.createHash('sha256').update(normalizeRecovery(code)).digest('hex');
}

// Generate N human-friendly codes like "A1B2C-D3E4F" (10 chars, base32 alphabet
// minus ambiguous chars). Returns { codes: [plaintext], hashes: [sha256] }.
function generateRecoveryCodes(n = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const codes = [];
  for (let i = 0; i < n; i++) {
    const bytes = crypto.randomBytes(10);
    let raw = '';
    for (const b of bytes) raw += alphabet[b % alphabet.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return { codes, hashes: codes.map(hashRecovery) };
}

module.exports = {
  generateSecret, verifyToken, otpauthURI, base32Encode, base32Decode,
  generateRecoveryCodes, hashRecovery, normalizeRecovery
};
