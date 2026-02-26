// =============================================================================
// E2E Global Setup — Seed la base de données avec le scénario Famille Dubois
// Requiert : Docker postgres + redis en cours d'exécution
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function setup() {
  // Appliquer les migrations
  console.log("[E2E setup] Applying migrations...");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });

  // Nettoyer les données existantes (ordre inverse des dépendances)
  console.log("[E2E setup] Cleaning existing data...");
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.event.deleteMany();
  await prisma.step.deleteMany();
  await prisma.orderLine.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.lastMileDelivery.deleteMany();
  await prisma.installation.deleteMany();
  await prisma.consolidation.deleteMany();
  await prisma.projectNote.deleteMany();
  await prisma.projectExternalRef.deleteMany();
  await prisma.project.deleteMany();
  await prisma.anomalyRule.deleteMany();
  await prisma.user.deleteMany();

  // ── Seed — User admin ───────────────────────────────────────────────────
  console.log("[E2E setup] Seeding admin user...");
  const passwordHash = await bcrypt.hash("admin-password", 10);
  await prisma.user.create({
    data: {
      id: "user-admin-001",
      email: "admin@plo.local",
      name: "Admin E2E",
      role: "admin",
      password_hash: passwordHash,
    },
  });

  // ── Seed — Anomaly Rule (pour ANO-16) ─────────────────────────────────
  console.log("[E2E setup] Seeding anomaly rules...");
  await prisma.anomalyRule.create({
    data: {
      id: "d1b00009-0000-0000-0000-000000000016",
      name: "ETA Shipment dépasse date de livraison promise",
      scope: "order",
      step_type: "shipment_eta_exceeded",
      severity: "critical",
      condition: { event_type: "shipment.eta_updated" },
      action: { notify: ["coordinateur"] },
      active: true,
    },
  });

  // ── Seed — Projet Famille Dubois ────────────────────────────────────────
  console.log("[E2E setup] Seeding Famille Dubois project...");
  const project = await prisma.project.create({
    data: {
      id: "proj-dubois-001",
      customer_id: "CLI-DUBOIS-2024",
      project_type: "kitchen",
      channel_origin: "store",
      status: "active",
      tracking_token: "dubois-2024-suivi",
    },
  });

  await prisma.projectExternalRef.create({
    data: {
      project_id: project.id,
      source: "erp",
      ref: "DUBOIS-2024",
    },
  });

  // ── Seed — 2 Commandes ───────────────────────────────────────────────────
  const order1 = await prisma.order.create({
    data: {
      id: "ord-dubois-001",
      project_id: project.id,
      erp_order_ref: "ERP-DUBOIS-CMD-01",
      status: "confirmed",
      promised_delivery_date: new Date(Date.now() + 10 * 86_400_000),
    },
  });

  const order2 = await prisma.order.create({
    data: {
      id: "ord-dubois-002",
      project_id: project.id,
      erp_order_ref: "ERP-DUBOIS-CMD-02",
      status: "in_fulfillment",
      promised_delivery_date: new Date(Date.now() + 12 * 86_400_000),
    },
  });

  // ── Seed — Shipment arrivé pour order1 ───────────────────────────────────
  await prisma.shipment.create({
    data: {
      order_id: order1.id,
      carrier: "DPD",
      carrier_tracking_ref: "DPD-TRK-001",
      status: "arrived",
      estimated_arrival: new Date(Date.now() + 5 * 86_400_000),
      actual_arrival: new Date(Date.now() - 1 * 86_400_000),
    },
  });

  // ── Seed — Consolidation in_progress (1 sur 2 arrivée) ──────────────────
  await prisma.consolidation.create({
    data: {
      project_id: project.id,
      station_id: "STATION-IDF-01",
      status: "in_progress",
      orders_required: [order1.id, order2.id],
      orders_arrived: [order1.id],
      partial_delivery_approved: false,
    },
  });

  // ── Seed — Event + Notification ANO-16 ───────────────────────────────────
  const event = await prisma.event.create({
    data: {
      id: "evt-dubois-ano16",
      project_id: project.id,
      order_id: order1.id,
      event_type: "shipment.eta_updated",
      source: "oms",
      source_ref: "OMS-EVT-DUBOIS-001",
      severity: "critical",
      payload: {
        new_eta: new Date(Date.now() + 15 * 86_400_000).toISOString(),
        shipment_id: "SHIP-001",
      },
      processed_at: new Date(),
    },
  });

  await prisma.notification.create({
    data: {
      id: "notif-dubois-ano16",
      project_id: project.id,
      event_id: event.id,
      rule_id: "d1b00009-0000-0000-0000-000000000016",
      recipient: "coordinateur@example.fr",
      subject: "[PLO] ETA dépasse livraison promise",
      body_html: "<p>Test</p>",
      body_text: "Test",
      status: "sent",
      sent_at: new Date(),
    },
  });

  console.log("[E2E setup] Seed complete ✓");
}

export async function teardown() {
  console.log("[E2E teardown] Disconnecting Prisma...");
  await prisma.$disconnect();
}
