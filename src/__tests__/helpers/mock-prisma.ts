// =============================================================================
// Factory mock Prisma — tous les modèles avec vi.fn()
// =============================================================================

import { vi } from "vitest";

export function createMockPrisma() {
  const mockModel = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    aggregate: vi.fn(),
  });

  return {
    project: mockModel(),
    order: mockModel(),
    event: mockModel(),
    step: mockModel(),
    shipment: mockModel(),
    consolidation: mockModel(),
    lastMileDelivery: mockModel(),
    installation: mockModel(),
    notification: mockModel(),
    anomalyRule: mockModel(),
    user: mockModel(),
    projectExternalRef: mockModel(),
    projectNote: mockModel(),
    activityLog: mockModel(),
    orderLine: mockModel(),
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(this)),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
