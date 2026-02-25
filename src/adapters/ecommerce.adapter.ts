import { z } from "zod";
import { AdapterError, type Adapter, type NormalizedEvent, type RawIngestBody } from "./types.js";

// =============================================================================
// Adaptateur E-commerce
// Couvre : parcours achat en ligne, paiement, commandes e-commerce
// =============================================================================

const ECOMMERCE_ALLOWED_EVENT_TYPES = new Set([
  // Inspiration → conversion
  "inspiration.started",
  "inspiration.completed",
  "inspiration.converted",
  "inspiration.abandoned",
  // Devis produits (côté e-commerce)
  "quote_products.created",
  "quote_products.sent",
  "quote_products.accepted",
  "quote_products.expired",
  // Panier
  "cart.created",
  "cart.updated",
  "cart.abandoned",
  "cart.converted",
  // Paiement
  "payment.initiated",
  "payment.confirmed",
  "payment.failed",
  "payment.refunded",
  // Commande (version e-commerce)
  "order.confirmed",
  "order.cancelled",
  "order.line_added",
]);

const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zip: z.string(),
  country: z.string(),
  floor: z.string().optional(),
  access_code: z.string().optional(),
});

const CartLineSchema = z.object({
  sku: z.string(),
  label: z.string().optional(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative().optional(),
  installation_required: z.boolean().optional(),
});

const PayloadSchemaByEventType: Record<string, z.ZodTypeAny> = {
  "inspiration.started": z.object({
    session_id: z.string().optional(),
    project_type: z.enum(["kitchen", "bathroom", "energy_renovation", "other"]).optional(),
    channel: z.string().optional(),
  }),

  "inspiration.completed": z.object({
    session_id: z.string().optional(),
    product_count: z.number().int().optional(),
    total_estimate: z.number().nonnegative().optional(),
  }),

  "inspiration.converted": z.object({
    session_id: z.string().optional(),
    ecommerce_quote_ref: z.string().optional(),
  }),

  "inspiration.abandoned": z.object({
    session_id: z.string().optional(),
    last_step: z.string().optional(),
    time_spent_seconds: z.number().int().optional(),
  }),

  "cart.created": z.object({
    ecommerce_cart_ref: z.string(),
    lines: z.array(CartLineSchema).optional(),
  }),

  "cart.updated": z.object({
    ecommerce_cart_ref: z.string(),
    lines: z.array(CartLineSchema).optional(),
    total_amount: z.number().nonnegative().optional(),
  }),

  "cart.abandoned": z.object({
    ecommerce_cart_ref: z.string(),
    total_amount: z.number().nonnegative().optional(),
    abandonment_step: z.string().optional(),
  }),

  "cart.converted": z.object({
    ecommerce_cart_ref: z.string(),
    ecommerce_order_ref: z.string(),
    total_amount: z.number().nonnegative().optional(),
  }),

  "payment.initiated": z.object({
    ecommerce_order_ref: z.string().optional(),
    payment_method: z.string().optional(),
    amount: z.number().nonnegative().optional(),
  }),

  "payment.confirmed": z.object({
    ecommerce_order_ref: z.string().optional(),
    payment_method: z.string().optional(),
    amount: z.number().nonnegative().optional(),
    transaction_ref: z.string().optional(),
  }),

  "payment.failed": z.object({
    ecommerce_order_ref: z.string().optional(),
    reason: z.string().optional(),
    payment_method: z.string().optional(),
  }),

  "payment.refunded": z.object({
    ecommerce_order_ref: z.string().optional(),
    amount: z.number().nonnegative().optional(),
    reason: z.string().optional(),
  }),

  "order.confirmed": z.object({
    ecommerce_order_ref: z.string(),
    erp_order_ref: z.string().optional(),
    delivery_address: AddressSchema.optional(),
    installation_required: z.boolean().optional(),
    promised_delivery_date: z.string().datetime().optional(),
    lines: z.array(CartLineSchema).optional(),
  }),

  "order.cancelled": z.object({
    ecommerce_order_ref: z.string(),
    reason: z.string().optional(),
  }),

  "quote_products.created": z.object({
    ecommerce_quote_ref: z.string(),
    total_amount: z.number().nonnegative().optional(),
    lines: z.array(CartLineSchema).optional(),
    valid_until: z.string().datetime().optional(),
  }),

  "quote_products.accepted": z.object({
    ecommerce_quote_ref: z.string(),
    accepted_at: z.string().datetime().optional(),
  }),

  "quote_products.expired": z.object({
    ecommerce_quote_ref: z.string(),
    expired_at: z.string().datetime().optional(),
  }),
};

const BaseEcommerceSchema = z.object({
  source_ref: z.string().min(1),
  event_type: z.string().min(1),
  project_ref: z.string().min(1),
  occurred_at: z.string().datetime({ message: "occurred_at doit être ISO8601" }),
  order_ref: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export class EcommerceAdapter implements Adapter {
  readonly source = "ecommerce" as const;

  adapt(body: RawIngestBody): NormalizedEvent {
    const base = BaseEcommerceSchema.safeParse(body);
    if (!base.success) {
      throw new AdapterError("Payload e-commerce invalide", base.error.flatten());
    }
    const data = base.data;

    if (!ECOMMERCE_ALLOWED_EVENT_TYPES.has(data.event_type)) {
      throw new AdapterError(
        `event_type '${data.event_type}' non autorisé pour la source e-commerce`
      );
    }

    const payloadSchema = PayloadSchemaByEventType[data.event_type];
    if (payloadSchema) {
      const result = payloadSchema.safeParse(data.payload);
      if (!result.success) {
        throw new AdapterError(
          `Payload invalide pour ${data.event_type}`,
          result.error.flatten()
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
