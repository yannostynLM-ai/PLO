// =============================================================================
// PLO — Types TypeScript métier
// Sprint 1 — Fondations de données
// =============================================================================

import type {
  Project,
  ProjectExternalRef,
  Order,
  OrderLine,
  Shipment,
  Consolidation,
  LastMileDelivery,
  Installation,
  Step,
  Event,
  AnomalyRule,
  Notification,
  Prisma,
} from "@prisma/client";

// =============================================================================
// Ré-exports des types Prisma
// =============================================================================

export type {
  Project,
  ProjectExternalRef,
  Order,
  OrderLine,
  Shipment,
  Consolidation,
  LastMileDelivery,
  Installation,
  Step,
  Event,
  AnomalyRule,
  Notification,
};

// Types with relations (exemples des plus utiles)
export type ProjectWithAll = Prisma.ProjectGetPayload<{
  include: {
    external_refs: true;
    orders: {
      include: {
        lines: true;
        shipments: true;
        steps: true;
      };
    };
    consolidation: true;
    last_mile: true;
    installation: true;
    steps: true;
    events: true;
  };
}>;

export type OrderWithLines = Prisma.OrderGetPayload<{
  include: {
    lines: true;
    shipments: true;
    steps: true;
  };
}>;

// =============================================================================
// Types utilitaires pour les champs JSON
// =============================================================================

/** Adresse de livraison / installation */
export interface DeliveryAddress {
  street: string;
  city: string;
  zip: string;
  country: string;
  floor?: string;
  access_code?: string;
  additional_info?: string;
}

/** Créneau horaire */
export interface TimeSlot {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

/** Compte-rendu d'installation */
export interface InstallationReport {
  summary: string;
  issues: string[];
  reserves: string[];
  photos: string[];
  customer_signature: {
    signed: boolean;
    signed_at?: string; // ISO8601
    signature_url?: string;
  };
}

/** Accord de livraison partielle (Consolidation) */
export interface ConsolidationPartialApproval {
  customer: boolean;
  installer: boolean;
  approved_at: string; // ISO8601
  approved_by?: string; // Opérateur customer care
}

/** Payload normalisé attendu de l'OMS — événements Shipment */
export interface OmsShipmentPayload {
  shipment_id: string;
  order_ref: string;
  leg_number: number;
  origin_type: "warehouse" | "store" | "supplier" | "crossdock_station";
  origin_ref: string;
  destination_station_id: string;
  carrier: string;
  carrier_tracking_ref: string;
  estimated_arrival: string | null; // ISO8601
  actual_arrival: string | null;    // ISO8601
}

/** Payload normalisé attendu de l'OMS — événements Consolidation */
export interface OmsConsolidationPayload {
  consolidation_id: string;
  project_ref: string;
  station_id: string;
  orders_total: number;
  orders_arrived: number;
  orders_missing: string[]; // order_id[]
  estimated_complete_date: string; // ISO8601
  status: "in_progress" | "complete" | "partial_approved";
}

/** Payload normalisé attendu du TMS last mile */
export interface TmsLastMilePayload {
  lastmile_id: string;
  project_ref: string;
  carrier: string;
  carrier_tracking_ref: string;
  scheduled_date: string; // ISO8601
  time_slot: TimeSlot;
  is_partial: boolean;
  missing_order_ids: string[];
  pod_url: string | null;
}

/** Payload normalisé de l'endpoint d'ingestion */
export interface IngestPayload {
  source: string;
  source_ref: string;
  event_type: EventType;
  project_ref: string;
  occurred_at: string; // ISO8601
  payload?: Record<string, unknown>;
}

// =============================================================================
// Enum EventType — tous les types d'événements du cycle de vie
// (string enum pour extensibilité sans migration)
// =============================================================================

export enum EventType {
  // --- Inspiration (Étape 1) ---
  INSPIRATION_STARTED = "inspiration.started",
  INSPIRATION_COMPLETED = "inspiration.completed",
  INSPIRATION_CONVERTED = "inspiration.converted",
  INSPIRATION_ABANDONED = "inspiration.abandoned",

  // --- Devis Produits (Étape 2) ---
  QUOTE_PRODUCTS_CREATED = "quote_products.created",
  QUOTE_PRODUCTS_SENT = "quote_products.sent",
  QUOTE_PRODUCTS_ACCEPTED = "quote_products.accepted",
  QUOTE_PRODUCTS_EXPIRED = "quote_products.expired",

