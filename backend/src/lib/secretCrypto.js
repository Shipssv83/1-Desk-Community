const crypto = require('crypto');
const env = require('../config/env');

// AES-256-GCM encryption for integration credentials at rest. The 32-byte key
// is derived from INTEGRATION_ENC_KEY (or JWT_SECRET fallback) via SHA-256 so
// any-length secret works. Ciphertext format: "v1:<iv>:<tag>:<data>" (base64).
const KEY = crypto.createHash('sha256').update(String(env.integrationEncKey || '')).digest();
const PREFIX = 'v1';

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(ciphertext) {
  if (!ciphertext) return '';
  const parts = String(ciphertext).split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    // Not encrypted with this scheme (legacy/plaintext) — return as-is.
    return ciphertext;
  }
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const data = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// Encrypt every value of a credentials object. Keys stay clear (they're field
// names like "api_token"), values are encrypted.
function encryptCredentials(creds = {}) {
  const out = {};
  for (const [k, v] of Object.entries(creds || {})) out[k] = encrypt(v);
  return out;
}

function decryptCredentials(creds = {}) {
  const out = {};
  for (const [k, v] of Object.entries(creds || {})) out[k] = decrypt(v);
  return out;
}

// For API responses: replace each credential value with a boolean presence flag
// so the UI can show "configured" without ever returning the secret.
function maskCredentials(creds = {}) {
  const out = {};
  for (const k of Object.keys(creds || {})) out[k] = creds[k] ? true : false;
  return out;
}

module.exports = {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  maskCredentials
};
