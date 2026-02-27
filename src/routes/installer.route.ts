import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Route publique — Portail installateur (Sprint 22)
// GET /api/public/installer/:token
// Retourne une vue centrée sur l'installation et la readiness de livraison.
// L'installateur peut vérifier que les matériels seront livrés à temps.
// Accessible sans authentification via token URL (même pattern que tracking).
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

export const installerRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { token: string } }>(
    "/api/public/installer/:token",
    async (request, reply) => {
      const { token } = request.params;

      const installation = await prisma.installation.findUnique({
        where: { installer_token: token },
        include: {
          project: {
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
            },
          },
        },
      });

      if (!installation) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Ce lien installateur n'est plus valide.",
        });
      }

      const project = installation.project;

      // ── Delivery readiness — commandes prerequis ──────────────────────────

      const prerequisiteOrders = project.orders.filter((o) =>
        installation.orders_prerequisite.includes(o.id),
      );

      // If no prerequisites specified, consider all orders
      const ordersToCheck =
        prerequisiteOrders.length > 0 ? prerequisiteOrders : project.orders;

      const lastMile = project.last_mile;
      const isFullyDelivered =
        lastMile != null &&
        lastMile.delivered_at != null &&
        !lastMile.is_partial;

      const deliveredCount = ordersToCheck.filter((o) =>
        o.status === "closed" || o.status === "delivered",
      ).length;

      const allOrdersReady = deliveredCount === ordersToCheck.length;
      const lastMilePartial = lastMile != null && lastMile.is_partial;
      const ready = isFullyDelivered || (allOrdersReady && !lastMilePartial);

      const deliveryReadiness = {
        ready,
        summary: `${deliveredCount}/${ordersToCheck.length} commandes livrées`,
        orders: ordersToCheck.map((order) => ({
          ref: order.erp_order_ref,
          status: order.status,
          delivered:
            order.status === "closed" || order.status === "delivered",
          promised_delivery_date: order.promised_delivery_date,
          lines_count: order.lines.length,
          shipments: order.shipments.map((s) => ({
            carrier: s.carrier,
            carrier_tracking_ref: s.carrier_tracking_ref,
            status: s.status,
            estimated_arrival: s.estimated_arrival,
            actual_arrival: s.actual_arrival,
          })),
        })),
      };

      // ── Milestones ────────────────────────────────────────────────────────

      const allShipments = project.orders.flatMap((o) => o.shipments);
      const milestones: Milestone[] = [];

      // 1. Commandes confirmées
      const allConfirmed = project.orders.every((o) => o.status !== "draft");
      milestones.push({
        key: "order_confirmed",
        label: "Commandes confirmées",
        status: allConfirmed ? "completed" : "in_progress",
        date: project.orders.length > 0
          ? project.orders.reduce(
              (min, o) => (o.created_at < min ? o.created_at : min),
              project.orders[0].created_at,
            )
          : null,
      });

      // 2. Expéditions arrivées en station
      const allArrived =
        allShipments.length > 0 &&
        allShipments.every((s) => s.status === "arrived");
      const anyInTransit = allShipments.some(
        (s) => s.status === "in_transit" || s.status === "dispatched",
      );
      const lastActualArrival = allShipments.reduce<Date | null>(
        (max, s) =>
          s.actual_arrival && (!max || s.actual_arrival > max)
            ? s.actual_arrival
            : max,
        null,
      );
      milestones.push({
        key: "shipment",
        label: "Expéditions arrivées",
        status: allArrived
          ? "completed"
          : anyInTransit
            ? "in_progress"
            : "pending",
        date: lastActualArrival,
      });

      // 3. Consolidation
      const consol = project.consolidation;
      milestones.push({
        key: "consolidation",
        label: "Regroupement colis",
        status: !consol
          ? "pending"
          : consol.status === "complete" ||
              consol.status === "partial_approved"
            ? "completed"
            : consol.status === "in_progress"
              ? "in_progress"
              : "pending",
        date: consol?.estimated_complete_date ?? null,
      });

      // 4. Livraison client
      milestones.push({
        key: "delivery",
        label: "Livraison client",
        status: !lastMile
          ? "pending"
          : lastMile.delivered_at && !lastMile.is_partial
            ? "completed"
            : lastMile.scheduled_date
              ? "in_progress"
              : "pending",
        date: lastMile?.delivered_at ?? lastMile?.scheduled_date ?? null,
      });

      // 5. Votre intervention
      milestones.push({
        key: "installation",
        label: "Votre intervention",
        status: installation.completed_at
          ? "completed"
          : installation.started_at
            ? "in_progress"
            : installation.scheduled_date
              ? "pending"
              : "pending",
        date:
          installation.completed_at ??
          installation.scheduled_date ??
          null,
      });

      // ── Réponse ───────────────────────────────────────────────────────────

      return reply.send({
        installation: {
          status: installation.status,
          scheduled_date: installation.scheduled_date,
          scheduled_slot: installation.scheduled_slot,
          installation_address: installation.installation_address,
          technician_name: installation.technician_name,
          wfm_job_ref: installation.wfm_job_ref,
        },
        project_ref: project.customer_id,
        project_type_label:
          PROJECT_TYPE_LABELS[project.project_type] ?? "Projet",
        delivery_readiness: deliveryReadiness,
        consolidation: consol
          ? {
              status: consol.status,
              orders_arrived: consol.orders_arrived.length,
              orders_required: consol.orders_required.length,
              estimated_complete_date: consol.estimated_complete_date,
            }
          : null,
        last_mile: lastMile
          ? {
              status: lastMile.status,
              scheduled_date: lastMile.scheduled_date,
              scheduled_slot: lastMile.scheduled_slot,
              delivered_at: lastMile.delivered_at,
              is_partial: lastMile.is_partial,
            }
          : null,
        milestones: milestones.map((m) => ({
          key: m.key,
          label: m.label,
          status: m.status,
          date: m.date,
        })),
      });
    },
  );
};
