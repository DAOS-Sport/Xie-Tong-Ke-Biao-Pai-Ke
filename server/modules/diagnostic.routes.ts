import type { Express } from "express";
import { env } from "../config/env";
import * as schoolRepo from "./school.repo";

export function registerDiagnosticRoutes(app: Express): void {
  app.get("/api/deployment-test", async (_req, res) => {
    try {
      const isDeployment = env.isDeployment || process.env.REPL_SLUG !== undefined;
      const hasDbUrl = !!process.env.DATABASE_URL;

      console.log("🔍 Deployment Diagnostic:");
      console.log("- REPLIT_DEPLOYMENT:", process.env.REPLIT_DEPLOYMENT);
      console.log("- NODE_ENV:", process.env.NODE_ENV);
      console.log("- REPL_SLUG:", process.env.REPL_SLUG);
      console.log("- Has DATABASE_URL:", hasDbUrl);
      console.log("- Final isDeployment:", isDeployment);

      let dbTestResult = "failed";
      try {
        const ok = await schoolRepo.pingSchoolDb("demo");
        dbTestResult = ok ? "success" : "failed";
      } catch (dbError) {
        console.error("Database test error:", dbError);
      }

      res.json({
        deployment: isDeployment,
        replit_deployment: process.env.REPLIT_DEPLOYMENT,
        node_env: process.env.NODE_ENV,
        repl_slug: process.env.REPL_SLUG,
        database_url_exists: hasDbUrl,
        database_connection: dbTestResult,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
      });
    } catch (error) {
      console.error("Deployment test error:", error);
      res.status(500).json({ error: "Test failed" });
    }
  });
}
