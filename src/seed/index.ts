// =============================================================================
// PLO — Seed de démonstration
// Scénario : Projet cuisine "Famille Dubois" avec anomalie active (ANO-16)
//
// Idempotent : deleteMany en début de script pour éviter les doublons.
// Exécution : pnpm tsx src/seed/index.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { validateStep } from "../lib/validators.js";
import { RULE_IDS } from "../anomaly/rule-ids.js";

const prisma = new PrismaClient({
  log: ["warn", "error"],
});

// =============================================================================
// IDs fixes pour garantir l'idempotence
// =============================================================================

const IDS = {
  project: "d1b00001-0000-0000-0000-000000000001",

  // External refs
  extRefErp: "d1b00002-0000-0000-0000-000000000001",
  extRefCrm: "d1b00002-0000-0000-0000-000000000002",

  // Orders
  orderA: "d1b00003-0000-0000-0000-000000000001", // CMD-A : 4 lignes, Lyon 7ème
  orderB: "d1b00003-0000-0000-0000-000000000002", // CMD-B : 2 lignes, même adresse

  // OrderLines CMD-A
  lineA1: "d1b00004-0000-0000-0000-000000000001",
  lineA2: "d1b00004-0000-0000-0000-000000000002",
  lineA3: "d1b00004-0000-0000-0000-000000000003",
  lineA4: "d1b00004-0000-0000-0000-000000000004",
  // OrderLines CMD-B
  lineB1: "d1b00004-0000-0000-0000-000000000005",
  lineB2: "d1b00004-0000-0000-0000-000000000006",

  // Shipments
  // CMD-A : leg 1 entrepôt → cross-dock Mâcon
  shipmentA1: "d1b00005-0000-0000-0000-000000000001",
  // CMD-A : leg 2 cross-dock Mâcon → station Lyon
  shipmentA2: "d1b00005-0000-0000-0000-000000000002",
  // CMD-B : leg 1 direct magasin → station Lyon
  shipmentB1: "d1b00005-0000-0000-0000-000000000003",

  // Consolidation
  consolidation: "d1b00006-0000-0000-0000-000000000001",

  // Steps
  stepProjectInspiration:   "d1b00007-0000-0000-0000-000000000001",
  stepProjectQuoteProducts: "d1b00007-0000-0000-0000-000000000002",
  stepProjectConsolidation: "d1b00007-0000-0000-0000-000000000003",

  stepOrderAConfirmed: "d1b00007-0000-0000-0000-000000000004",
  stepOrderAStock:     "d1b00007-0000-0000-0000-000000000005",
  stepOrderAPicking:   "d1b00007-0000-0000-0000-000000000006",
  stepOrderAShipment:  "d1b00007-0000-0000-0000-000000000007",

  stepOrderBConfirmed: "d1b00007-0000-0000-0000-000000000008",
  stepOrderBStock:     "d1b00007-0000-0000-0000-000000000009",
  stepOrderBPicking:   "d1b00007-0000-0000-0000-000000000010",
  stepOrderBShipment:  "d1b00007-0000-0000-0000-000000000011",

  // Events
  evtInspiration:       "d1b00008-0000-0000-0000-000000000001",
  evtQuoteAccepted:     "d1b00008-0000-0000-0000-000000000002",
  evtOrderAConfirmed:   "d1b00008-0000-0000-0000-000000000003",
  evtOrderAStock:       "d1b00008-0000-0000-0000-000000000004",
  evtOrderAPicking:     "d1b00008-0000-0000-0000-000000000005",
  evtShipmentA1:        "d1b00008-0000-0000-0000-000000000006",
  evtShipmentA2EtaUpd:  "d1b00008-0000-0000-0000-000000000007",
  evtOrderBConfirmed:   "d1b00008-0000-0000-0000-000000000008",
  evtOrderBStock:       "d1b00008-0000-0000-0000-000000000009",
  evtOrderBPicking:     "d1b00008-0000-0000-0000-000000000010",
  evtShipmentB1:        "d1b00008-0000-0000-0000-000000000011",
  evtShipmentB1Arrived: "d1b00008-0000-0000-0000-000000000012",
  evtConsolidation:     "d1b00008-0000-0000-0000-000000000013",

  // AnomalyRule — ID stable cohérent avec RULE_IDS.ANO_16
  ruleAno16: RULE_IDS.ANO_16,

  // Notification
  notifAno16: "d1b00010-0000-0000-0000-000000000001",
};

// Adresse commune Lyon 7ème
const ADRESSE_LYON_7 = {
  street: "14 rue de la Guillotière",
  city: "Lyon",
  zip: "69007",
  country: "FR",
  floor: "3",
  access_code: "1407B",
};

const NOW = new Date();
const daysFromNow = (n: number) =>
  new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const hoursAgo = (n: number) =>
  new Date(NOW.getTime() - n * 60 * 60 * 1000);

