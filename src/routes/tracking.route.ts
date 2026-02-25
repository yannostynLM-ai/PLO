import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Route publique — Portail de suivi client (Sprint 7)
// GET /api/public/tracking/:token
// Retourne une vue filtrée du projet, sans données internes (règles, sévérités,
// source_ref, IDs internes). Accessible sans authentification via token URL.
// =============================================================================

const PROJECT_TYPE_LABELS: Record<string, string> = {
  kitchen: "Cuisine",
  bathroom: "Salle de bain",
  energy_renovation: "Rénovation énergétique",
  other: "Projet",
};

type MilestoneStatus = "completed" | "in_progress" | "pending";

interface Milestone {
  key: string;
  label: string;
  status: MilestoneStatus;
  date: Date | null;
}

export const trackingRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { token: string } }>(
    "/api/public/tracking/:token",
    async (request, reply) => {
      const { token } = request.params;

      const project = await prisma.project.findUnique({
        where: { tracking_token: token },
        include: {
          orders: {
            include: {
              lines: { select: { id: true } },
              shipments: {
                select: {
                  id: true,
                  carrier: true,
                  carrier_tracking_ref: true,
                  status: true,
                  estimated_arrival: true,
                  actual_arrival: true,
                },
              },
            },
          },
          consolidation: true,
          last_mile: true,
          installation: {
            select: {
              id: true,
              status: true,
              scheduled_date: true,
              scheduled_slot: true,
              technician_name: true,
              completed_at: true,
            },
          },
        },
      });

      if (!project) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Ce lien de suivi n'est plus valide.",
        });
      }

      // ── Calcul des milestones ───────────────────────────────────────────────

      const allShipments = project.orders.flatMap((o) => o.shipments);

      const milestones: Milestone[] = [];

      // 1. Commande(s) confirmée(s)
      const allConfirmed = project.orders.every((o) => o.status !== "draft");
      const anyConfirmed = project.orders.some((o) => o.status !== "draft");
      milestones.push({
        key: "order_confirmed",
        label: "Commande confirmée",
        status: allConfirmed ? "completed" : anyConfirmed ? "in_progress" : "pending",
        date: project.orders.length > 0
          ? project.orders.reduce((min, o) =>
              o.created_at < min ? o.created_at : min, project.orders[0].created_at)
          : null,
      });

      // 2. Préparation (au moins 1 expédition déclenchée)
      const anyDispatched = allShipments.some(
        (s) => s.status === "in_transit" || s.status === "dispatched" || s.status === "arrived"
      );
      const allDispatched = allShipments.length > 0 && allShipments.every(
        (s) => s.status === "in_transit" || s.status === "dispatched" || s.status === "arrived"
      );
      milestones.push({
        key: "preparation",
        label: "Préparation en entrepôt",
        status: allDispatched ? "completed" : anyDispatched ? "in_progress" : "pending",
        date: allDispatched
          ? allShipments.reduce<Date | null>((max, s) =>
              s.estimated_arrival && (!max || s.estimated_arrival > max) ? s.estimated_arrival : max, null)
          : null,
      });

      // 3. Expédition (tous shipments arrivés à station)
      const allArrived = allShipments.length > 0 && allShipments.every((s) => s.status === "arrived");
      const anyInTransit = allShipments.some((s) => s.status === "in_transit");
      const latestEta = allShipments.reduce<Date | null>((max, s) =>
        s.estimated_arrival && (!max || s.estimated_arrival > max) ? s.estimated_arrival : max, null);
      const lastActualArrival = allShipments.reduce<Date | null>((max, s) =>
        s.actual_arrival && (!max || s.actual_arrival > max) ? s.actual_arrival : max, null);
      milestones.push({
        key: "shipment",
        label: "Expédition",
        status: allArrived ? "completed" : anyInTransit ? "in_progress" : anyDispatched ? "in_progress" : "pending",
        date: allArrived ? lastActualArrival : latestEta,
      });

      // 4. Consolidation (regroupement des colis)
      const consol = project.consolidation;
      milestones.push({
        key: "consolidation",
        label: "Regroupement des colis",
        status: !consol
          ? "pending"
          : consol.status === "complete" || consol.status === "partial_approved"
          ? "completed"
          : consol.status === "in_progress"
          ? "in_progress"
          : "pending",
        date: consol?.estimated_complete_date ?? null,
      });

      // 5. Livraison à domicile
      const lm = project.last_mile;
      milestones.push({
        key: "delivery",
        label: "Livraison à domicile",
        status: !lm
          ? "pending"
          : lm.delivered_at
          ? "completed"
          : lm.scheduled_date
          ? "in_progress"
          : "pending",
        date: lm?.delivered_at ?? lm?.scheduled_date ?? null,
      });

      // 6. Installation (masquée si pas d'installation)
      const inst = project.installation;
      if (inst) {
        milestones.push({
          key: "installation",
          label: "Installation / Pose",
          status: inst.completed_at
            ? "completed"
            : inst.scheduled_date
            ? "in_progress"
            : "pending",
          date: inst.completed_at ?? inst.scheduled_date ?? null,
        });
      }

      // ── Réponse filtrée ────────────────────────────────────────────────────

      return reply.send({
        project_ref: project.customer_id,
        project_type_label: PROJECT_TYPE_LABELS[project.project_type] ?? "Projet",
        status: project.status,
        created_at: project.created_at,

        milestones: milestones.map((m) => ({
          key: m.key,
          label: m.label,
          status: m.status,
          date: m.date,
        })),

        orders: project.orders.map((order) => ({
          ref: order.erp_order_ref,
          status: order.status,
          promised_delivery_date: order.promised_delivery_date,
          promised_installation_date: order.promised_installation_date,
          lines_count: order.lines.length,
          shipments: order.shipments.map((s) => ({
            carrier: s.carrier,
            carrier_tracking_ref: s.carrier_tracking_ref,
            status: s.status,
            estimated_arrival: s.estimated_arrival,
            actual_arrival: s.actual_arrival,
          })),
        })),

        consolidation: consol
          ? {
              status: consol.status,
              orders_arrived: consol.orders_arrived.length,
              orders_required: consol.orders_required.length,
              estimated_complete_date: consol.estimated_complete_date,
            }
          : null,

        last_mile: lm
          ? {
              status: lm.status,
              scheduled_date: lm.scheduled_date,
              scheduled_slot: lm.scheduled_slot,
              delivered_at: lm.delivered_at,
              is_partial: lm.is_partial,
            }
          : null,

        installation: inst
          ? {
              status: inst.status,
              scheduled_date: inst.scheduled_date,
              scheduled_slot: inst.scheduled_slot,
              technician_name: inst.technician_name,
              completed_at: inst.completed_at,
            }
          : null,
      });
    }
  );
};
