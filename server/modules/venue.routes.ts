import type { Express } from "express";
import { storage } from "../storage";
import { requireAdminPassword } from "../shared/auth/adminPassword";

export function registerVenueRoutes(app: Express): void {
  app.get("/api/venues", async (_req, res) => {
    try {
      const venues = await storage.getVenues();
      res.json(venues);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  app.post("/api/admin/venues", requireAdminPassword, async (req, res) => {
    try {
      const { name, color } = req.body;
      if (!name || !color) {
        return res.status(400).json({ message: "Name and color are required" });
      }
      const existingVenues = await storage.getVenues();
      if (existingVenues.some((v) => v.name === name)) {
        return res.status(400).json({ message: "場館名稱已存在" });
      }
      const venue = await storage.createVenue(name, color);
      res.json(venue);
    } catch (error) {
      console.error("Error creating venue:", error);
      res.status(500).json({ message: "Failed to create venue" });
    }
  });

  app.delete("/api/admin/venues/:id", requireAdminPassword, async (req, res) => {
    try {
      await storage.deleteVenue(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting venue:", error);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  // Venue info (descriptions / map / video links)
  app.get("/api/venue-infos", async (_req, res) => {
    try {
      const infos = await storage.getAllVenueInfos();
      res.json(infos);
    } catch (error) {
      console.error("Error fetching venue infos:", error);
      res.status(500).json({ message: "查詢場館資訊失敗" });
    }
  });

  app.put(
    "/api/admin/venue-infos/:venueName",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { venueName } = req.params;
        const { videoUrl, description, mapUrl } = req.body;
        const info = await storage.upsertVenueInfo(
          decodeURIComponent(venueName),
          videoUrl || null,
          description || null,
          mapUrl || null
        );
        res.json(info);
      } catch (error) {
        console.error("Error updating venue info:", error);
        res.status(500).json({ message: "更新場館資訊失敗" });
      }
    }
  );
}
