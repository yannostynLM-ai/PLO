import type { EventSource } from "@prisma/client";
import type { Adapter } from "./types.js";
import { ErpAdapter } from "./erp.adapter.js";
import { OmsAdapter } from "./oms.adapter.js";
import { TmsAdapter } from "./tms.adapter.js";
import { ManualAdapter } from "./manual.adapter.js";
import { WfmAdapter } from "./wfm.adapter.js";
import { CrmAdapter } from "./crm.adapter.js";
import { EcommerceAdapter } from "./ecommerce.adapter.js";

// =============================================================================
// Registre des adaptateurs — résolution par source
// =============================================================================

const adapters = new Map<EventSource, Adapter>();

// Sprint 2 — obligatoires
adapters.set("erp", new ErpAdapter());
adapters.set("oms", new OmsAdapter());
adapters.set("tms_lastmile", new TmsAdapter());
adapters.set("manual", new ManualAdapter());

// Sprint 5 — enregistrés si la clé API correspondante est configurée
if (process.env.API_KEY_WFM) adapters.set("wfm", new WfmAdapter());
if (process.env.API_KEY_CRM) adapters.set("crm", new CrmAdapter());
if (process.env.API_KEY_ECOMMERCE) adapters.set("ecommerce", new EcommerceAdapter());

export function getAdapter(source: EventSource): Adapter {
  const adapter = adapters.get(source);
  if (!adapter) {
    throw new Error(`No adapter registered for source: ${source}`);
  }
  return adapter;
}