  // --- Devis Pose / Installation (Étape 3) ---
  QUOTE_INSTALLATION_CREATED = "quote_installation.created",
  QUOTE_INSTALLATION_SENT = "quote_installation.sent",
  QUOTE_INSTALLATION_ACCEPTED = "quote_installation.accepted",

  // --- Commande (Étape 4) ---
  ORDER_CONFIRMED = "order.confirmed",
  ORDER_LINE_ADDED = "order.line_added",
  ORDER_CANCELLED = "order.cancelled",

  // --- Stock (Étape 5) ---
  STOCK_CHECK_OK = "stock.check_ok",
  STOCK_SHORTAGE = "stock.shortage",
  STOCK_PARTIAL = "stock.partial",

  // --- Picking (Étape 6) ---
  PICKING_STARTED = "picking.started",
  PICKING_COMPLETED = "picking.completed",
  PICKING_DISCREPANCY = "picking.discrepancy",

  // --- Expédition / Shipment (Étape 7) ---
  SHIPMENT_DISPATCHED = "shipment.dispatched",
  SHIPMENT_IN_TRANSIT = "shipment.in_transit",
  SHIPMENT_ETA_UPDATED = "shipment.eta_updated",
  SHIPMENT_ARRIVED_AT_STATION = "shipment.arrived_at_station",
  SHIPMENT_EXCEPTION = "shipment.exception",

  // --- Consolidation (Étape 8) ---
  CONSOLIDATION_ORDER_ARRIVED = "consolidation.order_arrived",
  CONSOLIDATION_ETA_UPDATED = "consolidation.eta_updated",
  CONSOLIDATION_COMPLETE = "consolidation.complete",
  CONSOLIDATION_PARTIAL_APPROVED = "consolidation.partial_approved",
  CONSOLIDATION_EXCEPTION = "consolidation.exception",

  // --- Last Mile Delivery (Étape 9) ---
  LASTMILE_SCHEDULED = "lastmile.scheduled",
  LASTMILE_RESCHEDULED = "lastmile.rescheduled",
  LASTMILE_IN_TRANSIT = "lastmile.in_transit",
  LASTMILE_DELIVERED = "lastmile.delivered",
  LASTMILE_PARTIAL_DELIVERED = "lastmile.partial_delivered",
  LASTMILE_FAILED = "lastmile.failed",
  LASTMILE_DAMAGED = "lastmile.damaged",

  // --- Installation — Planification (Étape 10) ---
  INSTALLATION_SCHEDULED = "installation.scheduled",
  INSTALLATION_RESCHEDULED = "installation.rescheduled",
  INSTALLATION_CANCELLED = "installation.cancelled",

  // --- Installation — Réalisation (Étape 10) ---
  INSTALLATION_STARTED = "installation.started",
  INSTALLATION_COMPLETED = "installation.completed",
  INSTALLATION_ISSUE = "installation.issue",
  INSTALLATION_PARTIAL = "installation.partial",
  INSTALLATION_REPORT_SUBMITTED = "installation.report_submitted",

  // --- Qualité / Signature (Étape 11) ---
  QUALITY_SURVEY_SENT = "quality.survey_sent",
  QUALITY_SURVEY_COMPLETED = "quality.survey_completed",
  QUALITY_ISSUE_RAISED = "quality.issue_raised",
  CUSTOMER_SIGNATURE_SIGNED = "customer_signature.signed",

  // --- Clôture (Étape 12) ---
  PROJECT_CLOSED = "project.closed",
  PROJECT_CLOSED_WITH_ISSUE = "project.closed_with_issue",
  PROJECT_REOPENED = "project.reopened",
}

// =============================================================================
// Types utilitaires généraux
// =============================================================================

/** Condition d'une règle d'anomalie */
export interface AnomalyCondition {
  type: "delay_exceeded" | "event_missing" | "status_mismatch" | "combination";
  trigger_event?: EventType;
  reference_event?: EventType;
  delay_hours?: number;
  delay_days?: number;
  reference_field?: string;
  additional_conditions?: AnomalyCondition[];
}

/** Action d'une règle d'anomalie */
export interface AnomalyAction {
  notifications: Array<{
    channel: "email" | "crm_ticket" | "internal_alert";
    recipients: string[];
    template?: string;
  }>;
  block_step?: boolean;
  escalate?: boolean;
  create_sav_ticket?: boolean;
}
