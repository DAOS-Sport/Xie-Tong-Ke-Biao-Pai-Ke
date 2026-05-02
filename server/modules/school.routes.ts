import type { Express, Request, Response, NextFunction } from "express";
import {
  initializeSchoolSchema,
  isValidSchoolCode,
  getAvailableSchools,
} from "../multi-school-db";
import * as schoolRepo from "./school.repo";
import { env } from "../config/env";

/**
 * Defence-in-depth: schoolCode must pass BOTH the regex (no SQL-unsafe chars)
 * AND the whitelist of registered schools. Either fail short-circuits.
 */
const validateSchoolCode = (req: Request, res: Response, next: NextFunction) => {
  const { schoolCode } = req.params;
  if (!isValidSchoolCode(schoolCode)) {
    return res.status(400).json({ message: "Invalid school code" });
  }
  if (!getAvailableSchools().includes(schoolCode)) {
    return res.status(404).json({ message: "Unknown school code" });
  }
  next();
};

export function registerSchoolRoutes(app: Express): void {
  app.post("/api/admin/init-school/:schoolCode", async (req, res) => {
    try {
      const { schoolCode } = req.params;
      if (!isValidSchoolCode(schoolCode)) {
        return res.status(400).json({ message: "Invalid school code" });
      }
      await initializeSchoolSchema(schoolCode);
      res.json({ message: `School ${schoolCode} initialized successfully` });
    } catch (error) {
      console.error("Error initializing school:", error);
      res.status(500).json({ message: "Failed to initialize school" });
    }
  });

  app.post("/api/admin/import-schedule/:schoolCode", async (req, res) => {
    try {
      const { schoolCode } = req.params;
      if (!isValidSchoolCode(schoolCode)) {
        return res.status(400).json({ message: "Invalid school code" });
      }
      const { importScheduleData } = await import("../import-schedule");
      const count = await importScheduleData();
      res.json({
        message: `Successfully imported ${count} schedule records`,
        count,
      });
    } catch (error) {
      console.error("Error importing schedule:", error);
      res.status(500).json({ message: "Failed to import schedule data" });
    }
  });

  app.get("/api/:schoolCode/teachers", validateSchoolCode, async (req, res) => {
    try {
      const teachers = await schoolRepo.listTeachers(req.params.schoolCode);
      console.log(
        `✅ Fetched ${teachers.length} teachers for school ${req.params.schoolCode}`
      );
      res.json(teachers);
    } catch (error) {
      console.error("Error fetching teachers:", error);
      res.status(500).json({ message: "Failed to fetch teachers" });
    }
  });

  // Per-school endpoints that simply mirror the shared catalog
  app.get("/api/:schoolCode/time-slots", validateSchoolCode, async (_req, res) => {
    try {
      const { storage } = await import("../storage");
      const timeSlots = await storage.getTimeSlots();
      res.json(timeSlots);
    } catch (error) {
      console.error("Error fetching time slots:", error);
      res.status(500).json({ message: "Failed to fetch time slots" });
    }
  });

  app.get("/api/:schoolCode/venues", validateSchoolCode, async (_req, res) => {
    try {
      const { storage } = await import("../storage");
      const venues = await storage.getVenues();
      res.json(venues);
    } catch (error) {
      console.error("Error fetching venues:", error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  app.get("/api/:schoolCode/schedules", validateSchoolCode, async (req, res) => {
    try {
      const { teacher, startDate, endDate } = req.query as {
        teacher?: string;
        startDate?: string;
        endDate?: string;
      };
      const list = await schoolRepo.listSchedules(req.params.schoolCode, {
        teacher,
        startDate,
        endDate,
      });
      res.json(list);
    } catch (error) {
      console.error("Error fetching school schedules:", error);
      res.status(500).json({ message: "Failed to fetch schedules" });
    }
  });

  app.get("/api/:schoolCode/feedbacks", validateSchoolCode, async (req, res) => {
    try {
      const { teacher, scheduleId } = req.query as {
        teacher?: string;
        scheduleId?: string;
      };
      const list = await schoolRepo.listFeedbacks(req.params.schoolCode, {
        teacher,
        scheduleId,
      });
      res.json(list);
    } catch (error) {
      console.error("Error fetching teacher feedbacks:", error);
      res.status(500).json({ message: "Failed to fetch feedbacks" });
    }
  });

  app.post("/api/:schoolCode/feedbacks", validateSchoolCode, async (req, res) => {
    const isDeployment = env.isDeployment;
    const { schoolCode } = req.params;

    try {
      if (!process.env.DATABASE_URL) {
        console.error("❌ 資料庫未配置");
        return res.status(503).json({
          message: "Database not configured",
          error: "Please set up DATABASE_URL environment variable",
          isDeployment,
          setupRequired: true,
        });
      }

      if (isDeployment) {
        console.log("🚀 PRODUCTION: Saving feedback for school:", schoolCode);
      }

      if (!req.body.scheduleId || req.body.scheduleId.length < 10) {
        return res
          .status(400)
          .json({ message: "Invalid schedule ID - ID is required" });
      }

      // Validate via the shared zod schema before going into the repo
      const { insertTeacherFeedbackSchema } = await import("@shared/schema");
      const validation = insertTeacherFeedbackSchema.safeParse(req.body);
      if (!validation.success) {
        console.error("❌ Validation failed:", validation.error.issues);
        return res.status(400).json({
          message: "Invalid feedback data",
          errors: validation.error.issues,
        });
      }

      const feedbackData = validation.data;
      if (feedbackData.status === "reschedule") {
        if (!feedbackData.rescheduleDate || !feedbackData.reschedulePeriod) {
          return res.status(400).json({
            message:
              "Reschedule date and period are required when status is reschedule",
          });
        }
      }

      const saved = await schoolRepo.upsertFeedback(schoolCode, {
        scheduleId: feedbackData.scheduleId,
        teacherName: feedbackData.teacherName,
        status: feedbackData.status,
        rescheduleDate: feedbackData.rescheduleDate || null,
        reschedulePeriod: feedbackData.reschedulePeriod || null,
        comment: feedbackData.comment || null,
      });

      res.json(saved);
    } catch (error) {
      console.error("💥 ERROR: Failed to save teacher feedback:", error);
      res.status(500).json({
        message: "Failed to save feedback",
        error: isDeployment
          ? error instanceof Error
            ? error.message
            : String(error)
          : "Database error",
        schoolCode,
        when: new Date().toISOString(),
      });
    }
  });

  app.post("/api/:schoolCode/schedules", validateSchoolCode, async (req, res) => {
    try {
      const result = await schoolRepo.createSchoolSchedule(
        req.params.schoolCode,
        req.body
      );
      if (!result.ok) {
        return res
          .status(400)
          .json({ message: "Invalid schedule data", errors: result.errors });
      }
      res.json(result.schedule);
    } catch (error) {
      console.error("Error adding schedule:", error);
      res.status(500).json({ message: "Failed to add schedule" });
    }
  });

  app.delete(
    "/api/:schoolCode/schedules/:scheduleId",
    validateSchoolCode,
    async (req, res) => {
      try {
        const ok = await schoolRepo.deleteSchoolSchedule(
          req.params.schoolCode,
          req.params.scheduleId
        );
        if (!ok) {
          return res.status(404).json({ message: "Schedule not found" });
        }
        res.json({ message: "Schedule deleted successfully" });
      } catch (error) {
        console.error("Error deleting schedule:", error);
        res.status(500).json({ message: "Failed to delete schedule" });
      }
    }
  );
}
