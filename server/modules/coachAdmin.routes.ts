import type { Express } from "express";
import { storage } from "../storage";
import { requireAdminPassword } from "../shared/auth/adminPassword";

export function registerCoachAdminRoutes(app: Express): void {
  // Used by the client password screen to validate the typed password
  // against the server-side ADMIN_PASSWORD without leaking the literal.
  app.post("/api/admin/verify-password", requireAdminPassword, (_req, res) => {
    res.json({ ok: true });
  });

  app.get(
    "/api/admin/coach-users",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { status } = req.query as { status?: string };
        if (status === "pending") {
          const users = await storage.getPendingCoachUsers();
          res.json(users);
        } else {
          const users = await storage.getAllCoachUsers();
          res.json(users);
        }
      } catch (error) {
        console.error("Error fetching coach users:", error);
        res.status(500).json({ message: "查詢教練用戶失敗" });
      }
    }
  );

  app.put(
    "/api/admin/coach-users/:id/status",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        if (!["approved", "rejected"].includes(status)) {
          return res
            .status(400)
            .json({ message: "狀態只能是 approved 或 rejected" });
        }
        const user = await storage.updateCoachUserStatus(id, status);
        res.json(user);
      } catch (error) {
        console.error("Error updating coach user status:", error);
        res.status(500).json({ message: "更新審核狀態失敗" });
      }
    }
  );

  app.put(
    "/api/admin/coach-users/:id/name",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || typeof name !== "string" || !name.trim()) {
          return res.status(400).json({ message: "姓名不得為空" });
        }
        const user = await storage.updateCoachUserName(id, name.trim());
        if (!user) return res.status(404).json({ message: "找不到教練" });
        res.json(user);
      } catch (error) {
        console.error("Error updating coach user name:", error);
        res.status(500).json({ message: "更新姓名失敗" });
      }
    }
  );

  app.put(
    "/api/admin/settings/coach-rules",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { content } = req.body;
        if (typeof content !== "string") {
          return res.status(400).json({ message: "內容格式無效" });
        }
        await storage.setSetting("coach_rules", content);
        res.json({ success: true });
      } catch (error) {
        console.error("Error updating coach rules:", error);
        res.status(500).json({ message: "更新教練守則失敗" });
      }
    }
  );

  // SWIM-03: Coach fill-rate dashboard
  app.get(
    "/api/admin/coach-fillrate",
    requireAdminPassword,
    async (_req, res) => {
      try {
        const approved = await storage.getApprovedCoachUsers();
        const coachDataList = await Promise.all(
          approved.map(async (coach) => {
            const coachName = coach.linkedCoachName || coach.name;
            const { availabilitySlots, venuePrefsCount } =
              await storage.getCoachFillStatus(coachName);
            return {
              name: coachName,
              lineId: coach.lineId || null,
              hasAvailability: availabilitySlots > 0,
              availabilitySlots,
              hasVenuePrefs: venuePrefsCount > 0,
              venuePrefsCount,
            };
          })
        );
        const summary = {
          total: coachDataList.length,
          filledAvailability: coachDataList.filter((c) => c.hasAvailability)
            .length,
          filledVenuePrefs: coachDataList.filter((c) => c.hasVenuePrefs).length,
          linkedLine: coachDataList.filter((c) => c.lineId).length,
        };
        res.json({ coaches: coachDataList, summary });
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch fillrate" });
      }
    }
  );

  // LINE ID admin binding controls
  app.post(
    "/api/admin/set-coach-line-id",
    requireAdminPassword,
    async (req, res) => {
      const { coachUserId, lineId } = req.body;
      if (!coachUserId || !lineId) {
        return res.status(400).json({ message: "缺少 coachUserId 或 lineId" });
      }
      const existing = await storage.getCoachUserByLineId(lineId);
      if (existing && existing.id !== coachUserId) {
        return res.status(409).json({
          message: `此 LINE ID 已綁定給「${existing.name}」，請先清除再綁定`,
        });
      }
      const updated = await storage.updateCoachUserLineId(coachUserId, lineId);
      res.json(updated);
    }
  );

  app.delete(
    "/api/admin/clear-coach-line-id/:id",
    requireAdminPassword,
    async (req, res) => {
      const updated = await storage.clearCoachUserLineId(req.params.id);
      res.json(updated);
    }
  );
}
