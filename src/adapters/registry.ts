import type { EventSource } from "@prisma/client";
import type { Adapter } from "./types.js";
import { ErpAdapter } from "./erp.adapter.js";
import { OmsAdapter } from "./oms.adapter.js";
import { TmsAdapter } from "./tms.adapter.js";
import { ManualAdapter } from "./manual.adapter.js";

// =============================================================================
// Registre des adaptateurs — résolution par source
// =============================================================================

const adapters = new Map<EventSource, Adapter>();
adapters.set("erp", new ErpAdapter());
adapters.set("oms", new OmsAdapter());
adapters.set("tms_lastmile", new TmsAdapter());
adapters.set("manual", new ManualAdapter());

export function getAdapter(source: EventSource): Adapter {
  const adapter = adapters.get(source);
  if (!adapter) {
    throw new Error(`No adapter registered for source: ${source}`);
  }
  return adapter;
}
