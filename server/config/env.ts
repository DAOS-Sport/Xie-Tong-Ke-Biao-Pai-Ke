/**
 * Centralized environment / runtime configuration.
 *
 * Reads from process.env once at module load and exposes typed values.
 * Production deployments fail fast at boot if any required value
 * (DATABASE_URL, ADMIN_PASSWORD) is missing — see `validateConfig()`.
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

const PROD = isProduction();

const resolveAdminPassword = (): string => {
  const value = process.env.ADMIN_PASSWORD;
  if (value) return value;
  if (PROD) {
    throw new Error(
      "[config] ADMIN_PASSWORD must be set as an environment variable in production"
    );
  }
  console.warn("[config] ADMIN_PASSWORD not set; using development fallback");
  return "dev-admin";
};

const ADMIN_PASSWORD = resolveAdminPassword();

export const env = {
  isProduction: PROD,
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
  // Admin password — resolved eagerly above so prod throws at boot
  adminPassword: ADMIN_PASSWORD,
  // Weekly push (Task #23)
  healthchecksWeeklyPushUrl: process.env.HEALTHCHECKS_WEEKLY_PUSH_URL || null,
  healthchecksWeeklyPushEnabled: !["0", "false", "off", "no"].includes(
    (process.env.HEALTHCHECKS_WEEKLY_PUSH_ENABLED || "").toLowerCase().trim()
  ),
  // NOTE: report format is CSV-only for Task #23. The WEEKLY_PUSH_REPORT_FORMAT
  // env var was intentionally not added to avoid implying xlsx/json switching
  // that doesn't exist yet. Add it back when a second format is implemented.
  weeklyPushCron: optional("WEEKLY_PUSH_CRON", "0 19 * * 0"),
  weeklyPushTimezone: optional("WEEKLY_PUSH_TIMEZONE", "Asia/Taipei"),
};

export type AppEnv = typeof env;

/**
 * Re-validate configuration at app startup. The module-level resolution
 * above already throws if ADMIN_PASSWORD is missing in production; this
 * function makes the failure point explicit and gives a single hook for
 * future required-config additions.
 */
export function validateConfig(): void {
  if (env.isProduction && !process.env.ADMIN_PASSWORD) {
    throw new Error(
      "[config] ADMIN_PASSWORD env var is required in production"
    );
  }
  if (!env.databaseUrl) {
    throw new Error("[config] DATABASE_URL is required");
  }
}
