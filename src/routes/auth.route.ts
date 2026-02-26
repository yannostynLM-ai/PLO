// =============================================================================
// Routes d'authentification opérateur — Sprint 9
// POST /api/auth/login   — public, retourne cookie httpOnly plo_session
// GET  /api/auth/me      — protégé (scope inline), renvoie le payload JWT
// POST /api/auth/logout  — public, efface le cookie
// =============================================================================

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import jwtAuthPlugin from "../plugins/jwt-auth.plugin.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LoginBodySchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

/** Convertit "8h" → 28800 (secondes), utilisé pour maxAge du cookie */
function parseExpiresInSeconds(expires: string): number {
  const match = /^(\d+)([hHdDmM])$/.exec(expires);
  if (!match) return 8 * 3600;
  const n = parseInt(match[1], 10);
  switch (match[2].toLowerCase()) {
    case "h": return n * 3600;
    case "d": return n * 86_400;
    case "m": return n * 60;
    default:  return 8 * 3600;
  }
}

/** Hash bidon pour comparer si l'utilisateur n'existe pas (anti-timing) */
const DUMMY_HASH = "$2b$10$invalidhashpadding0000000000000000000000000000";

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const authRoute: FastifyPluginAsync = async (fastify) => {

  // --------------------------------------------------------------------------
  // POST /api/auth/login
  // --------------------------------------------------------------------------
  fastify.post("/api/auth/login", async (request, reply) => {
    const bodyResult = LoginBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: "Payload invalide",
        details: bodyResult.error.flatten(),
      });
    }

    const { email, password } = bodyResult.data;

    const user = await prisma.user.findUnique({ where: { email } });

    // Anti-timing : toujours faire un compare même si user inconnu
    const hash = user?.password_hash ?? DUMMY_HASH;
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Identifiants invalides",
      });
    }

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as string,
    };

    const token = fastify.jwt.sign(payload, {
      expiresIn: config.JWT_EXPIRES_IN,
    });

    const maxAge = parseExpiresInSeconds(config.JWT_EXPIRES_IN);

    return reply
      .setCookie("plo_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge,
      })
      .code(200)
      .send({ user: payload });
  });

  // --------------------------------------------------------------------------
  // GET /api/auth/me — protégé par jwtAuthPlugin (scope inline)
  // --------------------------------------------------------------------------
  await fastify.register(async (meScope) => {
    await meScope.register(jwtAuthPlugin);

    meScope.get("/api/auth/me", async (request, reply) => {
      return reply.send({ user: request.jwtUser });
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/auth/logout
  // --------------------------------------------------------------------------
  fastify.post("/api/auth/logout", async (_request, reply) => {
    return reply
      .clearCookie("plo_session", { path: "/" })
      .code(200)
      .send({ message: "Déconnecté" });
  });
};
