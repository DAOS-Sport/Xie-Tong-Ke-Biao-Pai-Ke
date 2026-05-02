/**
 * Centralized environment / runtime configuration.
 *
 * Reads from process.env once and exposes typed, validated values.
 * Anywhere else in the codebase should import from here instead of
 * touching `process.env` directly.
 */

const isProduction = (): boolean => {
  return process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
};

const isDeployment = (): boolean => process.env.REPLIT_DEPLOYMENT === "1";

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[config] Required environment variable "${key}" is not set`);
  }
  return value;
};

const optional = (key: string, fallback: string): string => {
  return process.env[key] || fallback;
};

const adminPassword = (): string => {
  const value = process.env.ADMIN_PASSWORD;
  if (value) return value;
  if (isProduction()) {
    throw new Error(
      "[config] ADMIN_PASSWORD must be set as an environment variable in production"
    );
  }
  // Dev convenience only — never leak this value into prod
  console.warn("[config] ADMIN_PASSWORD not set; using development fallback");
  return "dev-admin";
};

export const env = {
  isProduction: isProduction(),
  isDeployment: isDeployment(),
  databaseUrl: required("DATABASE_URL"),
  port: parseInt(optional("PORT", "5000"), 10),
  // LINE
  lineChannelId: process.env.LINE_CHANNEL_ID || null,
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || null,
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || null,
  // Ragic
  ragicApiKey: process.env.RAGIC_API_KEY || null,
  // Replit auth
  replitDomains: process.env.REPLIT_DOMAINS || null,
  // Public origin used for OAuth callbacks
  publicOrigin: optional(
    "PUBLIC_ORIGIN",
    "https://swim-scheduler-ronchen2.replit.app"
  ),
  // Admin password (loaded lazily so dev imports don't throw if missing)
  get adminPassword(): string {
    return adminPassword();
  },
};

export type AppEnv = typeof env;
