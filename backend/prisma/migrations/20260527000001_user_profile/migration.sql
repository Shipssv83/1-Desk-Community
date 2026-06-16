-- AlterTable: add profile fields to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" TEXT;
