-- CreateEnum
CREATE TYPE "Role" AS ENUM ('super_admin', 'tenant_admin', 'agent', 'viewer', 'end_user');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('email', 'telegram', 'livechat', 'whatsapp_stub');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('new', 'ai', 'handoff', 'human', 'done', 'closed');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('end_user', 'eva', 'agent', 'system');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('synced', 'pending_confirmation', 'stale');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('community', 'formal', 'concise');

-- CreateEnum
CREATE TYPE "RoutingLayer" AS ENUM ('l1', 'l2', 'l3', 'handoff');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "ChannelType" NOT NULL,
    "config_encrypted" JSONB,
    "status" "ChannelStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "end_users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "external_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "telegram_id" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "end_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "end_user_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'new',
    "assignee_user_id" UUID,
    "locked_by_user_id" UUID,
    "locked_at" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "ai_confidence" DOUBLE PRECISION,
    "handoff_reason" TEXT,
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sender_type" "SenderType" NOT NULL,
    "sender_user_id" UUID,
    "body" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "external_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "event_type" TEXT NOT NULL,
    "from_status" "TicketStatus",
    "to_status" "TicketStatus",
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_answers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trigger_keywords" TEXT[],
    "locale" TEXT NOT NULL,
    "answer_body" TEXT NOT NULL,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "label_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_articles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "tags" TEXT[],
    "source_ref" TEXT,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'synced',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eva_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "l1_enabled" BOOLEAN NOT NULL DEFAULT true,
    "l2_enabled" BOOLEAN NOT NULL DEFAULT true,
    "l3_enabled" BOOLEAN NOT NULL DEFAULT true,
    "l3_model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "handoff_confidence_threshold" INTEGER NOT NULL DEFAULT 62,
    "tone" "Tone" NOT NULL DEFAULT 'community',
    "languages" TEXT[] DEFAULT ARRAY['zh', 'en', 'ms']::TEXT[],
    "signature" TEXT NOT NULL DEFAULT 'EVA',

    CONSTRAINT "eva_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message_id" UUID,
    "layer" "RoutingLayer" NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "channels_tenant_id_idx" ON "channels"("tenant_id");

-- CreateIndex
CREATE INDEX "channels_status_idx" ON "channels"("status");

-- CreateIndex
CREATE INDEX "end_users_tenant_id_idx" ON "end_users"("tenant_id");

-- CreateIndex
CREATE INDEX "end_users_email_idx" ON "end_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "end_users_tenant_id_external_key_key" ON "end_users"("tenant_id", "external_key");

-- CreateIndex
CREATE INDEX "tickets_tenant_id_idx" ON "tickets"("tenant_id");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_channel_id_idx" ON "tickets"("channel_id");

-- CreateIndex
CREATE INDEX "tickets_end_user_id_idx" ON "tickets"("end_user_id");

-- CreateIndex
CREATE INDEX "tickets_assignee_user_id_idx" ON "tickets"("assignee_user_id");

-- CreateIndex
CREATE INDEX "tickets_updated_at_idx" ON "tickets"("updated_at");

-- CreateIndex
CREATE INDEX "tickets_tenant_id_status_idx" ON "tickets"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "messages_ticket_id_idx" ON "messages"("ticket_id");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_external_message_id_key" ON "messages"("external_message_id");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_idx" ON "ticket_events"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_events_created_at_idx" ON "ticket_events"("created_at");

-- CreateIndex
CREATE INDEX "label_answers_tenant_id_idx" ON "label_answers"("tenant_id");

-- CreateIndex
CREATE INDEX "label_answers_is_active_idx" ON "label_answers"("is_active");

-- CreateIndex
CREATE INDEX "kb_articles_tenant_id_idx" ON "kb_articles"("tenant_id");

-- CreateIndex
CREATE INDEX "kb_articles_sync_status_idx" ON "kb_articles"("sync_status");

-- CreateIndex
CREATE INDEX "kb_articles_updated_at_idx" ON "kb_articles"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "eva_configs_tenant_id_key" ON "eva_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "routing_logs_tenant_id_idx" ON "routing_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "routing_logs_ticket_id_idx" ON "routing_logs"("ticket_id");

-- CreateIndex
CREATE INDEX "routing_logs_layer_idx" ON "routing_logs"("layer");

-- CreateIndex
CREATE INDEX "routing_logs_created_at_idx" ON "routing_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "end_users" ADD CONSTRAINT "end_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_end_user_id_fkey" FOREIGN KEY ("end_user_id") REFERENCES "end_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_locked_by_user_id_fkey" FOREIGN KEY ("locked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_answers" ADD CONSTRAINT "label_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eva_configs" ADD CONSTRAINT "eva_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_logs" ADD CONSTRAINT "routing_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_logs" ADD CONSTRAINT "routing_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
