// =============================================================================
// Plugin JWT — Authentification opérateur par cookie httpOnly (Sprint 9)
// SSO-ready : ce plugin ne fait que vérifier le JWT.
// Une future callback SAML/OIDC signera le même JWT → routes opérateur inchangées.
// =============================================================================

import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

export interface JwtUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

// Augmentation des types Fastify
declare module "fastify" {
  interface FastifyRequest {
    jwtUser: JwtUser;
  }
}

const jwtAuthPlugin: FastifyPluginAsync = async (fastify) => {
  // Décorer request.jwtUser avec une valeur par défaut
  fastify.decorateRequest("jwtUser", null as unknown as JwtUser);

  fastify.addHook("onRequest", async (request, reply) => {
    try {
      // @fastify/jwt lit automatiquement le cookie "plo_session"
      // grâce à la config { cookie: { cookieName: "plo_session" } } dans server.ts
      request.jwtUser = await request.jwtVerify<JwtUser>();
    } catch {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Session absente ou expirée — veuillez vous connecter",
      });
    }
  });
};

export default fp(jwtAuthPlugin, {
  name: "plo-jwt-auth",
  fastify: "5.x",
  dependencies: ["@fastify/jwt", "@fastify/cookie"],
});
