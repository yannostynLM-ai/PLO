// =============================================================================
// Setup — Variables d'environnement minimales pour que config.ts se charge
// =============================================================================

process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/plo_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.JWT_SECRET = "test-jwt-secret-for-vitest";
process.env.API_KEY_ERP = "test-key-erp";
process.env.API_KEY_OMS = "test-key-oms";
process.env.API_KEY_TMS_LASTMILE = "test-key-tms";
process.env.API_KEY_MANUAL = "test-key-manual";
process.env.API_KEY_WFM = "test-key-wfm";
process.env.API_KEY_CRM = "test-key-crm";
process.env.API_KEY_ECOMMERCE = "test-key-ecommerce";
process.env.ADMIN_EMAIL = "admin@plo.local";
process.env.ADMIN_PASSWORD = "admin-password";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
