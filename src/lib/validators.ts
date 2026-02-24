// =============================================================================
// PLO — Validateurs applicatifs
// Sprint 1 — Contraintes non supportées nativement par Prisma
// =============================================================================

/**
 * Contrainte XOR sur Step :
 * Exactement un parmi (project_id, order_id, installation_id) doit être non-null.
 *
 * Cette contrainte est définie dans la SPEC section 2.7 :
 * "exactement un parmi (project_id, order_id, installation_id) doit être non-NULL"
 *
 * Prisma ne supporte pas nativement les CHECK constraints complexes (multi-colonnes),
 * donc la validation est appliquée au niveau applicatif avant toute écriture en base.
 */
export function validateStep(data: {
  project_id?: string | null;
  order_id?: string | null;
  installation_id?: string | null;
}): void {
  const nonNullCount = [
    data.project_id,
    data.order_id,
    data.installation_id,
  ].filter((v) => v != null && v !== "").length;

  if (nonNullCount !== 1) {
    throw new Error(
      `Step must have exactly one of: project_id, order_id, installation_id. ` +
        `Got ${nonNullCount} non-null value(s). ` +
        `Values: project_id=${data.project_id ?? "null"}, ` +
        `order_id=${data.order_id ?? "null"}, ` +
        `installation_id=${data.installation_id ?? "null"}`
    );
  }
}

/**
 * Valide qu'une adresse de livraison contient les champs obligatoires.
 */
export function validateDeliveryAddress(address: unknown): void {
  if (typeof address !== "object" || address === null) {
    throw new Error("delivery_address must be a non-null object");
  }
  const addr = address as Record<string, unknown>;
  const required = ["street", "city", "zip", "country"];
  for (const field of required) {
    if (!addr[field] || typeof addr[field] !== "string") {
      throw new Error(`delivery_address.${field} is required and must be a string`);
    }
  }
}

/**
 * Valide qu'un créneau horaire est au bon format.
 */
export function validateTimeSlot(slot: unknown): void {
  if (typeof slot !== "object" || slot === null) {
    throw new Error("time_slot must be a non-null object");
  }
  const s = slot as Record<string, unknown>;
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (typeof s.start !== "string" || !timeRegex.test(s.start)) {
    throw new Error("time_slot.start must be in HH:MM format");
  }
  if (typeof s.end !== "string" || !timeRegex.test(s.end)) {
    throw new Error("time_slot.end must be in HH:MM format");
  }
}
