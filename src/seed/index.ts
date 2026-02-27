// =============================================================================
// PLO — Seed de démonstration
// Scénario : Projet cuisine "Famille Dubois" avec anomalie active (ANO-16)
//
// Idempotent : deleteMany en début de script pour éviter les doublons.
// Exécution : pnpm tsx src/seed/index.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
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

// =============================================================================
// IDs Scénario A — Famille Martin (salle de bain, completed)
// =============================================================================

const IDS_MARTIN = {
  project: "a1b00001-0000-0000-0000-000000000001",
  extRefErp: "a1b00002-0000-0000-0000-000000000001",
  extRefCrm: "a1b00002-0000-0000-0000-000000000002",
  orderA: "a1b00003-0000-0000-0000-000000000001",
  orderB: "a1b00003-0000-0000-0000-000000000002",
  lineA1: "a1b00004-0000-0000-0000-000000000001",
  lineA2: "a1b00004-0000-0000-0000-000000000002",
  lineA3: "a1b00004-0000-0000-0000-000000000003",
  lineB1: "a1b00004-0000-0000-0000-000000000004",
  lineB2: "a1b00004-0000-0000-0000-000000000005",
  shipmentA1: "a1b00005-0000-0000-0000-000000000001",
  shipmentB1: "a1b00005-0000-0000-0000-000000000002",
  consolidation: "a1b00006-0000-0000-0000-000000000001",
  lastMile: "a1b00007-1000-0000-0000-000000000001",
  installation: "a1b00007-2000-0000-0000-000000000001",
  stepProjInspiration: "a1b00007-0000-0000-0000-000000000001",
  stepProjQuote: "a1b00007-0000-0000-0000-000000000002",
  stepProjConsolidation: "a1b00007-0000-0000-0000-000000000003",
  stepProjLastmile: "a1b00007-0000-0000-0000-000000000004",
  stepProjInstallation: "a1b00007-0000-0000-0000-000000000005",
  stepOrderAConfirmed: "a1b00007-0000-0000-0000-000000000006",
  stepOrderAStock: "a1b00007-0000-0000-0000-000000000007",
  stepOrderAPicking: "a1b00007-0000-0000-0000-000000000008",
  stepOrderAShipment: "a1b00007-0000-0000-0000-000000000009",
  stepOrderBConfirmed: "a1b00007-0000-0000-0000-000000000010",
  stepOrderBStock: "a1b00007-0000-0000-0000-000000000011",
  stepOrderBPicking: "a1b00007-0000-0000-0000-000000000012",
  evtInspiration: "a1b00008-0000-0000-0000-000000000001",
  evtQuote: "a1b00008-0000-0000-0000-000000000002",
  evtOrderAConfirmed: "a1b00008-0000-0000-0000-000000000003",
  evtOrderAStock: "a1b00008-0000-0000-0000-000000000004",
  evtOrderAPicking: "a1b00008-0000-0000-0000-000000000005",
  evtShipmentA1Dispatch: "a1b00008-0000-0000-0000-000000000006",
  evtShipmentA1Arrived: "a1b00008-0000-0000-0000-000000000007",
  evtOrderBConfirmed: "a1b00008-0000-0000-0000-000000000008",
  evtOrderBStock: "a1b00008-0000-0000-0000-000000000009",
  evtShipmentB1Dispatch: "a1b00008-0000-0000-0000-000000000010",
  evtShipmentB1Arrived: "a1b00008-0000-0000-0000-000000000011",
  notifAno14: "a1b00010-0000-0000-0000-000000000001",
};

// =============================================================================
// IDs Scénario B — Famille Leclerc (cuisine, on_hold)
// =============================================================================

const IDS_LECLERC = {
  project: "b2c00001-0000-0000-0000-000000000001",
  extRefErp: "b2c00002-0000-0000-0000-000000000001",
  orderA: "b2c00003-0000-0000-0000-000000000001",
  orderB: "b2c00003-0000-0000-0000-000000000002",
  orderC: "b2c00003-0000-0000-0000-000000000003",
  lineA1: "b2c00004-0000-0000-0000-000000000001",
  lineA2: "b2c00004-0000-0000-0000-000000000002",
  lineA3: "b2c00004-0000-0000-0000-000000000003",
  lineB1: "b2c00004-0000-0000-0000-000000000004",
  lineB2: "b2c00004-0000-0000-0000-000000000005",
  lineC1: "b2c00004-0000-0000-0000-000000000006",
  lineC2: "b2c00004-0000-0000-0000-000000000007",
  shipmentA1: "b2c00005-0000-0000-0000-000000000001",
  shipmentB1: "b2c00005-0000-0000-0000-000000000002",
  consolidation: "b2c00006-0000-0000-0000-000000000001",
  stepProjInspiration: "b2c00007-0000-0000-0000-000000000001",
  stepProjQuote: "b2c00007-0000-0000-0000-000000000002",
  stepProjConsolidation: "b2c00007-0000-0000-0000-000000000003",
  stepOrderAConfirmed: "b2c00007-0000-0000-0000-000000000004",
  stepOrderAStock: "b2c00007-0000-0000-0000-000000000005",
  stepOrderAPicking: "b2c00007-0000-0000-0000-000000000006",
  stepOrderAShipment: "b2c00007-0000-0000-0000-000000000007",
  stepOrderBConfirmed: "b2c00007-0000-0000-0000-000000000008",
  stepOrderBStock: "b2c00007-0000-0000-0000-000000000009",
  stepOrderBPicking: "b2c00007-0000-0000-0000-000000000010",
  stepOrderBShipment: "b2c00007-0000-0000-0000-000000000011",
  stepOrderCConfirmed: "b2c00007-0000-0000-0000-000000000012",
  stepOrderCStock: "b2c00007-0000-0000-0000-000000000013",
  evtInspiration: "b2c00008-0000-0000-0000-000000000001",
  evtQuote: "b2c00008-0000-0000-0000-000000000002",
  evtOrderAConfirmed: "b2c00008-0000-0000-0000-000000000003",
  evtOrderAStock: "b2c00008-0000-0000-0000-000000000004",
  evtOrderAPicking: "b2c00008-0000-0000-0000-000000000005",
  evtShipmentA1Dispatch: "b2c00008-0000-0000-0000-000000000006",
  evtShipmentA1Exception: "b2c00008-0000-0000-0000-000000000007",
  evtOrderBConfirmed: "b2c00008-0000-0000-0000-000000000008",
  evtOrderBStock: "b2c00008-0000-0000-0000-000000000009",
  evtOrderBPicking: "b2c00008-0000-0000-0000-000000000010",
  evtShipmentB1Dispatch: "b2c00008-0000-0000-0000-000000000011",
  evtOrderCConfirmed: "b2c00008-0000-0000-0000-000000000012",
  evtOrderCStock: "b2c00008-0000-0000-0000-000000000013",
  evtConsolEta: "b2c00008-0000-0000-0000-000000000014",
  notifAno01: "b2c00010-0000-0000-0000-000000000001",
  notifAno17: "b2c00010-0000-0000-0000-000000000002",
  notifAno18: "b2c00010-0000-0000-0000-000000000003",
};

// =============================================================================
// IDs Scénario C — Famille Petit (rénovation énergétique, active)
// =============================================================================

const IDS_PETIT = {
  project: "c3d00001-0000-0000-0000-000000000001",
  extRefErp: "c3d00002-0000-0000-0000-000000000001",
  extRefEcom: "c3d00002-0000-0000-0000-000000000002",
  orderA: "c3d00003-0000-0000-0000-000000000001",
  lineA1: "c3d00004-0000-0000-0000-000000000001",
  lineA2: "c3d00004-0000-0000-0000-000000000002",
  lineA3: "c3d00004-0000-0000-0000-000000000003",
  lineA4: "c3d00004-0000-0000-0000-000000000004",
  stepProjQuote: "c3d00007-0000-0000-0000-000000000001",
  stepOrderAConfirmed: "c3d00007-0000-0000-0000-000000000002",
  stepOrderAStock: "c3d00007-0000-0000-0000-000000000003",
  stepOrderAPicking: "c3d00007-0000-0000-0000-000000000004",
  stepOrderAShipment: "c3d00007-0000-0000-0000-000000000005",
  evtQuote: "c3d00008-0000-0000-0000-000000000001",
  evtEcomOrder: "c3d00008-0000-0000-0000-000000000002",
  evtOrderAConfirmed: "c3d00008-0000-0000-0000-000000000003",
  evtOrderAStock: "c3d00008-0000-0000-0000-000000000004",
};

