/**
 * Central registry — wires every per-feature module into the Express app
 * in a known, deterministic order.
 *
 * Modules are intentionally loose-coupled: each `register*Routes` only
 * touches its own URL space and the shared `storage` façade. New modules
 * should be added here, never inlined into routes.ts.
 */
import type { Express } from "express";

import { registerAuthRoutes } from "./auth.routes";
import { registerVenueRoutes } from "./venue.routes";
import { registerTimeSlotRoutes } from "./timeSlot.routes";
import { registerScheduleRoutes } from "./schedule.routes";
import { registerCoachRoutes } from "./coach.routes";
import { registerCoachPortalRoutes } from "./coachPortal.routes";
import { registerCoachAdminRoutes } from "./coachAdmin.routes";
import { registerNotifyRoutes } from "./notify.routes";
import { registerRagicRoutes } from "./ragic.routes";
import { registerSchoolRoutes } from "./school.routes";
import { registerDiagnosticRoutes } from "./diagnostic.routes";

export function registerAllModules(app: Express): void {
  // Auth must come first so downstream modules can rely on req.user etc.
  registerAuthRoutes(app);

  // Domain modules
  registerVenueRoutes(app);
  registerTimeSlotRoutes(app);
  registerScheduleRoutes(app);
  registerCoachRoutes(app);
  registerCoachPortalRoutes(app);
  registerCoachAdminRoutes(app);
  registerNotifyRoutes(app);
  registerRagicRoutes(app);

  // Multi-school is isolated and uses its own repository.
  registerSchoolRoutes(app);

  // Operational endpoints
  registerDiagnosticRoutes(app);
}
