import type { Express } from "express";
import { syncRagicAll, getRagicSyncStatus } from "../ragic";
import { requireAdminPassword } from "../shared/auth/adminPassword";

export function registerRagicRoutes(app: Express): void {
  app.get(
    "/api/admin/ragic-status",
    requireAdminPassword,
    async (_req, res) => {
      res.json(getRagicSyncStatus());
    }
  );

  app.post(
    "/api/admin/ragic-sync",
    requireAdminPassword,
    async (_req, res) => {
      try {
        const result = await syncRagicAll();
        res.json({ success: true, ...result });
      } catch (error) {
        console.error("Manual Ragic sync error:", error);
        res.status(500).json({ message: "同步失敗", error: String(error) });
      }
    }
  );
}
