import { z } from "zod";
import { AdapterError, type Adapter, type NormalizedEvent, type RawIngestBody } from "./types.js";

// =============================================================================
// Adaptateur ERP
// Couvre : inspiration, devis, commandes, stock, picking
// =============================================================================

const ERP_ALLOWED_EVENT_TYPES = new Set([
  // Inspiration
  "inspiration.started",
  "inspiration.completed",
  "inspiration.converted",
  "inspiration.abandoned",
  // Devis produits
  "quote_products.created",
  "quote_products.sent",
  "quote_products.accepted",
  "quote_products.expired",
  // Devis installation
  "quote_installation.created",
  "quote_installation.sent",
  "quote_installation.accepted",
  // Commandes
  "order.confirmed",
  "order.line_added",
  "order.cancelled",
  // Stock
  "stock.check_ok",
  "stock.shortage",
  "stock.partial",
  // Picking
  "picking.started",
  "picking.completed",
  "picking.discrepancy",
]);

// Schémas de validation par event_type
const OrderLineSchema = z.object({
  sku: z.string(),
  qty: z.number().int().positive(),
  label: z.string().optional(),
  warehouse: z.string().optional(),
  unit_price: z.number().nonnegative().optional(),
  installation_required: z.boolean().optional(),
});

const DeliveryAddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zip: z.string(),
  country: z.string(),
  floor: z.string().optional(),
  access_code: z.string().optional(),
});

const PayloadSchemaByEventType: Record<string, z.ZodTypeAny> = {
  "order.confirmed": z.object({
    erp_order_ref: z.string(),
    delivery_address: DeliveryAddressSchema.optional(),
    installation_required: z.boolean().optional(),
    lead_time_days: z.number().int().positive().optional(),
    promised_delivery_date: z.string().datetime().optional(),
    lines: z.array(OrderLineSchema).optional(),
  }),

  "order.line_added": z.object({
    erp_order_ref: z.string(),
    line: OrderLineSchema,
  }),

  "order.cancelled": z.object({
    erp_order_ref: z.string(),
    reason: z.string().optional(),
  }),

  "stock.shortage": z.object({
    erp_order_ref: z.string().optional(),
    sku: z.string(),
    quantity_ordered: z.number().int().optional(),
    quantity_available: z.number().int().optional(),
    expected_restock_date: z.string().optional(),
  }),

  "stock.check_ok": z.object({
    erp_order_ref: z.string().optional(),
    lines_checked: z.number().int().optional(),
  }),

  "stock.partial": z.object({
    erp_order_ref: z.string().optional(),
    shortage_skus: z.array(z.string()).optional(),
  }),

  "picking.discrepancy": z.object({
    erp_order_ref: z.string().optional(),
    missing_skus: z.array(z.string()).optional(),
    damaged_skus: z.array(z.string()).optional(),
    operator_id: z.string().optional(),
  }),
};

const BaseErpSchema = z.object({
  source_ref: z.string().min(1),
  event_type: z.string().min(1),
  project_ref: z.string().min(1),
  occurred_at: z.string().datetime({ message: "occurred_at doit être ISO8601" }),
  order_ref: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export class ErpAdapter implements Adapter {
  readonly source = "erp" as const;

  adapt(body: RawIngestBody): NormalizedEvent {
    // 1. Validation de base
    const base = BaseErpSchema.safeParse(body);
    if (!base.success) {
      throw new AdapterError("Payload ERP invalide", base.error.flatten());
    }
    const data = base.data;

    // 2. Vérification que l'event_type est autorisé pour la source ERP
    if (!ERP_ALLOWED_EVENT_TYPES.has(data.event_type)) {
      throw new AdapterError(
        `event_type '${data.event_type}' non autorisé pour la source ERP`
      );
    }

    // 3. Validation du payload spécifique à l'event_type (si schéma défini)
    const payloadSchema = PayloadSchemaByEventType[data.event_type];
    if (payloadSchema) {
      const payloadResult = payloadSchema.safeParse(data.payload);
      if (!payloadResult.success) {
        throw new AdapterError(
          `Payload invalide pour ${data.event_type}`,
          payloadResult.error.flatten()
        );
      }
    }

    return {
      source: this.source,
      source_ref: data.source_ref,
      event_type: data.event_type,
      project_ref: data.project_ref,
      occurred_at: new Date(data.occurred_at),
      order_ref: data.order_ref,
      payload: data.payload,
    };
  }
}
