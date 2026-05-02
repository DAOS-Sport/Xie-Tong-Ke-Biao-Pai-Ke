import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { coachUsers, venues } from "@shared/schema";
import { storage } from "../storage";
import { initializeSchoolSchema, getAvailableSchools } from "../multi-school-db";
import { env, validateConfig } from "../config/env";
import { featureFlags } from "../config/featureFlags";

/**
 * Hard-fails the boot if required configuration is missing.
 * Called once from server/routes.ts before any module is wired up.
 */
export function assertBootConfig(): void {
  validateConfig();
}

/**
 * One-time, idempotent data fixes applied at boot.
 * Each block is wrapped so a failure in one fix does not stop others.
 */
export async function runStartupFixes(): Promise<void> {
  try {
    const result = await db
      .update(coachUsers)
      .set({ name: "林聖潤", linkedCoachName: "林聖潤" })
      .where(
        and(
          eq(coachUsers.name, "聖潤"),
          eq(coachUsers.id, "6b069216-12c8-4022-aa67-40de8a8c19f8")
        )
      )
      .returning({ id: coachUsers.id, name: coachUsers.name });
    if (result.length > 0) {
      console.log(
        `[Migration] Renamed coach "聖潤" → "林聖潤" (id: ${result[0].id})`
      );
    }
  } catch (err) {
    console.error("[Migration] runStartupFixes failed:", err);
  }

  try {
    const fixed = await db
      .update(venues)
      .set({ color: "blue" })
      .where(and(eq(venues.name, "士林國中"), eq(venues.color, "cyan")))
      .returning({ id: venues.id, name: venues.name });
    if (fixed.length > 0) {
      console.log(`[Migration] Fixed 士林國中 color: cyan → blue`);
    }
  } catch (err) {
    console.error("[Migration] Fix 士林國中 color failed:", err);
  }
}

/**
 * Initializes shared default rows (venues, time slots) and the per-school
 * Postgres schemas used by the multi-school feature.
 *
 * In production this throws on initialization failure (deployment must abort);
 * in development it logs and continues so the dev server still boots.
 */
export async function initializeAppData(): Promise<void> {
  await storage.initializeVenues();
  await storage.initializeTimeSlots();

  const tag = env.isDeployment ? "🚀 PRODUCTION" : "🛠️ DEVELOPMENT";

  if (!featureFlags.enableSchoolModule) {
    console.log(`${tag}: Multi-school module disabled via feature flag — skipping init`);
    return;
  }

  try {
    console.log(`${tag}: Initializing multi-school system...`);

    if (!env.databaseUrl) {
      throw new Error(
        "DATABASE_URL not configured - cannot initialize multi-school system"
      );
    }

    console.log(`${tag}: Creating schemas...`);
    for (const code of getAvailableSchools()) {
      await initializeSchoolSchema(code);
      console.log(`${tag}: ✅ school_${code} initialized`);
    }

    console.log(`${tag}: ✅ Multi-school system initialized successfully`);
  } catch (error) {
    console.error(`${tag}: ❌ Multi-school initialization FAILED:`, error);

    if (env.isDeployment) {
      console.error(
        "🚨 CRITICAL: Production deployment failed to initialize database!"
      );
      console.error("🔧 Please check:");
      console.error("   1. DATABASE_URL environment variable is set");
      console.error("   2. Database is accessible");
      console.error("   3. Database has necessary permissions");
      throw error;
    } else {
      console.error(
        "⚠️ Development initialization error (continuing anyway):",
        error
      );
    }
  }
}
