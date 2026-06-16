-- Two-factor auth (TOTP) for user accounts
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twofa_secret" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twofa_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twofa_recovery" JSONB NOT NULL DEFAULT '[]';