// =============================================================================
// IDs Scénario D — Famille Renaud (salle de bain, livraison partielle)
// =============================================================================

const IDS_RENAUD = {
  project: "e5f00001-0000-0000-0000-000000000001",
  extRefErp: "e5f00002-0000-0000-0000-000000000001",
  extRefCrm: "e5f00002-0000-0000-0000-000000000002",
  orderA: "e5f00003-0000-0000-0000-000000000001",
  orderB: "e5f00003-0000-0000-0000-000000000002",
  lineA1: "e5f00004-0000-0000-0000-000000000001",
  lineA2: "e5f00004-0000-0000-0000-000000000002",
  lineA3: "e5f00004-0000-0000-0000-000000000003",
  lineB1: "e5f00004-0000-0000-0000-000000000004",
  lineB2: "e5f00004-0000-0000-0000-000000000005",
  shipmentA1: "e5f00005-0000-0000-0000-000000000001",
  shipmentB1: "e5f00005-0000-0000-0000-000000000002",
  consolidation: "e5f00006-0000-0000-0000-000000000001",
  lastMile: "e5f00007-1000-0000-0000-000000000001",
  installation: "e5f00007-2000-0000-0000-000000000001",
  stepProjInspiration: "e5f00007-0000-0000-0000-000000000001",
  stepProjQuote: "e5f00007-0000-0000-0000-000000000002",
  stepProjConsolidation: "e5f00007-0000-0000-0000-000000000003",
  stepProjLastmile: "e5f00007-0000-0000-0000-000000000004",
  stepOrderAConfirmed: "e5f00007-0000-0000-0000-000000000005",
  stepOrderAStock: "e5f00007-0000-0000-0000-000000000006",
  stepOrderAPicking: "e5f00007-0000-0000-0000-000000000007",
  stepOrderAShipment: "e5f00007-0000-0000-0000-000000000008",
  stepOrderBConfirmed: "e5f00007-0000-0000-0000-000000000009",
  stepOrderBStock: "e5f00007-0000-0000-0000-000000000010",
  stepOrderBPicking: "e5f00007-0000-0000-0000-000000000011",
  stepOrderBShipment: "e5f00007-0000-0000-0000-000000000012",
  stepInstallScheduled: "e5f00007-0000-0000-0000-000000000013",
  stepLastmileAttempt: "e5f00007-0000-0000-0000-000000000014",
  evtInspiration: "e5f00008-0000-0000-0000-000000000001",
  evtQuote: "e5f00008-0000-0000-0000-000000000002",
  evtOrderAConfirmed: "e5f00008-0000-0000-0000-000000000003",
  evtOrderAStock: "e5f00008-0000-0000-0000-000000000004",
  evtOrderAPicking: "e5f00008-0000-0000-0000-000000000005",
  evtShipmentA1Dispatch: "e5f00008-0000-0000-0000-000000000006",
  evtShipmentA1Arrived: "e5f00008-0000-0000-0000-000000000007",
  evtOrderBConfirmed: "e5f00008-0000-0000-0000-000000000008",
  evtOrderBStock: "e5f00008-0000-0000-0000-000000000009",
  evtOrderBPicking: "e5f00008-0000-0000-0000-000000000010",
  evtShipmentB1Dispatch: "e5f00008-0000-0000-0000-000000000011",
  evtShipmentB1Arrived: "e5f00008-0000-0000-0000-000000000012",
  evtLastmilePartial: "e5f00008-0000-0000-0000-000000000013",
  notifAno04: "e5f00010-0000-0000-0000-000000000001",
  notifAno22: "e5f00010-0000-0000-0000-000000000002",
};

// =============================================================================
// IDs Scénario E — Famille Moreau (cuisine, completed historique)
// =============================================================================

const IDS_MOREAU = {
  project: "f6a00001-0000-0000-0000-000000000001",
  extRefErp: "f6a00002-0000-0000-0000-000000000001",
  extRefCrm: "f6a00002-0000-0000-0000-000000000002",
  orderA: "f6a00003-0000-0000-0000-000000000001",
  orderB: "f6a00003-0000-0000-0000-000000000002",
  lineA1: "f6a00004-0000-0000-0000-000000000001",
  lineA2: "f6a00004-0000-0000-0000-000000000002",
  lineA3: "f6a00004-0000-0000-0000-000000000003",
  lineB1: "f6a00004-0000-0000-0000-000000000004",
  lineB2: "f6a00004-0000-0000-0000-000000000005",
  lineB3: "f6a00004-0000-0000-0000-000000000006",
  shipmentA1: "f6a00005-0000-0000-0000-000000000001",
  shipmentB1: "f6a00005-0000-0000-0000-000000000002",
  consolidation: "f6a00006-0000-0000-0000-000000000001",
  lastMile: "f6a00007-1000-0000-0000-000000000001",
  installation: "f6a00007-2000-0000-0000-000000000001",
  stepProjInspiration: "f6a00007-0000-0000-0000-000000000001",
  stepProjQuote: "f6a00007-0000-0000-0000-000000000002",
  stepProjConsolidation: "f6a00007-0000-0000-0000-000000000003",
  stepProjLastmile: "f6a00007-0000-0000-0000-000000000004",
  stepProjInstallation: "f6a00007-0000-0000-0000-000000000005",
  stepOrderAConfirmed: "f6a00007-0000-0000-0000-000000000006",
  stepOrderAStock: "f6a00007-0000-0000-0000-000000000007",
  stepOrderAPicking: "f6a00007-0000-0000-0000-000000000008",
  stepOrderAShipment: "f6a00007-0000-0000-0000-000000000009",
  stepOrderBConfirmed: "f6a00007-0000-0000-0000-000000000010",
  stepOrderBStock: "f6a00007-0000-0000-0000-000000000011",
  stepOrderBPicking: "f6a00007-0000-0000-0000-000000000012",
  evtInspiration: "f6a00008-0000-0000-0000-000000000001",
  evtQuote: "f6a00008-0000-0000-0000-000000000002",
  evtOrderAConfirmed: "f6a00008-0000-0000-0000-000000000003",
  evtOrderAStock: "f6a00008-0000-0000-0000-000000000004",
  evtOrderAPicking: "f6a00008-0000-0000-0000-000000000005",
  evtShipmentA1Dispatch: "f6a00008-0000-0000-0000-000000000006",
  evtShipmentA1Arrived: "f6a00008-0000-0000-0000-000000000007",
  evtOrderBConfirmed: "f6a00008-0000-0000-0000-000000000008",
  evtOrderBStock: "f6a00008-0000-0000-0000-000000000009",
  evtShipmentB1Dispatch: "f6a00008-0000-0000-0000-000000000010",
};

