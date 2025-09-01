import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertScheduleSchema } from "@shared/schema";
import { format, addDays, startOfWeek } from "date-fns";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Initialize default data
  await storage.initializeVenues();
  await storage.initializeTimeSlots();

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Venues
  app.get('/api/venues', async (req, res) => {
    try {
      const venues = await storage.getVenues();
      res.json(venues);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  // Time slots
  app.get('/api/time-slots', async (req, res) => {
    try {
      const timeSlots = await storage.getTimeSlots();
      res.json(timeSlots);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch time slots" });
    }
  });

  // Schedules
  app.get('/api/schedules/:date', async (req, res) => {
    try {
      const { date } = req.params;
      const schedules = await storage.getSchedulesByDate(date);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch schedules" });
    }
  });

  app.get('/api/schedules', async (req, res) => {
    try {
      const { startDate, endDate } = req.query as { startDate: string; endDate: string };
      const schedules = await storage.getSchedulesByDateRange(startDate, endDate);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch schedules" });
    }
  });

  app.post('/api/schedules', async (req: any, res) => {
    try {
      const validatedData = insertScheduleSchema.parse(req.body);
      const schedule = await storage.upsertSchedule(validatedData);
      res.json(schedule);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put('/api/schedules/:id', async (req: any, res) => {
    try {
      const { className, coachName } = req.body;
      const schedule = await storage.updateSchedule(req.params.id, { className, coachName });
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Failed to update schedule" });
    }
  });

  app.delete('/api/schedules/:id', async (req: any, res) => {
    try {
      await storage.deleteSchedule(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete schedule" });
    }
  });

  // Coach-specific routes
  app.get('/api/coach-schedules', async (req: any, res) => {
    try {
      const { startDate, endDate, coachName } = req.query as { 
        startDate: string; 
        endDate: string; 
        coachName?: string;
      };
      
      // Allow public access with coach name parameter
      if (!coachName) {
        return res.status(400).json({ message: "Coach name is required" });
      }

      const schedules = await storage.getCoachSchedules(coachName, startDate, endDate);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch coach schedules" });
    }
  });

  // Conflicts
  app.get('/api/conflicts/:date', async (req, res) => {
    try {
      const { date } = req.params;
      const conflicts = await storage.getConflicts(date);
      res.json(conflicts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conflicts" });
    }
  });

  // Statistics
  app.get('/api/statistics', async (req: any, res) => {
    try {
      const { startDate, endDate, coachName } = req.query as {
        startDate: string;
        endDate: string;
        coachName?: string;
      };

      const statistics = await storage.getCoachStatistics(startDate, endDate, coachName);
      res.json(statistics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });

  // Coach autocomplete
  app.get('/api/coaches', async (req, res) => {
    try {
      const coaches = await storage.getUniqueCoaches();
      res.json(coaches);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch coaches" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