// =============================================================================
// Script principal
// =============================================================================

async function main() {
  console.log("🌱 PLO Seed — Scénario Famille Dubois");
  console.log("══════════════════════════════════════");

  // -----------------------------------------------------------------------
  // 0. Nettoyage pour idempotence (ordre respectant les FK)
  // -----------------------------------------------------------------------
  console.log("\n0. Nettoyage des données existantes...");

  await prisma.notification.deleteMany({
    where: { id: IDS.notifAno16 },
  });
  await prisma.anomalyRule.deleteMany({
    where: { id: { in: Object.values(RULE_IDS) } },
  });
  await prisma.event.deleteMany({
    where: { project_id: IDS.project },
  });
  await prisma.step.deleteMany({
    where: {
      OR: [
        { project_id: IDS.project },
        { order_id: { in: [IDS.orderA, IDS.orderB] } },
      ],
    },
  });
  await prisma.shipment.deleteMany({
    where: { project_id: IDS.project },
  });
  await prisma.orderLine.deleteMany({
    where: { order_id: { in: [IDS.orderA, IDS.orderB] } },
  });
  await prisma.order.deleteMany({
    where: { project_id: IDS.project },
  });
  await prisma.lastMileDelivery.deleteMany({
    where: { project_id: IDS.project },
  });
  await prisma.consolidation.deleteMany({
    where: { project_id: IDS.project },
  });
  await prisma.installation.deleteMany({
    where: { project_id: IDS.project },
  });
  await prisma.projectExternalRef.deleteMany({
    where: { project_id: IDS.project },
  });
  await prisma.project.deleteMany({
    where: { id: IDS.project },
  });

  console.log("   ✓ Nettoyage terminé");

  // -----------------------------------------------------------------------
  // 1. Project — Dossier Famille Dubois
  // -----------------------------------------------------------------------
  console.log("\n1. Création du Project (cuisine Famille Dubois)...");

  await prisma.project.create({
    data: {
      id: IDS.project,
      channel_origin: "mixed",
      store_id: "STORE-LYO-07",
      customer_id: "CRM-DUBOIS-2025",
      project_type: "kitchen",
      status: "active",
      metadata: {
        project_name: "Cuisine Famille Dubois",
        contact_email: "jean.dubois@email.fr",
        contact_phone: "+33 6 12 34 56 78",
        estimated_budget: 18500,
        notes: "Projet cuisine complète avec îlot central — client prioritaire",
      },
    },
  });

  console.log("   ✓ Project créé");

  // -----------------------------------------------------------------------
  // 2. ProjectExternalRef — Mapping cross-systèmes
  // -----------------------------------------------------------------------
  console.log("\n2. Création des références externes...");

  await prisma.projectExternalRef.createMany({
    data: [
      {
        id: IDS.extRefErp,
        project_id: IDS.project,
        source: "erp",
        ref: "ERP-CMD-2025-98765",
      },
      {
        id: IDS.extRefCrm,
        project_id: IDS.project,
        source: "crm",
        ref: "CRM-DOSS-LYO-2025-441",
      },
    ],
  });

  console.log("   ✓ 2 références externes créées (ERP + CRM)");

  // -----------------------------------------------------------------------
  // 3. Orders
  // -----------------------------------------------------------------------
  console.log("\n3. Création des commandes...");

  // CMD-A : 4 lignes, dont 1 en shortage
  await prisma.order.create({
    data: {
      id: IDS.orderA,
      project_id: IDS.project,
      erp_order_ref: "ERP-CMD-2025-98765-A",
      ecommerce_order_ref: "ECOM-CART-789456",
      status: "in_fulfillment",
      delivery_address: ADRESSE_LYON_7,
      installation_required: true,
      lead_time_days: 21,
      promised_delivery_date: daysFromNow(5), // Dans 5 jours
      promised_installation_date: daysFromNow(9),
      metadata: {
        warehouse_origin: "WH-VILLEFRANCHE",
        priority: "normal",
      },
    },
  });

  // CMD-B : 2 lignes, même adresse, livraison directe magasin
  await prisma.order.create({
    data: {
      id: IDS.orderB,
      project_id: IDS.project,
      erp_order_ref: "ERP-CMD-2025-98765-B",
      status: "in_fulfillment",
      delivery_address: ADRESSE_LYON_7,
      installation_required: true,
      lead_time_days: 14,
      promised_delivery_date: daysFromNow(5),
      promised_installation_date: daysFromNow(9),
      metadata: {
        store_origin: "STORE-LYO-07",
        priority: "normal",
      },
    },
  });

  console.log("   ✓ 2 commandes créées (CMD-A, CMD-B)");

  // -----------------------------------------------------------------------
  // 4. OrderLines
  // -----------------------------------------------------------------------
  console.log("\n4. Création des lignes de commande...");

  // CMD-A : 4 lignes (dont lineA3 en shortage)
  await prisma.orderLine.createMany({
    data: [
      {
        id: IDS.lineA1,
        order_id: IDS.orderA,
        sku: "CUI-CAISSON-BASE-60",
        label: "Caisson de base 60cm – Chêne naturel",
        quantity: 8,
        unit_price: 89.0,
        installation_required: true,
        stock_status: "available",
      },
      {
        id: IDS.lineA2,
        order_id: IDS.orderA,
        sku: "CUI-PLAN-TRAVAIL-QUARTZ-240",
        label: "Plan de travail quartz 240cm – Blanc Statuaire",
        quantity: 1,
        unit_price: 890.0,
        installation_required: true,
        stock_status: "available",
        metadata: {
          weight_kg: 85,
          requires_lifting_equipment: true,
        },
      },
      {
        id: IDS.lineA3,
        order_id: IDS.orderA,
        sku: "CUI-ILOT-CENTRAL-120",
        label: "Îlot central 120cm – Chêne naturel",
        quantity: 1,
        unit_price: 1250.0,
        installation_required: true,
        stock_status: "shortage", // ← ANOMALIE ACTIVE
        metadata: {
          shortage_since: daysAgo(2).toISOString(),
          expected_restock_date: daysFromNow(8).toISOString(),
          shortage_note: "Rupture fournisseur — réapprovisionnement J+8",
        },
      },
      {
        id: IDS.lineA4,
        order_id: IDS.orderA,
        sku: "CUI-EVACUATION-EVIER",
        label: "Kit évacuation évier avec siphon",
        quantity: 1,
        unit_price: 34.5,
        installation_required: false,
        stock_status: "available",
      },
    ],
  });

  // CMD-B : 2 lignes (électroménager)
  await prisma.orderLine.createMany({
    data: [
      {
        id: IDS.lineB1,
        order_id: IDS.orderB,
        sku: "ELEC-FOUR-ENCASTRABLE-60",
        label: "Four encastrable 60cm – Inox – Pyrolyse",
        quantity: 1,
        unit_price: 650.0,
        installation_required: true,
        stock_status: "available",
      },
      {
        id: IDS.lineB2,
        order_id: IDS.orderB,
        sku: "ELEC-PLAQUE-INDUCTION-4F",
        label: "Plaque induction 4 foyers – 60cm",
        quantity: 1,
        unit_price: 480.0,
        installation_required: true,
        stock_status: "available",
      },
    ],
  });

  console.log("   ✓ 6 lignes créées (4 CMD-A dont 1 shortage, 2 CMD-B)");

  // -----------------------------------------------------------------------
  // 5. Shipments
  // -----------------------------------------------------------------------
  console.log("\n5. Création des shipments...");

  // CMD-A leg 1 : entrepôt Villefranche → cross-dock Mâcon (en transit)
  await prisma.shipment.create({
    data: {
      id: IDS.shipmentA1,
      order_id: IDS.orderA,
      project_id: IDS.project,
      oms_ref: "OMS-SHP-2025-A001",
      leg_number: 1,
      origin_type: "warehouse",
      origin_ref: "WH-VILLEFRANCHE",
      destination_station_id: "XDOCK-MACON",
      carrier: "GEODIS",
      carrier_tracking_ref: "GEO-2025-987001",
      status: "in_transit",
      estimated_arrival: daysFromNow(1),
      metadata: {
        nb_colis: 12,
        poids_kg: 320,
        volume_m3: 2.8,
      },
    },
  });

  // CMD-A leg 2 : cross-dock Mâcon → station Lyon (en attente)
  await prisma.shipment.create({
    data: {
      id: IDS.shipmentA2,
      order_id: IDS.orderA,
      project_id: IDS.project,
      oms_ref: "OMS-SHP-2025-A002",
      leg_number: 2,
      origin_type: "crossdock_station",
      origin_ref: "XDOCK-MACON",
      destination_station_id: "STATION-LYON-EST",
      carrier: "GEODIS",
      carrier_tracking_ref: "GEO-2025-987002",
      status: "pending",
      // ETA recalculée — dépasse la date promise : ANOMALIE ANO-16
      estimated_arrival: daysFromNow(7), // > promised_delivery_date (J+5)
      metadata: {
        nb_colis: 12,
        poids_kg: 320,
        volume_m3: 2.8,
        eta_updated_reason: "Retard cross-dock Mâcon — surcharge plateforme",
      },
    },
  });

  // CMD-B leg 1 : magasin Lyon 7 → station Lyon (ARRIVÉ)
  await prisma.shipment.create({
    data: {
      id: IDS.shipmentB1,
      order_id: IDS.orderB,
      project_id: IDS.project,
      oms_ref: "OMS-SHP-2025-B001",
      leg_number: 1,
      origin_type: "store",
      origin_ref: "STORE-LYO-07",
      destination_station_id: "STATION-LYON-EST",
      carrier: "PROPRE",
      carrier_tracking_ref: "INT-LYO07-2025-441",
      status: "arrived",
      estimated_arrival: daysAgo(1),
      actual_arrival: daysAgo(1),
      metadata: {
        nb_colis: 2,
        poids_kg: 65,
        volume_m3: 0.4,
      },
    },
  });

  console.log("   ✓ 3 shipments créés (CMD-A: 2 legs, CMD-B: 1 leg direct arrivé)");

  // -----------------------------------------------------------------------
  // 6. Consolidation
  // -----------------------------------------------------------------------
  console.log("\n6. Création de la Consolidation...");

  await prisma.consolidation.create({
    data: {
      id: IDS.consolidation,
      project_id: IDS.project,
      station_id: "STATION-LYON-EST",
      station_name: "Station Lyon Est — Bron",
      status: "in_progress",
      orders_required: [IDS.orderA, IDS.orderB],
      orders_arrived: [IDS.orderB], // CMD-B arrivée, CMD-A toujours en transit
      estimated_complete_date: daysFromNow(7), // = ETA du shipment A2 (le plus long)
      partial_delivery_approved: false,
      metadata: {
        last_oms_update: hoursAgo(2).toISOString(),
        station_contact: "station-lyon-est@logistique.fr",
      },
    },
  });

  console.log("   ✓ Consolidation créée (in_progress — 1/2 commandes arrivées)");

  // -----------------------------------------------------------------------
  // 7. Steps
  // -----------------------------------------------------------------------
  console.log("\n7. Création des Steps...");

  // Helper pour créer un step avec validation XOR
  async function createStep(data: {
    id: string;
    project_id?: string;
    order_id?: string;
    installation_id?: string;
    step_type: string;
    status: "pending" | "in_progress" | "completed" | "anomaly" | "skipped";
    expected_at?: Date;
    completed_at?: Date;
    assigned_to?: string;
    metadata?: object;
  }) {
    validateStep({
      project_id: data.project_id,
      order_id: data.order_id,
      installation_id: data.installation_id,
    });
    return prisma.step.create({ data });
  }

  // Steps niveau Project
  await createStep({
    id: IDS.stepProjectInspiration,
    project_id: IDS.project,
    step_type: "inspiration",
    status: "completed",
    completed_at: daysAgo(45),
    assigned_to: "inspiration_tool",
  });

  await createStep({
    id: IDS.stepProjectQuoteProducts,
    project_id: IDS.project,
    step_type: "quote_products",
    status: "completed",
    completed_at: daysAgo(30),
    assigned_to: "erp",
  });

  await createStep({
    id: IDS.stepProjectConsolidation,
    project_id: IDS.project,
    step_type: "consolidation_in_progress",
    status: "in_progress",
    expected_at: daysFromNow(5),
    assigned_to: "oms",
    metadata: {
      note: "En attente CMD-A — ETA dépassé (ANO-16 active)",
    },
  });

  // Steps CMD-A
  await createStep({
    id: IDS.stepOrderAConfirmed,
    order_id: IDS.orderA,
    step_type: "order_confirmed",
    status: "completed",
    completed_at: daysAgo(25),
    assigned_to: "erp",
  });

  await createStep({
    id: IDS.stepOrderAStock,
    order_id: IDS.orderA,
    step_type: "stock_check",
    status: "anomaly", // Shortage sur SKU îlot central
    completed_at: daysAgo(24),
    assigned_to: "erp",
    metadata: {
      anomaly: "Rupture SKU CUI-ILOT-CENTRAL-120",
      sku_shortage: "CUI-ILOT-CENTRAL-120",
    },
  });

  await createStep({
    id: IDS.stepOrderAPicking,
    order_id: IDS.orderA,
    step_type: "picking_preparation",
    status: "completed",
    completed_at: daysAgo(20),
    assigned_to: "erp",
    metadata: {
      note: "Picking réalisé sur produits disponibles — îlot exclu (shortage)",
    },
  });

  await createStep({
    id: IDS.stepOrderAShipment,
    order_id: IDS.orderA,
    step_type: "shipment_dispatched",
    status: "in_progress",
    expected_at: daysFromNow(5),
    assigned_to: "oms",
    metadata: {
      current_leg: 1,
      anomaly: "ETA recalculé dépasse date promise (ANO-16)",
    },
  });

  // Steps CMD-B
  await createStep({
    id: IDS.stepOrderBConfirmed,
    order_id: IDS.orderB,
    step_type: "order_confirmed",
    status: "completed",
    completed_at: daysAgo(20),
    assigned_to: "erp",
  });

  await createStep({
    id: IDS.stepOrderBStock,
    order_id: IDS.orderB,
    step_type: "stock_check",
    status: "completed",
    completed_at: daysAgo(19),
    assigned_to: "erp",
  });

  await createStep({
    id: IDS.stepOrderBPicking,
    order_id: IDS.orderB,
    step_type: "picking_preparation",
    status: "completed",
    completed_at: daysAgo(15),
    assigned_to: "erp",
  });

  await createStep({
    id: IDS.stepOrderBShipment,
    order_id: IDS.orderB,
    step_type: "shipment_arrived_at_station",
    status: "completed",
    completed_at: daysAgo(1),
    assigned_to: "oms",
  });

  console.log("   ✓ 11 Steps créés (3 projet, 4 CMD-A, 4 CMD-B)");

  // -----------------------------------------------------------------------
  // 8. Events
  // -----------------------------------------------------------------------
  console.log("\n8. Création des Events...");

  await prisma.event.createMany({
    data: [
      // Inspiration
      {
        id: IDS.evtInspiration,
        project_id: IDS.project,
        step_id: IDS.stepProjectInspiration,
        event_type: "inspiration.completed",
        source: "inspiration_tool",
        source_ref: "INSP-TOOL-2025-12345",
        severity: "info",
        payload: {
          tool: "simulateur_cuisine_v3",
          products_count: 24,
          session_duration_min: 42,
        },
        processed_at: daysAgo(45),
      },
      // Devis accepté
      {
        id: IDS.evtQuoteAccepted,
        project_id: IDS.project,
        step_id: IDS.stepProjectQuoteProducts,
        event_type: "quote_products.accepted",
        source: "erp",
        source_ref: "ERP-DEVIS-2025-98765",
        severity: "info",
        payload: {
          quote_ref: "DEVIS-2025-98765",
          total_ht: 18500,
          accepted_by: "client_digital",
        },
        processed_at: daysAgo(30),
      },
      // CMD-A confirmée
      {
        id: IDS.evtOrderAConfirmed,
        project_id: IDS.project,
        order_id: IDS.orderA,
        step_id: IDS.stepOrderAConfirmed,
        event_type: "order.confirmed",
        source: "erp",
        source_ref: "ERP-ORDER-A-CONFIRMED",
        severity: "info",
        payload: {
          order_ref: "ERP-CMD-2025-98765-A",
          lines_count: 4,
          total_ht: 10426.5,
        },
        processed_at: daysAgo(25),
      },
      // Stock shortage CMD-A
      {
        id: IDS.evtOrderAStock,
        project_id: IDS.project,
        order_id: IDS.orderA,
        step_id: IDS.stepOrderAStock,
        event_type: "stock.shortage",
        source: "erp",
        source_ref: "ERP-STOCK-CHECK-A-2025",
        severity: "warning",
        payload: {
          sku: "CUI-ILOT-CENTRAL-120",
          label: "Îlot central 120cm – Chêne naturel",
          quantity_ordered: 1,
          quantity_available: 0,
          expected_restock_date: daysFromNow(8).toISOString(),
        },
        processed_at: daysAgo(24),
      },
      // Picking CMD-A terminé
      {
        id: IDS.evtOrderAPicking,
        project_id: IDS.project,
        order_id: IDS.orderA,
        step_id: IDS.stepOrderAPicking,
        event_type: "picking.completed",
        source: "erp",
        source_ref: "ERP-PICK-A-2025-998",
        severity: "info",
        payload: {
          picked_lines: 3,
          skipped_lines: 1,
          skip_reason: "shortage",
          operator_id: "OP-WH-0042",
        },
        processed_at: daysAgo(20),
      },
      // Shipment A1 dispatché
      {
        id: IDS.evtShipmentA1,
        project_id: IDS.project,
        order_id: IDS.orderA,
        step_id: IDS.stepOrderAShipment,
        event_type: "shipment.dispatched",
        source: "oms",
        source_ref: "OMS-SHP-2025-A001-DISPATCH",
        severity: "info",
        payload: {
          shipment_id: IDS.shipmentA1,
          order_ref: "ERP-CMD-2025-98765-A",
          leg_number: 1,
          origin_type: "warehouse",
          origin_ref: "WH-VILLEFRANCHE",
          destination_station_id: "XDOCK-MACON",
          carrier: "GEODIS",
          carrier_tracking_ref: "GEO-2025-987001",
          estimated_arrival: daysFromNow(1).toISOString(),
          actual_arrival: null,
        },
        processed_at: daysAgo(18),
      },
      // Shipment A2 ETA mis à jour — dépasse la date promise → ANO-16
      {
        id: IDS.evtShipmentA2EtaUpd,
        project_id: IDS.project,
        order_id: IDS.orderA,
        step_id: IDS.stepOrderAShipment,
        event_type: "shipment.eta_updated",
        source: "oms",
        source_ref: "OMS-SHP-2025-A002-ETA-UPD",
        severity: "critical",
        payload: {
          shipment_id: IDS.shipmentA2,
          order_ref: "ERP-CMD-2025-98765-A",
          leg_number: 2,
          previous_eta: daysFromNow(4).toISOString(),
          new_eta: daysFromNow(7).toISOString(),
          promised_delivery_date: daysFromNow(5).toISOString(),
          delay_days: 2,
          reason: "Surcharge plateforme cross-dock Mâcon",
        },
        processed_at: hoursAgo(4),
      },
      // CMD-B confirmée
      {
        id: IDS.evtOrderBConfirmed,
        project_id: IDS.project,
        order_id: IDS.orderB,
        step_id: IDS.stepOrderBConfirmed,
        event_type: "order.confirmed",
        source: "erp",
        source_ref: "ERP-ORDER-B-CONFIRMED",
        severity: "info",
        payload: {
          order_ref: "ERP-CMD-2025-98765-B",
          lines_count: 2,
          total_ht: 1130.0,
        },
        processed_at: daysAgo(20),
      },
      // Stock OK CMD-B
      {
        id: IDS.evtOrderBStock,
        project_id: IDS.project,
        order_id: IDS.orderB,
        step_id: IDS.stepOrderBStock,
        event_type: "stock.check_ok",
        source: "erp",
        source_ref: "ERP-STOCK-CHECK-B-2025",
        severity: "info",
        payload: {
          lines_checked: 2,
          all_available: true,
        },
        processed_at: daysAgo(19),
      },
      // Picking CMD-B terminé
      {
        id: IDS.evtOrderBPicking,
        project_id: IDS.project,
        order_id: IDS.orderB,
        step_id: IDS.stepOrderBPicking,
        event_type: "picking.completed",
        source: "erp",
        source_ref: "ERP-PICK-B-2025-999",
        severity: "info",
        payload: {
          picked_lines: 2,
          operator_id: "OP-STORE-LYO07-012",
        },
        processed_at: daysAgo(15),
      },
      // Shipment B1 dispatché
      {
        id: IDS.evtShipmentB1,
        project_id: IDS.project,
        order_id: IDS.orderB,
        step_id: IDS.stepOrderBShipment,
        event_type: "shipment.dispatched",
        source: "oms",
        source_ref: "OMS-SHP-2025-B001-DISPATCH",
        severity: "info",
        payload: {
          shipment_id: IDS.shipmentB1,
          order_ref: "ERP-CMD-2025-98765-B",
          leg_number: 1,
          origin_type: "store",
          origin_ref: "STORE-LYO-07",
          destination_station_id: "STATION-LYON-EST",
          carrier: "PROPRE",
          carrier_tracking_ref: "INT-LYO07-2025-441",
          estimated_arrival: daysAgo(1).toISOString(),
          actual_arrival: null,
        },
        processed_at: daysAgo(3),
      },
      // Shipment B1 arrivé en station → consolidation.order_arrived
      {
        id: IDS.evtShipmentB1Arrived,
        project_id: IDS.project,
        order_id: IDS.orderB,
        step_id: IDS.stepOrderBShipment,
        event_type: "consolidation.order_arrived",
        source: "oms",
        source_ref: "OMS-CONSOL-LYO-B001-ARRIVED",
        severity: "info",
        payload: {
          consolidation_id: IDS.consolidation,
          project_ref: "ERP-CMD-2025-98765",
          station_id: "STATION-LYON-EST",
          order_id: IDS.orderB,
          arrived_at: daysAgo(1).toISOString(),
          orders_total: 2,
          orders_arrived: 1,
          orders_missing: [IDS.orderA],
        },
        processed_at: daysAgo(1),
      },
      // Consolidation in_progress
      {
        id: IDS.evtConsolidation,
        project_id: IDS.project,
        step_id: IDS.stepProjectConsolidation,
        event_type: "consolidation.eta_updated",
        source: "oms",
        source_ref: "OMS-CONSOL-LYO-ETA-UPD",
        severity: "critical",
        payload: {
          consolidation_id: IDS.consolidation,
          project_ref: "ERP-CMD-2025-98765",
          station_id: "STATION-LYON-EST",
          orders_total: 2,
          orders_arrived: 1,
          orders_missing: [IDS.orderA],
          estimated_complete_date: daysFromNow(7).toISOString(),
          status: "in_progress",
          impact: "Date livraison client impactée — passage de J+5 à J+7",
        },
        processed_at: hoursAgo(3),
      },
    ],
  });

  console.log("   ✓ 13 Events créés");

  // -----------------------------------------------------------------------
  // 9. AnomalyRules — 22 règles ANO-01 à ANO-22
  // -----------------------------------------------------------------------
  console.log("\n9. Création des 22 règles d'anomalie...");

  const anomalyRules = [
    {
      id: RULE_IDS.ANO_01,
      name: "ANO-01 — Stock manquant tardif (< 72h livraison)",
      scope: "order" as const,
      step_type: "stock_check",
      condition: { trigger_event: "stock.shortage", delay_hours: 72, reference: "promised_delivery_date" },
      severity: "critical" as const,
      action: { notify: ["coordinateur", "acheteur"], block_step: false, escalate: true },
    },
    {
      id: RULE_IDS.ANO_02,
      name: "ANO-02 — Écart picking avant départ camion",
      scope: "order" as const,
      step_type: "picking_preparation",
      condition: { trigger_event: "picking.discrepancy", require: "no_shipment_dispatched" },
      severity: "critical" as const,
      action: { notify: ["entrepot"], block_step: true, escalate: false },
    },
    {
      id: RULE_IDS.ANO_03,
      name: "ANO-03 — Produit oublié détecté après départ camion",
      scope: "order" as const,
      step_type: "shipment_dispatched",
      condition: { trigger_event: "picking.discrepancy", require: "shipment_dispatched" },
      severity: "critical" as const,
      action: { notify: ["coordinateur", "ops"], block_step: false, escalate: true },
    },
    {
      id: RULE_IDS.ANO_04,
      name: "ANO-04 — Livraison partielle alors que l'installation est dans < 48h",
      scope: "lastmile" as const,
      step_type: "lastmile_scheduled",
      condition: { trigger_event: "lastmile.partial_delivered", installation_in_hours: 48 },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], block_step: false, escalate: true },
    },
    {
      id: RULE_IDS.ANO_05,
      name: "ANO-05 — Installation planifiée sans livraison confirmée",
      scope: "installation" as const,
      step_type: "installation_scheduled",
      condition: { trigger_event: "installation.scheduled", require: "lastmile_delivered_or_consolidation_complete" },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], block_step: true, escalate: false },
    },
    {
      id: RULE_IDS.ANO_06,
      name: "ANO-06 — Problème constaté pendant installation",
      scope: "installation" as const,
      step_type: "installation_in_progress",
      condition: { trigger_event: "installation.issue" },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], block_step: false, create_sav_ticket: true },
    },
    {
      id: RULE_IDS.ANO_07,
      name: "ANO-07 — Livraison non planifiée J-5 avant installation",
      scope: "project" as const,
      step_type: "lastmile_scheduled",
      condition: { cron: "daily", check: "no_lastmile_scheduled", days_before_installation: 5 },
      severity: "warning" as const,
      action: { notify: ["coordinateur"], block_step: false, escalate: false },
    },
    {
      id: RULE_IDS.ANO_08,
      name: "ANO-08 — Picking non démarré H-8 avant livraison",
      scope: "order" as const,
      step_type: "picking_preparation",
      condition: { cron: "hourly", check: "no_picking_started", hours_before_delivery: 8 },
      severity: "warning" as const,
      action: { notify: ["entrepot"], block_step: false, escalate: false },
    },
    {
      id: RULE_IDS.ANO_09,
      name: "ANO-09 — Pas de clôture livraison H+4 après créneau",
      scope: "lastmile" as const,
      step_type: "lastmile_delivered",
      condition: { cron: "hourly", check: "no_closure_event", hours_after_slot: 4 },
      severity: "warning" as const,
      action: { notify: ["ops"], block_step: false, escalate: false },
    },
    {
      id: RULE_IDS.ANO_10,
      name: "ANO-10 — Devis pose non créé H+48 après acceptation devis produits",
      scope: "project" as const,
      step_type: "quote_installation",
      condition: { cron: "daily", check: "no_quote_installation_created", hours_after: 48 },
      severity: "warning" as const,
      action: { notify: ["coordinateur"], block_step: false, escalate: false },
    },
    {
      id: RULE_IDS.ANO_11,
      name: "ANO-11 — Installation planifiée — commandes prérequises non livrées",
      scope: "installation" as const,
      step_type: "installation_scheduled",
      condition: { trigger_event: "installation.scheduled", require: "all_prerequisite_orders_delivered" },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], block_step: true, escalate: false },
    },
    {
      id: RULE_IDS.ANO_12,
      name: "ANO-12 — Incident bloquant en installation",
      scope: "installation" as const,
      step_type: "installation_in_progress",
      condition: { trigger_event: "installation.issue", payload_field: "severity", payload_value: "blocking" },
      severity: "critical" as const,
      action: { notify: ["coordinateur", "manager"], block_step: true, create_sav_ticket: true },
    },
    {
      id: RULE_IDS.ANO_13,
      name: "ANO-13 — Technicien en retard — installation non démarrée H+2",
      scope: "installation" as const,
      step_type: "installation_in_progress",
      condition: { cron: "hourly", check: "no_installation_started", hours_after_slot: 2 },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], block_step: false, escalate: false },
    },
    {
      id: RULE_IDS.ANO_14,
      name: "ANO-14 — Compte-rendu installation non soumis H+4 après fin",
      scope: "installation" as const,
      step_type: "installation_completed",
      condition: { cron: "hourly", check: "no_report_submitted", hours_after_completion: 4 },
      severity: "warning" as const,
      action: { notify: ["coordinateur"], block_step: false, escalate: false },
    },
    {
      id: RULE_IDS.ANO_15,
      name: "ANO-15 — Refus signature client",
      scope: "installation" as const,
      step_type: "installation_completed",
      condition: { trigger_event: "installation.completed", payload_field: "customer_signature.signed", payload_value: false },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], create_crm_ticket: true, escalate: false },
    },
    {
      id: RULE_IDS.ANO_16,
      name: "ANO-16 — ETA Shipment dépasse date de livraison promise",
      scope: "order" as const,
      step_type: "shipment_dispatched",
      condition: { trigger_event: "shipment.eta_updated", reference_field: "promised_delivery_date", operator: "greater_than" },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], block_step: false, escalate: true },
    },
    {
      id: RULE_IDS.ANO_17,
      name: "ANO-17 — Consolidation incomplète J-3 avant date client",
      scope: "consolidation" as const,
      step_type: "consolidation_in_progress",
      condition: { cron: "daily", check: "consolidation_not_complete", days_before_delivery: 3 },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], block_step: false, escalate: true },
    },
    {
      id: RULE_IDS.ANO_18,
      name: "ANO-18 — Exception en delivery station",
      scope: "consolidation" as const,
      step_type: "consolidation_in_progress",
      condition: { trigger_event: "consolidation.exception" },
      severity: "critical" as const,
      action: { notify: ["coordinateur", "acheteur"], block_step: false, escalate: true },
    },
    {
      id: RULE_IDS.ANO_19,
      name: "ANO-19 — Last mile planifié sans consolidation complète",
      scope: "lastmile" as const,
      step_type: "lastmile_scheduled",
      condition: { trigger_event: "lastmile.scheduled", require: "consolidation_complete_or_partial_approved" },
      severity: "critical" as const,
      action: { notify: ["coordinateur"], block_step: true, escalate: false },
    },
    {
      id: RULE_IDS.ANO_20,
      name: "ANO-20 — Last mile partiel sans accord préalable client + installateur",
      scope: "lastmile" as const,
      step_type: "lastmile_delivered",
      condition: { trigger_event: "lastmile.partial_delivered", require: "partial_delivery_approved" },
      severity: "critical" as const,
      action: { notify: ["manager"], block_step: false, escalate: true },
    },
    {
      id: RULE_IDS.ANO_21,
      name: "ANO-21 — Silence OMS >24h sur expédition en transit",
      scope: "order" as const,
      step_type: "shipment_in_transit",
      condition: { cron: "hourly", check: "no_oms_event", hours_silence: 24 },
      severity: "warning" as const,
      action: { notify: ["ops"], block_step: false, escalate: false },
    },
    {
      id: RULE_IDS.ANO_22,
      name: "ANO-22 — Échec livraison last mile",
      scope: "lastmile" as const,
      step_type: "lastmile_delivered",
      condition: { trigger_event: "lastmile.failed" },
      severity: "critical" as const,
      action: { notify: ["coordinateur", "ops"], block_step: false, escalate: true },
    },
  ];

  await prisma.anomalyRule.createMany({
    data: anomalyRules,
  });

  console.log(`   ✓ ${anomalyRules.length} règles d'anomalie créées (ANO-01 à ANO-22)`);

  // -----------------------------------------------------------------------
  // 10. Notification
  // -----------------------------------------------------------------------
  console.log("\n10. Création de la Notification ANO-16...");

  await prisma.notification.create({
    data: {
      id: IDS.notifAno16,
      project_id: IDS.project,
      order_id: IDS.orderA,
      event_id: IDS.evtShipmentA2EtaUpd,
      rule_id: IDS.ruleAno16,
      channel: "internal_alert",
      recipient: "coordinateur_ops@plo.internal",
      status: "pending",
    },
  });

  console.log("   ✓ Notification ANO-16 créée (status: pending)");

  // -----------------------------------------------------------------------
  // Résumé
  // -----------------------------------------------------------------------
  console.log("\n══════════════════════════════════════");
  console.log("✅ Seed terminé avec succès !");
  console.log("\nScénario Famille Dubois :");
  console.log("  • 1 Project (kitchen, active, mixed channel)");
  console.log("  • 2 ProjectExternalRef (ERP + CRM)");
  console.log("  • 2 Orders (CMD-A + CMD-B)");
  console.log("  • 6 OrderLines (dont 1 shortage sur îlot central)");
  console.log("  • 3 Shipments (CMD-A: 2 legs cross-dock, CMD-B: 1 leg direct arrivé)");
  console.log("  • 1 Consolidation (in_progress — 1/2 commandes arrivées en station)");
  console.log("  • 11 Steps");
  console.log("  • 13 Events (erp, oms, manual)");
  console.log("  • 22 AnomalyRules (ANO-01 à ANO-22 — 14 temps réel, 8 cron)");
  console.log("  • 1 Notification (internal_alert, pending)");
  console.log("\n🔍 Visualiser : pnpm prisma studio");
}

main()
  .catch((e) => {
    console.error("\n❌ Erreur pendant le seed :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
