-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'on_hold', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('kitchen', 'bathroom', 'energy_renovation', 'other');

-- CreateEnum
CREATE TYPE "ChannelOrigin" AS ENUM ('store', 'web', 'mixed');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'confirmed', 'in_fulfillment', 'delivered', 'installed', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('available', 'shortage', 'backordered');

-- CreateEnum
CREATE TYPE "OriginType" AS ENUM ('warehouse', 'store', 'supplier', 'crossdock_station');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('pending', 'dispatched', 'in_transit', 'arrived', 'exception');

-- CreateEnum
CREATE TYPE "ConsolidationStatus" AS ENUM ('waiting', 'in_progress', 'complete', 'partial_approved');

-- CreateEnum
CREATE TYPE "LastMileStatus" AS ENUM ('pending', 'scheduled', 'in_transit', 'delivered', 'failed', 'partial_delivered');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'in_progress', 'completed', 'anomaly', 'skipped');

-- CreateEnum
CREATE TYPE "EventSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('erp', 'oms', 'tms', 'tms_lastmile', 'wfm', 'crm', 'ecommerce', 'inspiration_tool', 'manual');

-- CreateEnum
CREATE TYPE "AnomalyScope" AS ENUM ('project', 'order', 'consolidation', 'lastmile', 'installation');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('warning', 'critical');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'crm_ticket', 'internal_alert');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "channel_origin" "ChannelOrigin" NOT NULL,
    "store_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "project_type" "ProjectType" NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_external_refs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_external_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "erp_order_ref" TEXT,
    "ecommerce_order_ref" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "delivery_address" JSONB NOT NULL,
    "installation_address" JSONB,
    "installation_required" BOOLEAN NOT NULL DEFAULT false,
    "lead_time_days" INTEGER,
    "promised_delivery_date" TIMESTAMP(3),
    "promised_installation_date" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "installation_required" BOOLEAN NOT NULL DEFAULT false,
    "stock_status" "StockStatus" NOT NULL DEFAULT 'available',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "oms_ref" TEXT,
    "leg_number" INTEGER NOT NULL DEFAULT 1,
    "origin_type" "OriginType" NOT NULL,
    "origin_ref" TEXT NOT NULL,
    "destination_station_id" TEXT NOT NULL,
    "carrier" TEXT,
    "carrier_tracking_ref" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'pending',
    "estimated_arrival" TIMESTAMP(3),
    "actual_arrival" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consolidations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "station_name" TEXT NOT NULL,
    "status" "ConsolidationStatus" NOT NULL DEFAULT 'waiting',
    "orders_required" TEXT[],
    "orders_arrived" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_complete_date" TIMESTAMP(3),
    "partial_delivery_approved" BOOLEAN NOT NULL DEFAULT false,
    "partial_approved_by" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consolidations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "last_mile_deliveries" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "consolidation_id" TEXT NOT NULL,
    "tms_delivery_ref" TEXT,
    "carrier" TEXT,
    "status" "LastMileStatus" NOT NULL DEFAULT 'pending',
    "delivery_address" JSONB NOT NULL,
    "scheduled_date" TIMESTAMP(3),
    "scheduled_slot" JSONB,
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "missing_order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "delivered_at" TIMESTAMP(3),
    "pod_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "last_mile_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "InstallationStatus" NOT NULL DEFAULT 'pending',
    "installation_address" JSONB NOT NULL,
    "scheduled_date" TIMESTAMP(3),
    "scheduled_slot" JSONB,
    "technician_id" TEXT,
    "technician_name" TEXT,
    "wfm_job_ref" TEXT,
    "orders_prerequisite" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "report" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steps" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "order_id" TEXT,
    "installation_id" TEXT,
    "step_type" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "expected_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "assigned_to" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "order_id" TEXT,
    "installation_id" TEXT,
    "step_id" TEXT,
    "event_type" TEXT NOT NULL,
    "source" "EventSource" NOT NULL,
    "source_ref" TEXT,
    "severity" "EventSeverity" NOT NULL DEFAULT 'info',
    "payload" JSONB,
    "processed_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "AnomalyScope" NOT NULL,
    "step_type" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "action" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomaly_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "order_id" TEXT,
    "installation_id" TEXT,
    "event_id" TEXT,
    "rule_id" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_external_refs_source_ref_key" ON "project_external_refs"("source", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "consolidations_project_id_key" ON "consolidations"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "last_mile_deliveries_project_id_key" ON "last_mile_deliveries"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "installations_project_id_key" ON "installations"("project_id");

-- CreateIndex
CREATE INDEX "steps_project_id_idx" ON "steps"("project_id");

-- CreateIndex
CREATE INDEX "steps_order_id_idx" ON "steps"("order_id");

-- CreateIndex
CREATE INDEX "steps_installation_id_idx" ON "steps"("installation_id");

-- CreateIndex
CREATE INDEX "steps_step_type_idx" ON "steps"("step_type");

-- CreateIndex
CREATE INDEX "events_project_id_idx" ON "events"("project_id");

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE INDEX "events_severity_idx" ON "events"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "events_source_source_ref_key" ON "events"("source", "source_ref");

-- AddForeignKey
ALTER TABLE "project_external_refs" ADD CONSTRAINT "project_external_refs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidations" ADD CONSTRAINT "consolidations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "last_mile_deliveries" ADD CONSTRAINT "last_mile_deliveries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "last_mile_deliveries" ADD CONSTRAINT "last_mile_deliveries_consolidation_id_fkey" FOREIGN KEY ("consolidation_id") REFERENCES "consolidations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installations" ADD CONSTRAINT "installations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steps" ADD CONSTRAINT "steps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steps" ADD CONSTRAINT "steps_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steps" ADD CONSTRAINT "steps_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "anomaly_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
