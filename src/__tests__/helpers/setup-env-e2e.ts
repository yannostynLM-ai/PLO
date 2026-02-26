// =============================================================================
// Setup — E2E : charge le vrai .env puis complète les valeurs manquantes
// =============================================================================

import dotenv from "dotenv";
dotenv.config();

// Only override if not already set by .env
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";
