import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

// =============================================================================
// logActivity — helper fire-and-forget pour le journal d'audit (Sprint 16)
// =============================================================================

export interface LogActivityInput {
  action:        string;
  entity_type:   string;
  entity_id?:    string;
  entity_label?: string;
  operator_name: string;
  details?:      Record<string, unknown>;
}

export function logActivity(input: LogActivityInput): void {
  const { details, ...rest } = input;
  void prisma.activityLog.create({
    data: {
      ...rest,
      ...(details !== undefined ? { details: details as Prisma.InputJsonValue } : {}),
    },
  });
}