const ALL_NEW_PROJECT_IDS = [
  IDS_MARTIN.project,
  IDS_LECLERC.project,
  IDS_PETIT.project,
  IDS_RENAUD.project,
  IDS_MOREAU.project,
];

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

  // Nettoyage des 5 nouveaux scénarios (par project_id, cascade)
  for (const pid of ALL_NEW_PROJECT_IDS) {
    await prisma.notification.deleteMany({ where: { project_id: pid } });
    await prisma.event.deleteMany({ where: { project_id: pid } });
    await prisma.step.deleteMany({ where: { project_id: pid } });
    // Steps liés aux orders de ce projet
    const orders = await prisma.order.findMany({ where: { project_id: pid }, select: { id: true } });
    const orderIds = orders.map((o: { id: string }) => o.id);
    if (orderIds.length > 0) {
      await prisma.step.deleteMany({ where: { order_id: { in: orderIds } } });
      await prisma.shipment.deleteMany({ where: { order_id: { in: orderIds } } });
      await prisma.orderLine.deleteMany({ where: { order_id: { in: orderIds } } });
    }
    // Steps liés à l'installation
    const install = await prisma.installation.findUnique({ where: { project_id: pid }, select: { id: true } });
    if (install) {
      await prisma.step.deleteMany({ where: { installation_id: install.id } });
    }
    await prisma.order.deleteMany({ where: { project_id: pid } });
    await prisma.lastMileDelivery.deleteMany({ where: { project_id: pid } });
    await prisma.consolidation.deleteMany({ where: { project_id: pid } });
    await prisma.installation.deleteMany({ where: { project_id: pid } });
    await prisma.projectExternalRef.deleteMany({ where: { project_id: pid } });
    await prisma.projectNote.deleteMany({ where: { project_id: pid } });
    await prisma.project.deleteMany({ where: { id: pid } });
  }

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
      tracking_token: "dubois-2024-suivi",  // Sprint 7 — token URL de suivi client
      assigned_to: "Admin PLO",             // Sprint 18 — assigné au seul user seedé
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
  // 11–15. Scénarios additionnels
  // -----------------------------------------------------------------------

  await seedMartin(prisma, createStep);
  console.log("\n11. ✓ Scénario Martin (salle de bain, completed)");

  await seedLeclerc(prisma, createStep);
  console.log("12. ✓ Scénario Leclerc (cuisine, on_hold, 3 anomalies)");

  await seedPetit(prisma, createStep);
  console.log("13. ✓ Scénario Petit (rénovation énergétique, active)");

  await seedRenaud(prisma, createStep);
  console.log("14. ✓ Scénario Renaud (salle de bain, livraison partielle)");

  await seedMoreau(prisma, createStep);
  console.log("15. ✓ Scénario Moreau (cuisine, completed historique)");

  // -----------------------------------------------------------------------
  // Résumé
  // -----------------------------------------------------------------------
  console.log("\n══════════════════════════════════════");
  console.log("✅ Seed terminé avec succès !");
  console.log("\n📊 Résumé — 6 projets, 12 commandes, 33 lignes");
  console.log("  1. Dubois   (kitchen, active)     — 2 cmd, 3 exp, 1 consol in_progress, 1 notif");
  console.log("  2. Martin   (bathroom, completed)  — 2 cmd, installation terminée, 1 notif ANO-14");
  console.log("  3. Leclerc  (kitchen, on_hold)     — 3 cmd, 3 anomalies actives, exception transport");
  console.log("  4. Petit    (energy_reno, active)   — 1 cmd, early stage, 0 anomalies");
  console.log("  5. Renaud   (bathroom, active)     — 2 cmd, last-mile partiel, 2 anomalies");
  console.log("  6. Moreau   (kitchen, completed)   — 2 cmd, historique 45j, 0 anomalies");
  console.log("  + 22 AnomalyRules (ANO-01 à ANO-22)");
  console.log("  + 7 Notifications (1 Dubois + 1 Martin + 3 Leclerc + 2 Renaud)");
  console.log("\n🔍 Visualiser : pnpm prisma studio");

  // -----------------------------------------------------------------------
  // Sprint 9 — Admin user (idempotent upsert)
  // -----------------------------------------------------------------------
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@plo.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (adminPassword) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { password_hash: hash, name: "Admin PLO", role: "admin" },
      create: { email: adminEmail, password_hash: hash, name: "Admin PLO", role: "admin" },
    });
    console.log(`\n9b. Admin user upserted (${adminEmail})`);
  } else {
    console.log("\n⚠  ADMIN_PASSWORD non défini — skip seedAdminUser()");
  }
}

// =============================================================================
// Scénario A — Famille Martin (salle de bain, completed)
// =============================================================================

