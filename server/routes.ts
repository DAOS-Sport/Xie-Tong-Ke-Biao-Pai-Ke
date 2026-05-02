/**
 * Thin entrypoint that wires the Express app together.
 *
 * Per-feature handlers live in `server/modules/*.routes.ts` and are
 * registered through `registerAllModules`. Boot-time data fixes and
 * multi-school schema setup live in `server/infra/startup.ts`.
 *
 * Anything you would otherwise add inline here should instead live in
 * its own module under `server/modules/` and be wired via the registry.
 */
import type { Express } from "express";
import { createServer, type Server } from "http";

import { setupAuth } from "./replitAuth";
import { runStartupFixes, initializeAppData } from "./infra/startup";
import { registerAllModules } from "./modules/_registry";
import {
  setupWeeklyNotificationCron,
  setupDailyNotificationCron,
} from "./line-notify";
import { setupRagicSyncCron } from "./ragic";

export async function registerRoutes(app: Express): Promise<Server> {
  // 1. Auth middleware (sessions + Replit OIDC)
  await setupAuth(app);

  // 2. One-time data fixes (idempotent)
  await runStartupFixes();

  // 3. Default rows + multi-school schemas
  await initializeAppData();

  // 4. All feature modules
  registerAllModules(app);

  // 5. Background jobs
  setupWeeklyNotificationCron();
  setupDailyNotificationCron();
  setupRagicSyncCron();

  return createServer(app);
}
