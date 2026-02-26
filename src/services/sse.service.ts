import type { ServerResponse } from "http";

// =============================================================================
// Service SSE — registre des clients connectés + broadcast
// =============================================================================

export interface SseNotificationPayload {
  id: string;
  project_id: string;
  rule_name: string;
  severity: string;
  project_customer_id: string;
  project_type: string;
  sent_at: string;
}

interface SseClient {
  id: string;
  res: ServerResponse;
  userId: string;
}

const clients = new Map<string, SseClient>();

export function registerSseClient(id: string, res: ServerResponse, userId: string): void {
  clients.set(id, { id, res, userId });
}

export function unregisterSseClient(id: string): void {
  clients.delete(id);
}

export function broadcastNotification(payload: SseNotificationPayload): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients.values()) {
    try {
      client.res.write(data);
    } catch {
      clients.delete(client.id);
    }
  }
}
