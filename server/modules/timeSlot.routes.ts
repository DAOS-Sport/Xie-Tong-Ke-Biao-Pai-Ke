import type { Express } from "express";
import { storage } from "../storage";

export function registerTimeSlotRoutes(app: Express): void {
  app.get("/api/time-slots", async (_req, res) => {
    try {
      const timeSlots = await storage.getTimeSlots();
      res.json(timeSlots);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch time slots" });
    }
  });
}
