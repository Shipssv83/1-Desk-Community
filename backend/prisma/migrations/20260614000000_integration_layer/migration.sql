-- Integration / tenancy / CRM-sync layer
-- Idempotent where practical so re-running on partially-migrated envs is safe.

-- ── Organization: per-org entitlement overrides ───────────────────
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "entitlements" JSONB;

-- ── Inbox: routing policy + default integrations ──────────────────
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "agent_integration_id" UUID;
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "workflow_integration_id" UUID;
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "crm_integration_id" UUID;
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "routing_policy" JSONB NOT NULL DEFAULT '{}';

-- ── integrations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "integrations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_org_id_provider_name_key" ON "integrations"("org_id", "provider", "name");
CREATE INDEX IF NOT EXISTS "integrations_org_id_idx" ON "integrations"("org_id");
CREATE INDEX IF NOT EXISTS "integrations_org_id_kind_idx" ON "integrations"("org_id", "kind");

-- ── crm_mappings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "crm_mappings" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "entity" VARCHAR(20) NOT NULL,
    "base_uuid" VARCHAR(255) NOT NULL,
    "table_name" VARCHAR(255) NOT NULL,
    "field_map" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_mappings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_mappings_org_id_entity_key" ON "crm_mappings"("org_id", "entity");
CREATE INDEX IF NOT EXISTS "crm_mappings_org_id_idx" ON "crm_mappings"("org_id");

-- ── crm_links (idempotent local↔external row mapping) ──────────────
CREATE TABLE IF NOT EXISTS "crm_links" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "entity" VARCHAR(20) NOT NULL,
    "local_type" VARCHAR(20) NOT NULL,
    "local_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_row_id" VARCHAR(255) NOT NULL,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_links_org_id_entity_local_type_local_id_key" ON "crm_links"("org_id", "entity", "local_type", "local_id");
CREATE INDEX IF NOT EXISTS "crm_links_org_id_idx" ON "crm_links"("org_id");
CREATE INDEX IF NOT EXISTS "crm_links_external_row_id_idx" ON "crm_links"("external_row_id");

-- ── lead_qualifications ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lead_qualifications" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "conversation_id" UUID,
    "score" INTEGER,
    "stage" VARCHAR(40),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "source" VARCHAR(40),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_qualifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "lead_qualifications_org_id_idx" ON "lead_qualifications"("org_id");
CREATE INDEX IF NOT EXISTS "lead_qualifications_contact_id_idx" ON "lead_qualifications"("contact_id");

-- ── webhook_events (inbound idempotency) ──────────────────────────
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "source" VARCHAR(40) NOT NULL,
    "dedupe_key" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_source_dedupe_key_key" ON "webhook_events"("source", "dedupe_key");
CREATE INDEX IF NOT EXISTS "webhook_events_org_id_idx" ON "webhook_events"("org_id");

-- ── integration_dispatches (outbound idempotency + retries) ───────
CREATE TABLE IF NOT EXISTS "integration_dispatches" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "integration_id" UUID,
    "kind" VARCHAR(20) NOT NULL,
    "idempotency_key" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "request" JSONB NOT NULL DEFAULT '{}',
    "response" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_dispatches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_dispatches_org_id_idempotency_key_key" ON "integration_dispatches"("org_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "integration_dispatches_org_id_idx" ON "integration_dispatches"("org_id");
CREATE INDEX IF NOT EXISTS "integration_dispatches_status_idx" ON "integration_dispatches"("status");

-- ── Foreign keys ──────────────────────────────────────────────────
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_mappings" ADD CONSTRAINT "crm_mappings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_mappings" ADD CONSTRAINT "crm_mappings_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_links" ADD CONSTRAINT "crm_links_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_qualifications" ADD CONSTRAINT "lead_qualifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_dispatches" ADD CONSTRAINT "integration_dispatches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