async function seedMartin(p: typeof prisma, createStep: Function) {
  const M = IDS_MARTIN;
  const addr = { street: "22 rue de Vaugirard", city: "Paris", zip: "75015", country: "FR", floor: "2", access_code: "4521A" };

  await p.project.create({ data: { id: M.project, project_type: "bathroom", status: "completed", channel_origin: "store", store_id: "STORE-PAR-15", customer_id: "CRM-MARTIN-2025", tracking_token: "martin-2025-suivi", assigned_to: "Admin PLO", metadata: { project_name: "Salle de bain Famille Martin", contact_email: "sophie.martin@email.fr", contact_phone: "+33 6 98 76 54 32", estimated_budget: 12000 } } });

  await p.projectExternalRef.createMany({ data: [
    { id: M.extRefErp, project_id: M.project, source: "erp", ref: "ERP-CMD-2025-MARTIN" },
    { id: M.extRefCrm, project_id: M.project, source: "crm", ref: "CRM-DOSS-PAR-2025-112" },
  ] });

  await p.order.create({ data: { id: M.orderA, project_id: M.project, erp_order_ref: "ERP-CMD-2025-MARTIN-A", status: "closed", installation_required: true, lead_time_days: 14, promised_delivery_date: daysAgo(10), promised_installation_date: daysAgo(3), delivery_address: addr } });
  await p.order.create({ data: { id: M.orderB, project_id: M.project, erp_order_ref: "ERP-CMD-2025-MARTIN-B", status: "closed", installation_required: true, lead_time_days: 10, promised_delivery_date: daysAgo(10), promised_installation_date: daysAgo(3), delivery_address: addr } });

  await p.orderLine.createMany({ data: [
    { id: M.lineA1, order_id: M.orderA, sku: "SDB-MEUBLE-VASQUE-120", label: "Meuble vasque 120cm – Blanc laqué", quantity: 1, unit_price: 890, stock_status: "available" },
    { id: M.lineA2, order_id: M.orderA, sku: "SDB-COLONNE-RANGEMENT", label: "Colonne de rangement 180cm", quantity: 1, unit_price: 450, stock_status: "available" },
    { id: M.lineA3, order_id: M.orderA, sku: "SDB-MIROIR-LED-100", label: "Miroir LED 100x80cm", quantity: 1, unit_price: 320, stock_status: "available" },
    { id: M.lineB1, order_id: M.orderB, sku: "SDB-ROBINETTERIE-CASCADE", label: "Robinetterie cascade – Chrome", quantity: 2, unit_price: 185, stock_status: "available" },
    { id: M.lineB2, order_id: M.orderB, sku: "SDB-PAROI-DOUCHE-120", label: "Paroi de douche 120cm – Verre trempé", quantity: 1, unit_price: 650, stock_status: "available" },
  ] });

  await p.shipment.create({ data: { id: M.shipmentA1, order_id: M.orderA, project_id: M.project, oms_ref: "OMS-SHP-MARTIN-A001", leg_number: 1, origin_type: "warehouse", origin_ref: "WH-GENNEVILLIERS", destination_station_id: "STATION-PARIS-SUD", carrier: "DB SCHENKER", status: "arrived", estimated_arrival: daysAgo(12), actual_arrival: daysAgo(12) } });
  await p.shipment.create({ data: { id: M.shipmentB1, order_id: M.orderB, project_id: M.project, oms_ref: "OMS-SHP-MARTIN-B001", leg_number: 1, origin_type: "store", origin_ref: "STORE-PAR-15", destination_station_id: "STATION-PARIS-SUD", carrier: "PROPRE", status: "arrived", estimated_arrival: daysAgo(11), actual_arrival: daysAgo(11) } });

  await p.consolidation.create({ data: { id: M.consolidation, project_id: M.project, station_id: "STATION-PARIS-SUD", station_name: "Station Paris Sud — Ivry", status: "complete", orders_required: [M.orderA, M.orderB], orders_arrived: [M.orderA, M.orderB], estimated_complete_date: daysAgo(10) } });

  await p.lastMileDelivery.create({ data: { id: M.lastMile, project_id: M.project, consolidation_id: M.consolidation, tms_delivery_ref: "TMS-LM-MARTIN-001", carrier: "PROPRE", status: "delivered", delivery_address: addr, scheduled_date: daysAgo(8), scheduled_slot: { start: "08:00", end: "12:00" }, is_partial: false, delivered_at: daysAgo(8), pod_url: "https://pod.carrier.example/martin-2025" } });

  await p.installation.create({ data: { id: M.installation, project_id: M.project, status: "completed", installation_address: addr, scheduled_date: daysAgo(3), scheduled_slot: { start: "08:00", end: "17:00" }, technician_id: "TECH-IDF-007", technician_name: "Jean-Pierre Lavigne", wfm_job_ref: "WFM-JOB-MARTIN-001", orders_prerequisite: [M.orderA, M.orderB], started_at: daysAgo(3), completed_at: daysAgo(2), report: { technician_notes: "Pose conforme au plan. Raccords plomberie OK.", customer_signature: { signed: true, signed_at: daysAgo(2).toISOString() }, photos: 5, issues: [] } } });

  // Steps
  await createStep({ id: M.stepProjInspiration, project_id: M.project, step_type: "inspiration", status: "completed", completed_at: daysAgo(50) });
  await createStep({ id: M.stepProjQuote, project_id: M.project, step_type: "quote_products", status: "completed", completed_at: daysAgo(40) });
  await createStep({ id: M.stepProjConsolidation, project_id: M.project, step_type: "consolidation_in_progress", status: "completed", completed_at: daysAgo(10) });
  await createStep({ id: M.stepProjLastmile, project_id: M.project, step_type: "lastmile_delivered", status: "completed", completed_at: daysAgo(8) });
  await createStep({ id: M.stepProjInstallation, project_id: M.project, step_type: "installation_completed", status: "completed", completed_at: daysAgo(2) });
  await createStep({ id: M.stepOrderAConfirmed, order_id: M.orderA, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(35) });
  await createStep({ id: M.stepOrderAStock, order_id: M.orderA, step_type: "stock_check", status: "completed", completed_at: daysAgo(34) });
  await createStep({ id: M.stepOrderAPicking, order_id: M.orderA, step_type: "picking_preparation", status: "completed", completed_at: daysAgo(30) });
  await createStep({ id: M.stepOrderAShipment, order_id: M.orderA, step_type: "shipment_arrived_at_station", status: "completed", completed_at: daysAgo(12) });
  await createStep({ id: M.stepOrderBConfirmed, order_id: M.orderB, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(30) });
  await createStep({ id: M.stepOrderBStock, order_id: M.orderB, step_type: "stock_check", status: "completed", completed_at: daysAgo(29) });
  await createStep({ id: M.stepOrderBPicking, order_id: M.orderB, step_type: "picking_preparation", status: "completed", completed_at: daysAgo(25) });

  // Events
  await p.event.createMany({ data: [
    { id: M.evtInspiration, project_id: M.project, event_type: "inspiration.completed", source: "inspiration_tool", source_ref: "INSP-MARTIN-2025", severity: "info", processed_at: daysAgo(50) },
    { id: M.evtQuote, project_id: M.project, event_type: "quote_products.accepted", source: "erp", source_ref: "ERP-DEVIS-MARTIN-2025", severity: "info", processed_at: daysAgo(40) },
    { id: M.evtOrderAConfirmed, project_id: M.project, order_id: M.orderA, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-MARTIN-A", severity: "info", processed_at: daysAgo(35) },
    { id: M.evtOrderAStock, project_id: M.project, order_id: M.orderA, event_type: "stock.check_ok", source: "erp", source_ref: "ERP-STOCK-MARTIN-A", severity: "info", processed_at: daysAgo(34) },
    { id: M.evtOrderAPicking, project_id: M.project, order_id: M.orderA, event_type: "picking.completed", source: "erp", source_ref: "ERP-PICK-MARTIN-A", severity: "info", processed_at: daysAgo(30) },
    { id: M.evtShipmentA1Dispatch, project_id: M.project, order_id: M.orderA, event_type: "shipment.dispatched", source: "oms", source_ref: "OMS-SHP-MARTIN-A001-DISPATCH", severity: "info", processed_at: daysAgo(20) },
    { id: M.evtShipmentA1Arrived, project_id: M.project, order_id: M.orderA, event_type: "shipment.arrived_at_station", source: "oms", source_ref: "OMS-SHP-MARTIN-A001-ARRIVED", severity: "info", processed_at: daysAgo(12) },
    { id: M.evtOrderBConfirmed, project_id: M.project, order_id: M.orderB, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-MARTIN-B", severity: "info", processed_at: daysAgo(30) },
    { id: M.evtOrderBStock, project_id: M.project, order_id: M.orderB, event_type: "stock.check_ok", source: "erp", source_ref: "ERP-STOCK-MARTIN-B", severity: "info", processed_at: daysAgo(29) },
    { id: M.evtShipmentB1Dispatch, project_id: M.project, order_id: M.orderB, event_type: "shipment.dispatched", source: "oms", source_ref: "OMS-SHP-MARTIN-B001-DISPATCH", severity: "info", processed_at: daysAgo(15) },
    { id: M.evtShipmentB1Arrived, project_id: M.project, order_id: M.orderB, event_type: "shipment.arrived_at_station", source: "oms", source_ref: "OMS-SHP-MARTIN-B001-ARRIVED", severity: "info", processed_at: daysAgo(11) },
  ] });

  await p.notification.create({ data: { id: M.notifAno14, project_id: M.project, installation_id: M.installation, rule_id: RULE_IDS.ANO_14, channel: "internal_alert", recipient: "coordinateur_ops@plo.internal", status: "sent", sent_at: daysAgo(2) } });
}

// =============================================================================
// Scénario B — Famille Leclerc (cuisine, on_hold, 3 anomalies)
// =============================================================================

async function seedLeclerc(p: typeof prisma, createStep: Function) {
  const L = IDS_LECLERC;
  const addr = { street: "45 allée Jean Jaurès", city: "Toulouse", zip: "31000", country: "FR", floor: "4", access_code: "B312" };

  await p.project.create({ data: { id: L.project, project_type: "kitchen", status: "on_hold", channel_origin: "web", customer_id: "CRM-LECLERC-2025", tracking_token: "leclerc-2025-suivi", assigned_to: "Admin PLO", metadata: { project_name: "Cuisine Famille Leclerc", contact_email: "paul.leclerc@email.fr", contact_phone: "+33 6 55 44 33 22", estimated_budget: 22000, notes: "Projet bloqué — multiples anomalies en cours" } } });

  await p.projectExternalRef.create({ data: { id: L.extRefErp, project_id: L.project, source: "erp", ref: "ERP-CMD-2025-LECLERC" } });

  // 3 Orders
  await p.order.create({ data: { id: L.orderA, project_id: L.project, erp_order_ref: "ERP-CMD-2025-LECLERC-A", ecommerce_order_ref: "ECOM-LECLERC-A-2025", status: "in_fulfillment", installation_required: true, lead_time_days: 21, promised_delivery_date: daysAgo(5), promised_installation_date: daysFromNow(5), delivery_address: addr } });
  await p.order.create({ data: { id: L.orderB, project_id: L.project, erp_order_ref: "ERP-CMD-2025-LECLERC-B", ecommerce_order_ref: "ECOM-LECLERC-B-2025", status: "in_fulfillment", installation_required: true, lead_time_days: 14, promised_delivery_date: daysAgo(5), promised_installation_date: daysFromNow(5), delivery_address: addr } });
  await p.order.create({ data: { id: L.orderC, project_id: L.project, erp_order_ref: "ERP-CMD-2025-LECLERC-C", ecommerce_order_ref: "ECOM-LECLERC-C-2025", status: "confirmed", installation_required: true, lead_time_days: 28, promised_delivery_date: daysFromNow(15), promised_installation_date: daysFromNow(20), delivery_address: addr } });

  await p.orderLine.createMany({ data: [
    { id: L.lineA1, order_id: L.orderA, sku: "CUI-CAISSON-HAUT-80", label: "Caisson haut 80cm – Blanc mat", quantity: 6, unit_price: 120, stock_status: "available" },
    { id: L.lineA2, order_id: L.orderA, sku: "CUI-CAISSON-BAS-60", label: "Caisson bas 60cm – Blanc mat", quantity: 8, unit_price: 95, stock_status: "available" },
    { id: L.lineA3, order_id: L.orderA, sku: "CUI-CREDENCE-VERRE-200", label: "Crédence verre trempé 200cm", quantity: 1, unit_price: 380, stock_status: "backordered", metadata: { backordered_since: daysAgo(15).toISOString(), expected_restock: daysFromNow(10).toISOString() } },
    { id: L.lineB1, order_id: L.orderB, sku: "ELEC-FOUR-PYROLYSE-60", label: "Four pyrolyse 60cm – Inox", quantity: 1, unit_price: 720, stock_status: "available" },
    { id: L.lineB2, order_id: L.orderB, sku: "ELEC-HOTTE-MURALE-60", label: "Hotte murale 60cm – Inox", quantity: 1, unit_price: 350, stock_status: "shortage", metadata: { shortage_since: daysAgo(10).toISOString() } },
    { id: L.lineC1, order_id: L.orderC, sku: "CUI-PLAN-TRAVAIL-CERAMIQUE-280", label: "Plan de travail céramique 280cm", quantity: 1, unit_price: 1650, stock_status: "backordered", metadata: { backordered_since: daysAgo(18).toISOString(), expected_restock: daysFromNow(12).toISOString() } },
    { id: L.lineC2, order_id: L.orderC, sku: "CUI-ILOT-CENTRAL-150", label: "Îlot central 150cm – Blanc mat", quantity: 1, unit_price: 1890, stock_status: "backordered", metadata: { backordered_since: daysAgo(18).toISOString(), expected_restock: daysFromNow(15).toISOString() } },
  ] });

  await p.shipment.create({ data: { id: L.shipmentA1, order_id: L.orderA, project_id: L.project, oms_ref: "OMS-SHP-LECLERC-A001", leg_number: 1, origin_type: "warehouse", origin_ref: "WH-MONTAUBAN", destination_station_id: "STATION-TOULOUSE-NORD", carrier: "KUEHNE+NAGEL", carrier_tracking_ref: "KN-2025-TLS-4401", status: "exception", estimated_arrival: daysAgo(3), metadata: { exception_reason: "Accident véhicule transporteur — marchandise endommagée potentiellement", exception_at: daysAgo(2).toISOString() } } });
  await p.shipment.create({ data: { id: L.shipmentB1, order_id: L.orderB, project_id: L.project, oms_ref: "OMS-SHP-LECLERC-B001", leg_number: 1, origin_type: "warehouse", origin_ref: "WH-MONTAUBAN", destination_station_id: "STATION-TOULOUSE-NORD", carrier: "KUEHNE+NAGEL", carrier_tracking_ref: "KN-2025-TLS-4402", status: "in_transit", estimated_arrival: daysFromNow(2) } });

  await p.consolidation.create({ data: { id: L.consolidation, project_id: L.project, station_id: "STATION-TOULOUSE-NORD", station_name: "Station Toulouse Nord — Sesquières", status: "in_progress", orders_required: [L.orderA, L.orderB, L.orderC], orders_arrived: [], estimated_complete_date: daysAgo(3) } });

  // Steps
  await createStep({ id: L.stepProjInspiration, project_id: L.project, step_type: "inspiration", status: "completed", completed_at: daysAgo(40) });
  await createStep({ id: L.stepProjQuote, project_id: L.project, step_type: "quote_products", status: "completed", completed_at: daysAgo(30) });
  await createStep({ id: L.stepProjConsolidation, project_id: L.project, step_type: "consolidation_in_progress", status: "anomaly", expected_at: daysAgo(3), metadata: { anomaly: "Consolidation en retard — 0/3 commandes arrivées" } });
  await createStep({ id: L.stepOrderAConfirmed, order_id: L.orderA, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(25) });
  await createStep({ id: L.stepOrderAStock, order_id: L.orderA, step_type: "stock_check", status: "completed", completed_at: daysAgo(24) });
  await createStep({ id: L.stepOrderAPicking, order_id: L.orderA, step_type: "picking_preparation", status: "completed", completed_at: daysAgo(20) });
  await createStep({ id: L.stepOrderAShipment, order_id: L.orderA, step_type: "shipment_dispatched", status: "anomaly", expected_at: daysAgo(3), metadata: { anomaly: "Exception transporteur — accident véhicule" } });
  await createStep({ id: L.stepOrderBConfirmed, order_id: L.orderB, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(25) });
  await createStep({ id: L.stepOrderBStock, order_id: L.orderB, step_type: "stock_check", status: "anomaly", completed_at: daysAgo(24), metadata: { anomaly: "Shortage SKU ELEC-HOTTE-MURALE-60" } });
  await createStep({ id: L.stepOrderBPicking, order_id: L.orderB, step_type: "picking_preparation", status: "completed", completed_at: daysAgo(18) });
  await createStep({ id: L.stepOrderBShipment, order_id: L.orderB, step_type: "shipment_dispatched", status: "in_progress", expected_at: daysFromNow(2) });
  await createStep({ id: L.stepOrderCConfirmed, order_id: L.orderC, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(20) });
  await createStep({ id: L.stepOrderCStock, order_id: L.orderC, step_type: "stock_check", status: "anomaly", completed_at: daysAgo(18), metadata: { anomaly: "2 SKU backordered — plan de travail + îlot" } });

  // Events
  await p.event.createMany({ data: [
    { id: L.evtInspiration, project_id: L.project, event_type: "inspiration.completed", source: "inspiration_tool", source_ref: "INSP-LECLERC-2025", severity: "info", processed_at: daysAgo(40) },
    { id: L.evtQuote, project_id: L.project, event_type: "quote_products.accepted", source: "erp", source_ref: "ERP-DEVIS-LECLERC-2025", severity: "info", processed_at: daysAgo(30) },
    { id: L.evtOrderAConfirmed, project_id: L.project, order_id: L.orderA, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-LECLERC-A", severity: "info", processed_at: daysAgo(25) },
    { id: L.evtOrderAStock, project_id: L.project, order_id: L.orderA, event_type: "stock.check_ok", source: "erp", source_ref: "ERP-STOCK-LECLERC-A", severity: "info", processed_at: daysAgo(24) },
    { id: L.evtOrderAPicking, project_id: L.project, order_id: L.orderA, event_type: "picking.completed", source: "erp", source_ref: "ERP-PICK-LECLERC-A", severity: "info", processed_at: daysAgo(20) },
    { id: L.evtShipmentA1Dispatch, project_id: L.project, order_id: L.orderA, event_type: "shipment.dispatched", source: "oms", source_ref: "OMS-SHP-LECLERC-A001-DISPATCH", severity: "info", processed_at: daysAgo(8) },
    { id: L.evtShipmentA1Exception, project_id: L.project, order_id: L.orderA, event_type: "shipment.exception", source: "oms", source_ref: "OMS-SHP-LECLERC-A001-EXCEPTION", severity: "critical", processed_at: daysAgo(2), payload: { reason: "Accident véhicule transporteur", carrier: "KUEHNE+NAGEL", tracking_ref: "KN-2025-TLS-4401" } },
    { id: L.evtOrderBConfirmed, project_id: L.project, order_id: L.orderB, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-LECLERC-B", severity: "info", processed_at: daysAgo(25) },
    { id: L.evtOrderBStock, project_id: L.project, order_id: L.orderB, event_type: "stock.shortage", source: "erp", source_ref: "ERP-STOCK-LECLERC-B", severity: "warning", processed_at: daysAgo(24), payload: { sku: "ELEC-HOTTE-MURALE-60", quantity_available: 0 } },
    { id: L.evtOrderBPicking, project_id: L.project, order_id: L.orderB, event_type: "picking.completed", source: "erp", source_ref: "ERP-PICK-LECLERC-B", severity: "info", processed_at: daysAgo(18) },
    { id: L.evtShipmentB1Dispatch, project_id: L.project, order_id: L.orderB, event_type: "shipment.dispatched", source: "oms", source_ref: "OMS-SHP-LECLERC-B001-DISPATCH", severity: "info", processed_at: daysAgo(5) },
    { id: L.evtOrderCConfirmed, project_id: L.project, order_id: L.orderC, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-LECLERC-C", severity: "info", processed_at: daysAgo(20) },
    { id: L.evtOrderCStock, project_id: L.project, order_id: L.orderC, event_type: "stock.shortage", source: "erp", source_ref: "ERP-STOCK-LECLERC-C", severity: "warning", processed_at: daysAgo(18), payload: { skus_backordered: ["CUI-PLAN-TRAVAIL-CERAMIQUE-280", "CUI-ILOT-CENTRAL-150"] } },
    { id: L.evtConsolEta, project_id: L.project, event_type: "consolidation.eta_updated", source: "oms", source_ref: "OMS-CONSOL-LECLERC-ETA", severity: "critical", processed_at: daysAgo(1), payload: { consolidation_id: L.consolidation, orders_arrived: 0, orders_required: 3, estimated_complete_date_was: daysAgo(3).toISOString() } },
  ] });

  // Notifications
  await p.notification.create({ data: { id: L.notifAno01, project_id: L.project, order_id: L.orderC, event_id: L.evtOrderCStock, rule_id: RULE_IDS.ANO_01, channel: "internal_alert", recipient: "coordinateur_ops@plo.internal", status: "sent", sent_at: daysAgo(3), escalated_at: daysAgo(1) } });
  await p.notification.create({ data: { id: L.notifAno17, project_id: L.project, event_id: L.evtConsolEta, rule_id: RULE_IDS.ANO_17, channel: "internal_alert", recipient: "coordinateur_ops@plo.internal", status: "sent", sent_at: daysAgo(1), escalated_at: hoursAgo(12), crm_ticket_ref: "CRM-TKT-2025-8872" } });
  await p.notification.create({ data: { id: L.notifAno18, project_id: L.project, order_id: L.orderA, event_id: L.evtShipmentA1Exception, rule_id: RULE_IDS.ANO_18, channel: "internal_alert", recipient: "coordinateur_ops@plo.internal", status: "sent", sent_at: daysAgo(2) } });
}

// =============================================================================
// Scénario C — Famille Petit (rénovation énergétique, active, early stage)
// =============================================================================

async function seedPetit(p: typeof prisma, createStep: Function) {
  const P = IDS_PETIT;
  const addr = { street: "12 rue de Strasbourg", city: "Nantes", zip: "44000", country: "FR" };

  await p.project.create({ data: { id: P.project, project_type: "energy_renovation", status: "active", channel_origin: "web", customer_id: "CRM-PETIT-2026", tracking_token: "petit-2026-suivi", metadata: { project_name: "Rénovation énergétique Famille Petit", contact_email: "claire.petit@email.fr", contact_phone: "+33 6 77 88 99 00", estimated_budget: 9500 } } });

  await p.projectExternalRef.createMany({ data: [
    { id: P.extRefErp, project_id: P.project, source: "erp", ref: "ERP-CMD-2026-PETIT" },
    { id: P.extRefEcom, project_id: P.project, source: "ecommerce", ref: "ECOM-CART-PETIT-2026" },
  ] });

  await p.order.create({ data: { id: P.orderA, project_id: P.project, erp_order_ref: "ERP-CMD-2026-PETIT-A", ecommerce_order_ref: "ECOM-PETIT-A-2026", status: "confirmed", installation_required: false, lead_time_days: 30, promised_delivery_date: daysFromNow(27), delivery_address: addr } });

  await p.orderLine.createMany({ data: [
    { id: P.lineA1, order_id: P.orderA, sku: "ENR-PANNEAU-SOLAIRE-400W", label: "Panneau solaire monocristallin 400W", quantity: 8, unit_price: 280, stock_status: "available" },
    { id: P.lineA2, order_id: P.orderA, sku: "ENR-ONDULEUR-HYBRID-5KW", label: "Onduleur hybride 5kW", quantity: 1, unit_price: 1850, stock_status: "available" },
    { id: P.lineA3, order_id: P.orderA, sku: "ENR-FIXATION-TOITURE-TUILE", label: "Kit fixation toiture tuiles", quantity: 8, unit_price: 45, stock_status: "available" },
    { id: P.lineA4, order_id: P.orderA, sku: "ENR-CABLE-SOLAIRE-6MM-50M", label: "Câble solaire 6mm² – 50m", quantity: 2, unit_price: 85, stock_status: "available" },
  ] });

  // Steps
  await createStep({ id: P.stepProjQuote, project_id: P.project, step_type: "quote_products", status: "completed", completed_at: daysAgo(5) });
  await createStep({ id: P.stepOrderAConfirmed, order_id: P.orderA, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(3) });
  await createStep({ id: P.stepOrderAStock, order_id: P.orderA, step_type: "stock_check", status: "completed", completed_at: daysAgo(2) });
  await createStep({ id: P.stepOrderAPicking, order_id: P.orderA, step_type: "picking_preparation", status: "pending", expected_at: daysFromNow(5) });
  await createStep({ id: P.stepOrderAShipment, order_id: P.orderA, step_type: "shipment_dispatched", status: "pending", expected_at: daysFromNow(20) });

  // Events
  await p.event.createMany({ data: [
    { id: P.evtQuote, project_id: P.project, event_type: "quote_products.accepted", source: "erp", source_ref: "ERP-DEVIS-PETIT-2026", severity: "info", processed_at: daysAgo(5) },
    { id: P.evtEcomOrder, project_id: P.project, event_type: "ecommerce.order_placed", source: "ecommerce", source_ref: "ECOM-PETIT-ORDER-2026", severity: "info", processed_at: daysAgo(3), payload: { cart_id: "ECOM-CART-PETIT-2026", total_ht: 5690 } },
    { id: P.evtOrderAConfirmed, project_id: P.project, order_id: P.orderA, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-PETIT-A", severity: "info", processed_at: daysAgo(3) },
    { id: P.evtOrderAStock, project_id: P.project, order_id: P.orderA, event_type: "stock.check_ok", source: "erp", source_ref: "ERP-STOCK-PETIT-A", severity: "info", processed_at: daysAgo(2) },
  ] });
}

// =============================================================================
// Scénario D — Famille Renaud (salle de bain, livraison partielle, 2 anomalies)
// =============================================================================

async function seedRenaud(p: typeof prisma, createStep: Function) {
  const R = IDS_RENAUD;
  const addr = { street: "67 cours Victor Hugo", city: "Bordeaux", zip: "33000", country: "FR", floor: "5" };

  await p.project.create({ data: { id: R.project, project_type: "bathroom", status: "active", channel_origin: "mixed", store_id: "STORE-BDX-01", customer_id: "CRM-RENAUD-2025", tracking_token: "renaud-2025-suivi", assigned_to: "Admin PLO", metadata: { project_name: "Salle de bain Famille Renaud", contact_email: "thomas.renaud@email.fr", contact_phone: "+33 6 22 33 44 55", estimated_budget: 14000, notes: "Livraison partielle — 2ème tentative planifiée" } } });

  await p.projectExternalRef.createMany({ data: [
    { id: R.extRefErp, project_id: R.project, source: "erp", ref: "ERP-CMD-2025-RENAUD" },
    { id: R.extRefCrm, project_id: R.project, source: "crm", ref: "CRM-DOSS-BDX-2025-223" },
  ] });

  await p.order.create({ data: { id: R.orderA, project_id: R.project, erp_order_ref: "ERP-CMD-2025-RENAUD-A", status: "delivered", installation_required: true, lead_time_days: 14, promised_delivery_date: daysAgo(3), promised_installation_date: daysFromNow(3), delivery_address: addr } });
  await p.order.create({ data: { id: R.orderB, project_id: R.project, erp_order_ref: "ERP-CMD-2025-RENAUD-B", status: "delivered", installation_required: true, lead_time_days: 21, promised_delivery_date: daysAgo(3), promised_installation_date: daysFromNow(3), delivery_address: addr } });

  await p.orderLine.createMany({ data: [
    { id: R.lineA1, order_id: R.orderA, sku: "SDB-ROBINET-MITIGEUR", label: "Mitigeur thermostatique douche", quantity: 1, unit_price: 285, stock_status: "available" },
    { id: R.lineA2, order_id: R.orderA, sku: "SDB-CARRELAGE-SOL-M2", label: "Carrelage sol grès cérame – m²", quantity: 12, unit_price: 45, stock_status: "available" },
    { id: R.lineA3, order_id: R.orderA, sku: "SDB-JOINT-SILICONE-LOT", label: "Lot joints silicone sanitaire", quantity: 3, unit_price: 12, stock_status: "available" },
    { id: R.lineB1, order_id: R.orderB, sku: "SDB-BAIGNOIRE-ILOT-170", label: "Baignoire îlot 170cm – Acrylique blanc", quantity: 1, unit_price: 1850, stock_status: "available", metadata: { weight_kg: 95, requires_lifting_equipment: true } },
    { id: R.lineB2, order_id: R.orderB, sku: "SDB-MEUBLE-VASQUE-100", label: "Meuble vasque 100cm – Chêne clair", quantity: 1, unit_price: 680, stock_status: "available" },
  ] });

  await p.shipment.create({ data: { id: R.shipmentA1, order_id: R.orderA, project_id: R.project, oms_ref: "OMS-SHP-RENAUD-A001", leg_number: 1, origin_type: "store", origin_ref: "STORE-BDX-01", destination_station_id: "STATION-BORDEAUX-SUD", carrier: "PROPRE", status: "arrived", estimated_arrival: daysAgo(6), actual_arrival: daysAgo(6) } });
  await p.shipment.create({ data: { id: R.shipmentB1, order_id: R.orderB, project_id: R.project, oms_ref: "OMS-SHP-RENAUD-B001", leg_number: 1, origin_type: "warehouse", origin_ref: "WH-CESTAS", destination_station_id: "STATION-BORDEAUX-SUD", carrier: "DACHSER", carrier_tracking_ref: "DAC-2025-BDX-7701", status: "arrived", estimated_arrival: daysAgo(5), actual_arrival: daysAgo(5) } });

  await p.consolidation.create({ data: { id: R.consolidation, project_id: R.project, station_id: "STATION-BORDEAUX-SUD", station_name: "Station Bordeaux Sud — Bègles", status: "complete", orders_required: [R.orderA, R.orderB], orders_arrived: [R.orderA, R.orderB], estimated_complete_date: daysAgo(4) } });

  await p.lastMileDelivery.create({ data: { id: R.lastMile, project_id: R.project, consolidation_id: R.consolidation, tms_delivery_ref: "TMS-LM-RENAUD-001", carrier: "DACHSER", status: "partial_delivered", delivery_address: addr, scheduled_date: daysAgo(1), scheduled_slot: { start: "14:00", end: "18:00" }, is_partial: true, missing_order_ids: [R.orderB] } });

  await p.installation.create({ data: { id: R.installation, project_id: R.project, status: "scheduled", installation_address: addr, scheduled_date: daysFromNow(3), scheduled_slot: { start: "08:00", end: "17:00" }, technician_id: "TECH-AQI-012", technician_name: "Antoine Duval", wfm_job_ref: "WFM-JOB-RENAUD-001", orders_prerequisite: [R.orderA, R.orderB] } });

  // Steps
  await createStep({ id: R.stepProjInspiration, project_id: R.project, step_type: "inspiration", status: "completed", completed_at: daysAgo(45) });
  await createStep({ id: R.stepProjQuote, project_id: R.project, step_type: "quote_products", status: "completed", completed_at: daysAgo(35) });
  await createStep({ id: R.stepProjConsolidation, project_id: R.project, step_type: "consolidation_in_progress", status: "completed", completed_at: daysAgo(4) });
  await createStep({ id: R.stepProjLastmile, project_id: R.project, step_type: "lastmile_delivered", status: "anomaly", expected_at: daysAgo(1), metadata: { anomaly: "Livraison partielle — baignoire non livrée" } });
  await createStep({ id: R.stepOrderAConfirmed, order_id: R.orderA, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(30) });
  await createStep({ id: R.stepOrderAStock, order_id: R.orderA, step_type: "stock_check", status: "completed", completed_at: daysAgo(29) });
  await createStep({ id: R.stepOrderAPicking, order_id: R.orderA, step_type: "picking_preparation", status: "completed", completed_at: daysAgo(25) });
  await createStep({ id: R.stepOrderAShipment, order_id: R.orderA, step_type: "shipment_arrived_at_station", status: "completed", completed_at: daysAgo(6) });
  await createStep({ id: R.stepOrderBConfirmed, order_id: R.orderB, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(28) });
  await createStep({ id: R.stepOrderBStock, order_id: R.orderB, step_type: "stock_check", status: "completed", completed_at: daysAgo(27) });
  await createStep({ id: R.stepOrderBPicking, order_id: R.orderB, step_type: "picking_preparation", status: "completed", completed_at: daysAgo(22) });
  await createStep({ id: R.stepOrderBShipment, order_id: R.orderB, step_type: "shipment_arrived_at_station", status: "completed", completed_at: daysAgo(5) });
  await createStep({ id: R.stepInstallScheduled, installation_id: R.installation, step_type: "installation_scheduled", status: "in_progress", expected_at: daysFromNow(3) });
  await createStep({ id: R.stepLastmileAttempt, project_id: R.project, step_type: "lastmile_retry_scheduled", status: "pending", expected_at: daysFromNow(2), metadata: { retry_reason: "Livraison partielle — 2ème tentative avec accès monte-charge" } });

  // Events
  await p.event.createMany({ data: [
    { id: R.evtInspiration, project_id: R.project, event_type: "inspiration.completed", source: "inspiration_tool", source_ref: "INSP-RENAUD-2025", severity: "info", processed_at: daysAgo(45) },
    { id: R.evtQuote, project_id: R.project, event_type: "quote_products.accepted", source: "erp", source_ref: "ERP-DEVIS-RENAUD-2025", severity: "info", processed_at: daysAgo(35) },
    { id: R.evtOrderAConfirmed, project_id: R.project, order_id: R.orderA, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-RENAUD-A", severity: "info", processed_at: daysAgo(30) },
    { id: R.evtOrderAStock, project_id: R.project, order_id: R.orderA, event_type: "stock.check_ok", source: "erp", source_ref: "ERP-STOCK-RENAUD-A", severity: "info", processed_at: daysAgo(29) },
    { id: R.evtOrderAPicking, project_id: R.project, order_id: R.orderA, event_type: "picking.completed", source: "erp", source_ref: "ERP-PICK-RENAUD-A", severity: "info", processed_at: daysAgo(25) },
    { id: R.evtShipmentA1Dispatch, project_id: R.project, order_id: R.orderA, event_type: "shipment.dispatched", source: "oms", source_ref: "OMS-SHP-RENAUD-A001-DISPATCH", severity: "info", processed_at: daysAgo(10) },
    { id: R.evtShipmentA1Arrived, project_id: R.project, order_id: R.orderA, event_type: "shipment.arrived_at_station", source: "oms", source_ref: "OMS-SHP-RENAUD-A001-ARRIVED", severity: "info", processed_at: daysAgo(6) },
    { id: R.evtOrderBConfirmed, project_id: R.project, order_id: R.orderB, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-RENAUD-B", severity: "info", processed_at: daysAgo(28) },
    { id: R.evtOrderBStock, project_id: R.project, order_id: R.orderB, event_type: "stock.check_ok", source: "erp", source_ref: "ERP-STOCK-RENAUD-B", severity: "info", processed_at: daysAgo(27) },
    { id: R.evtOrderBPicking, project_id: R.project, order_id: R.orderB, event_type: "picking.completed", source: "erp", source_ref: "ERP-PICK-RENAUD-B", severity: "info", processed_at: daysAgo(22) },
    { id: R.evtShipmentB1Dispatch, project_id: R.project, order_id: R.orderB, event_type: "shipment.dispatched", source: "oms", source_ref: "OMS-SHP-RENAUD-B001-DISPATCH", severity: "info", processed_at: daysAgo(8) },
    { id: R.evtShipmentB1Arrived, project_id: R.project, order_id: R.orderB, event_type: "shipment.arrived_at_station", source: "oms", source_ref: "OMS-SHP-RENAUD-B001-ARRIVED", severity: "info", processed_at: daysAgo(5) },
    { id: R.evtLastmilePartial, project_id: R.project, event_type: "lastmile.partial_delivered", source: "tms_lastmile", source_ref: "TMS-LM-RENAUD-001-PARTIAL", severity: "critical", processed_at: daysAgo(1), payload: { delivery_ref: "TMS-LM-RENAUD-001", delivered_orders: [R.orderA], missing_orders: [R.orderB], reason: "Pas de code d'accès immeuble — baignoire trop lourde pour escalier 5ème étage" } },
  ] });

  // Notifications
  await p.notification.create({ data: { id: R.notifAno04, project_id: R.project, event_id: R.evtLastmilePartial, rule_id: RULE_IDS.ANO_04, channel: "internal_alert", recipient: "coordinateur_ops@plo.internal", status: "sent", sent_at: daysAgo(1), escalated_at: hoursAgo(6) } });
  await p.notification.create({ data: { id: R.notifAno22, project_id: R.project, event_id: R.evtLastmilePartial, rule_id: RULE_IDS.ANO_22, channel: "internal_alert", recipient: "coordinateur_ops@plo.internal", status: "sent", sent_at: daysAgo(1) } });
}

// =============================================================================
// Scénario E — Famille Moreau (cuisine, completed, historique 45j)
// =============================================================================

async function seedMoreau(p: typeof prisma, createStep: Function) {
  const M = IDS_MOREAU;
  const addr = { street: "8 boulevard Michelet", city: "Marseille", zip: "13008", country: "FR", floor: "1" };

  await p.project.create({ data: { id: M.project, project_type: "kitchen", status: "completed", channel_origin: "store", store_id: "STORE-MRS-01", customer_id: "CRM-MOREAU-2024", tracking_token: "moreau-2024-suivi", assigned_to: "Admin PLO", metadata: { project_name: "Cuisine Famille Moreau", contact_email: "marc.moreau@email.fr", contact_phone: "+33 6 44 55 66 77", estimated_budget: 15000 } } });

  await p.projectExternalRef.createMany({ data: [
    { id: M.extRefErp, project_id: M.project, source: "erp", ref: "ERP-CMD-2024-MOREAU" },
    { id: M.extRefCrm, project_id: M.project, source: "crm", ref: "CRM-DOSS-MRS-2024-087" },
  ] });

  await p.order.create({ data: { id: M.orderA, project_id: M.project, erp_order_ref: "ERP-CMD-2024-MOREAU-A", status: "closed", installation_required: true, lead_time_days: 18, promised_delivery_date: daysAgo(55), promised_installation_date: daysAgo(48), delivery_address: addr } });
  await p.order.create({ data: { id: M.orderB, project_id: M.project, erp_order_ref: "ERP-CMD-2024-MOREAU-B", status: "closed", installation_required: true, lead_time_days: 12, promised_delivery_date: daysAgo(55), promised_installation_date: daysAgo(48), delivery_address: addr } });

  await p.orderLine.createMany({ data: [
    { id: M.lineA1, order_id: M.orderA, sku: "CUI-FACADE-LAQUE-40", label: "Façade laquée 40cm – Gris anthracite", quantity: 10, unit_price: 75, stock_status: "available" },
    { id: M.lineA2, order_id: M.orderA, sku: "CUI-PLAN-TRAVAIL-GRANIT-300", label: "Plan de travail granit 300cm – Noir Zimbabwe", quantity: 1, unit_price: 1450, stock_status: "available" },
    { id: M.lineA3, order_id: M.orderA, sku: "CUI-EVIER-ENCASTRABLE", label: "Évier encastrable 2 bacs – Inox", quantity: 1, unit_price: 280, stock_status: "available" },
    { id: M.lineB1, order_id: M.orderB, sku: "ELEC-HOTTE-ILOT-90", label: "Hotte îlot 90cm – Inox", quantity: 1, unit_price: 780, stock_status: "available" },
    { id: M.lineB2, order_id: M.orderB, sku: "ELEC-LAVE-VAISSELLE-60", label: "Lave-vaisselle encastrable 60cm", quantity: 1, unit_price: 520, stock_status: "available" },
    { id: M.lineB3, order_id: M.orderB, sku: "ELEC-MICRO-ONDES-ENCASTRABLE", label: "Micro-ondes encastrable – Inox", quantity: 1, unit_price: 350, stock_status: "available" },
  ] });

  await p.shipment.create({ data: { id: M.shipmentA1, order_id: M.orderA, project_id: M.project, oms_ref: "OMS-SHP-MOREAU-A001", leg_number: 1, origin_type: "warehouse", origin_ref: "WH-VITROLLES", destination_station_id: "STATION-MARSEILLE-NORD", carrier: "XPO LOGISTICS", status: "arrived", estimated_arrival: daysAgo(58), actual_arrival: daysAgo(58) } });
  await p.shipment.create({ data: { id: M.shipmentB1, order_id: M.orderB, project_id: M.project, oms_ref: "OMS-SHP-MOREAU-B001", leg_number: 1, origin_type: "store", origin_ref: "STORE-MRS-01", destination_station_id: "STATION-MARSEILLE-NORD", carrier: "PROPRE", status: "arrived", estimated_arrival: daysAgo(57), actual_arrival: daysAgo(57) } });

  await p.consolidation.create({ data: { id: M.consolidation, project_id: M.project, station_id: "STATION-MARSEILLE-NORD", station_name: "Station Marseille Nord — Vitrolles", status: "complete", orders_required: [M.orderA, M.orderB], orders_arrived: [M.orderA, M.orderB], estimated_complete_date: daysAgo(55) } });

  await p.lastMileDelivery.create({ data: { id: M.lastMile, project_id: M.project, consolidation_id: M.consolidation, tms_delivery_ref: "TMS-LM-MOREAU-001", carrier: "XPO LOGISTICS", status: "delivered", delivery_address: addr, scheduled_date: daysAgo(52), scheduled_slot: { start: "14:00", end: "18:00" }, is_partial: false, delivered_at: daysAgo(52), pod_url: "https://pod.carrier.example/moreau-2024" } });

  await p.installation.create({ data: { id: M.installation, project_id: M.project, status: "completed", installation_address: addr, scheduled_date: daysAgo(48), scheduled_slot: { start: "08:00", end: "17:00" }, technician_id: "TECH-PACA-003", technician_name: "Luc Bergeron", wfm_job_ref: "WFM-JOB-MOREAU-001", orders_prerequisite: [M.orderA, M.orderB], started_at: daysAgo(48), completed_at: daysAgo(46), report: { technician_notes: "Installation complète cuisine. Réglages portes et tiroirs effectués.", customer_signature: { signed: true, signed_at: daysAgo(46).toISOString() }, photos: 8, issues: [] } } });

  // Steps
  await createStep({ id: M.stepProjInspiration, project_id: M.project, step_type: "inspiration", status: "completed", completed_at: daysAgo(90) });
  await createStep({ id: M.stepProjQuote, project_id: M.project, step_type: "quote_products", status: "completed", completed_at: daysAgo(80) });
  await createStep({ id: M.stepProjConsolidation, project_id: M.project, step_type: "consolidation_in_progress", status: "completed", completed_at: daysAgo(55) });
  await createStep({ id: M.stepProjLastmile, project_id: M.project, step_type: "lastmile_delivered", status: "completed", completed_at: daysAgo(52) });
  await createStep({ id: M.stepProjInstallation, project_id: M.project, step_type: "installation_completed", status: "completed", completed_at: daysAgo(46) });
  await createStep({ id: M.stepOrderAConfirmed, order_id: M.orderA, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(75) });
  await createStep({ id: M.stepOrderAStock, order_id: M.orderA, step_type: "stock_check", status: "completed", completed_at: daysAgo(74) });
  await createStep({ id: M.stepOrderAPicking, order_id: M.orderA, step_type: "picking_preparation", status: "completed", completed_at: daysAgo(70) });
  await createStep({ id: M.stepOrderAShipment, order_id: M.orderA, step_type: "shipment_arrived_at_station", status: "completed", completed_at: daysAgo(58) });
  await createStep({ id: M.stepOrderBConfirmed, order_id: M.orderB, step_type: "order_confirmed", status: "completed", completed_at: daysAgo(70) });
  await createStep({ id: M.stepOrderBStock, order_id: M.orderB, step_type: "stock_check", status: "completed", completed_at: daysAgo(69) });
  await createStep({ id: M.stepOrderBPicking, order_id: M.orderB, step_type: "picking_preparation", status: "completed", completed_at: daysAgo(65) });

  // Events
  await p.event.createMany({ data: [
    { id: M.evtInspiration, project_id: M.project, event_type: "inspiration.completed", source: "inspiration_tool", source_ref: "INSP-MOREAU-2024", severity: "info", processed_at: daysAgo(90) },
    { id: M.evtQuote, project_id: M.project, event_type: "quote_products.accepted", source: "erp", source_ref: "ERP-DEVIS-MOREAU-2024", severity: "info", processed_at: daysAgo(80) },
    { id: M.evtOrderAConfirmed, project_id: M.project, order_id: M.orderA, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-MOREAU-A", severity: "info", processed_at: daysAgo(75) },
    { id: M.evtOrderAStock, project_id: M.project, order_id: M.orderA, event_type: "stock.check_ok", source: "erp", source_ref: "ERP-STOCK-MOREAU-A", severity: "info", processed_at: daysAgo(74) },
    { id: M.evtOrderAPicking, project_id: M.project, order_id: M.orderA, event_type: "picking.completed", source: "erp", source_ref: "ERP-PICK-MOREAU-A", severity: "info", processed_at: daysAgo(70) },
    { id: M.evtShipmentA1Dispatch, project_id: M.project, order_id: M.orderA, event_type: "shipment.dispatched", source: "oms", source_ref: "OMS-SHP-MOREAU-A001-DISPATCH", severity: "info", processed_at: daysAgo(62) },
    { id: M.evtShipmentA1Arrived, project_id: M.project, order_id: M.orderA, event_type: "shipment.arrived_at_station", source: "oms", source_ref: "OMS-SHP-MOREAU-A001-ARRIVED", severity: "info", processed_at: daysAgo(58) },
    { id: M.evtOrderBConfirmed, project_id: M.project, order_id: M.orderB, event_type: "order.confirmed", source: "erp", source_ref: "ERP-ORDER-MOREAU-B", severity: "info", processed_at: daysAgo(70) },
    { id: M.evtOrderBStock, project_id: M.project, order_id: M.orderB, event_type: "stock.check_ok", source: "erp", source_ref: "ERP-STOCK-MOREAU-B", severity: "info", processed_at: daysAgo(69) },
    { id: M.evtShipmentB1Dispatch, project_id: M.project, order_id: M.orderB, event_type: "shipment.dispatched", source: "oms", source_ref: "OMS-SHP-MOREAU-B001-DISPATCH", severity: "info", processed_at: daysAgo(60) },
  ] });
}

main()
  .catch((e) => {
    console.error("\n❌ Erreur pendant le seed :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
