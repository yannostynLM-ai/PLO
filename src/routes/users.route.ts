import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { logActivity } from "../lib/activity.js";

// =============================================================================
// Routes admin — Gestion des utilisateurs opérateurs (Sprint 10)
// GET    /api/users                    — liste tous les utilisateurs
// POST   /api/users                    — créer un utilisateur
// PATCH  /api/users/:id                — modifier nom + rôle
// POST   /api/users/:id/reset-password — nouveau mot de passe
// DELETE /api/users/:id                — supprimer
// Toutes ces routes requièrent role === "admin" (403 sinon)
// =============================================================================

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, "Minimum 8 caractères"),
  role: z.enum(["admin", "coordinator", "viewer"]).default("viewer"),
});

const PatchUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "coordinator", "viewer"]).optional(),
});

const ResetPasswordSchema = z.object({
  password: z.string().min(8, "Minimum 8 caractères"),
});

// Champs renvoyés au client (jamais password_hash)
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  created_at: true,
  updated_at: true,
} as const;

export const usersRoute: FastifyPluginAsync = async (fastify) => {
  // ── Guard admin ──────────────────────────────────────────────────────────
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.jwtUser?.role !== "admin") {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Accès réservé aux administrateurs",
      });
    }
  });

  // --------------------------------------------------------------------------
  // GET /api/users
  // --------------------------------------------------------------------------
  fastify.get("/api/users", async (_request, reply) => {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { created_at: "asc" },
    });
    return reply.send({ users });
  });

  // --------------------------------------------------------------------------
  // POST /api/users
  // --------------------------------------------------------------------------
  fastify.post("/api/users", async (request, reply) => {
    const bodyResult = CreateUserSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: "Payload invalide",
        details: bodyResult.error.flatten(),
      });
    }

    const { email, name, password, role } = bodyResult.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Un utilisateur avec cet email existe déjà",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, name, role, password_hash },
      select: userSelect,
    });

    logActivity({
      action:        "user_created",
      entity_type:   "user",
      entity_id:     user.id,
      entity_label:  user.email,
      operator_name: request.jwtUser.name,
    });

    return reply.code(201).send({ user });
  });

  // --------------------------------------------------------------------------
  // PATCH /api/users/:id
  // --------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string } }>("/api/users/:id", async (request, reply) => {
    const { id } = request.params;

    const bodyResult = PatchUserSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: "Payload invalide",
        details: bodyResult.error.flatten(),
      });
    }

    // Empêcher auto-rétrogradation
    if (id === request.jwtUser.id && bodyResult.data.role && bodyResult.data.role !== "admin") {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Vous ne pouvez pas modifier votre propre rôle",
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Utilisateur introuvable",
      });
    }

    const user = await prisma.user.update({
      where: { id },
      data: bodyResult.data,
      select: userSelect,
    });

    return reply.send({ user });
  });

  // --------------------------------------------------------------------------
  // POST /api/users/:id/reset-password
  // --------------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>("/api/users/:id/reset-password", async (request, reply) => {
    const { id } = request.params;

    const bodyResult = ResetPasswordSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: "Payload invalide",
        details: bodyResult.error.flatten(),
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Utilisateur introuvable",
      });
    }

    const password_hash = await bcrypt.hash(bodyResult.data.password, 10);
    await prisma.user.update({
      where: { id },
      data: { password_hash },
    });

    return reply.send({ message: "Mot de passe réinitialisé avec succès" });
  });

  // --------------------------------------------------------------------------
  // DELETE /api/users/:id
  // --------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string } }>("/api/users/:id", async (request, reply) => {
    const { id } = request.params;

    // Interdire l'auto-suppression
    if (id === request.jwtUser.id) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Vous ne pouvez pas supprimer votre propre compte",
      });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Utilisateur introuvable",
      });
    }

    await prisma.user.delete({ where: { id } });

    logActivity({
      action:        "user_deleted",
      entity_type:   "user",
      entity_id:     id,
      entity_label:  existing.email,
      operator_name: request.jwtUser.name,
    });

    return reply.send({ message: "Utilisateur supprimé avec succès" });
  });
};
