import type { Express } from "express";
import { format, addDays } from "date-fns";
import { storage } from "../storage";
import { insertScheduleSchema } from "@shared/schema";
import { requireAdminPassword } from "../shared/auth/adminPassword";
import { notifyScheduleUnlocked } from "../line-notify";

type ScheduleUpdate = Parameters<typeof storage.updateSchedule>[1];

export function registerScheduleRoutes(app: Express): void {
  app.get("/api/schedules/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const schedules = await storage.getSchedulesByDate(date);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch schedules" });
    }
  });

  app.get("/api/schedules", async (req, res) => {
    try {
      const { startDate, endDate } = req.query as {
        startDate: string;
        endDate: string;
      };
      const schedules = await storage.getSchedulesByDateRange(startDate, endDate);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch schedules" });
    }
  });

  app.post("/api/schedules", async (req, res) => {
    try {
      const validatedData = insertScheduleSchema.parse(req.body);
      const schedule = await storage.upsertSchedule(validatedData);
      res.json(schedule);
    } catch (error) {
      res
        .status(400)
        .json({ message: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put("/api/schedules/:id", async (req, res) => {
    try {
      const { className, coachName } = req.body;
      const schedule = await storage.updateSchedule(req.params.id, {
        className,
        coachName,
      });
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Failed to update schedule" });
    }
  });

  app.delete(
    "/api/schedules/:id",
    requireAdminPassword,
    async (req, res) => {
      try {
        const existing = await storage.getScheduleById(req.params.id);
        if (existing?.isClassLocked) {
          return res
            .status(409)
            .json({ message: "課表已鎖定，請先解鎖該週才能刪除" });
        }
        await storage.deleteSchedule(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Failed to delete schedule" });
      }
    }
  );

  app.post(
    "/api/schedules/copy-week",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { sourceStartDate, sourceEndDate, targetStartDate, venueId } =
          req.body;
        if (!sourceStartDate || !sourceEndDate || !targetStartDate || !venueId) {
          return res.status(400).json({ message: "Missing required fields" });
        }
        const sourceSchedules = await storage.getSchedulesByDateRange(
          sourceStartDate,
          sourceEndDate
        );
        const venueSchedules = sourceSchedules.filter(
          (s) => s.venueId === venueId && s.className
        );

        const sourceStart = new Date(sourceStartDate + "T00:00:00");
        const targetStart = new Date(targetStartDate + "T00:00:00");

        const targetEndDate = format(addDays(targetStart, 6), "yyyy-MM-dd");
        const targetExisting = await storage.getSchedulesByDateRange(
          targetStartDate,
          targetEndDate
        );
        const lockedTargets = targetExisting.filter(
          (s) => s.venueId === venueId && s.isClassLocked
        );
        if (lockedTargets.length > 0) {
          return res.status(409).json({
            message: `目標週已有 ${lockedTargets.length} 筆鎖定的課表，請先解鎖才能覆蓋`,
          });
        }

        let copied = 0;
        for (const schedule of venueSchedules) {
          const scheduleDate = new Date(schedule.date + "T00:00:00");
          const dayOffset = Math.round(
            (scheduleDate.getTime() - sourceStart.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          const targetDate = addDays(targetStart, dayOffset);
          const targetDateStr = format(targetDate, "yyyy-MM-dd");

          await storage.upsertSchedule({
            date: targetDateStr,
            venueId: schedule.venueId,
            timeSlotId: schedule.timeSlotId,
            className: schedule.className,
            coachName: null,
            coachName2: null,
            coachCount: schedule.coachCount,
          });
          copied++;
        }

        res.json({ success: true, copied });
      } catch (error) {
        console.error("Error copying week:", error);
        res.status(500).json({ message: "Failed to copy week" });
      }
    }
  );

  app.post(
    "/api/schedules/lock",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { venueId, startDate, endDate } = req.body;
        if (!venueId || !startDate || !endDate) {
          return res
            .status(400)
            .json({ message: "Missing venueId, startDate, or endDate" });
        }
        await storage.lockSchedules(venueId, startDate, endDate);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Failed to lock schedules" });
      }
    }
  );

  app.post(
    "/api/schedules/unlock",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { venueId, startDate, endDate } = req.body;
        if (!venueId || !startDate || !endDate) {
          return res
            .status(400)
            .json({ message: "Missing venueId, startDate, or endDate" });
        }
        await storage.unlockSchedules(venueId, startDate, endDate);
        notifyScheduleUnlocked(venueId, startDate, endDate).catch(() => {});
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Failed to unlock schedules" });
      }
    }
  );

  app.get("/api/schedules/lock-status", async (req, res) => {
    try {
      const { venueId, startDate, endDate } = req.query as {
        venueId: string;
        startDate: string;
        endDate: string;
      };
      if (!venueId || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing parameters" });
      }
      const locked = await storage.getScheduleLockStatus(
        venueId,
        startDate,
        endDate
      );
      res.json({ isLocked: locked });
    } catch (error) {
      res.status(500).json({ message: "Failed to check lock status" });
    }
  });

  app.put(
    "/api/schedules/:id/assign-coach",
    requireAdminPassword,
    async (req, res) => {
      try {
        const { coachName, coachName2, coach1IsTeaching, coach2IsTeaching } =
          req.body;

        if (coachName2 !== undefined) {
          const updateData: ScheduleUpdate = { coachName2: coachName2 || null };
          if (!coachName2) updateData.coach2IsTeaching = false;
          const schedule = await storage.updateSchedule(
            req.params.id,
            updateData
          );
          return res.json(schedule);
        }
        if (coach1IsTeaching !== undefined) {
          const schedule = await storage.updateSchedule(req.params.id, {
            coach1IsTeaching: !!coach1IsTeaching,
          });
          return res.json(schedule);
        }
        if (coach2IsTeaching !== undefined) {
          const schedule = await storage.updateSchedule(req.params.id, {
            coach2IsTeaching: !!coach2IsTeaching,
          });
          return res.json(schedule);
        }
        const schedule = await storage.assignCoach(
          req.params.id,
          coachName || null
        );
        res.json(schedule);
      } catch (error) {
        res.status(500).json({ message: "Failed to assign coach" });
      }
    }
  );

  app.patch(
    "/api/schedules/:id",
    requireAdminPassword,
    async (req, res) => {
      try {
        const {
          coachCount,
          coachName,
          coachName2,
          coach1IsTeaching,
          coach2IsTeaching,
        } = req.body;
        const updateData: ScheduleUpdate = {};
        if (coachCount !== undefined) {
          const count = parseInt(coachCount);
          if (count !== 1 && count !== 2)
            return res
              .status(400)
              .json({ message: "Coach count must be 1 or 2" });
          updateData.coachCount = count;
        }
        if (coachName !== undefined) updateData.coachName = coachName;
        if (coachName2 !== undefined) updateData.coachName2 = coachName2;
        if (coach1IsTeaching !== undefined)
          updateData.coach1IsTeaching = !!coach1IsTeaching;
        if (coach2IsTeaching !== undefined)
          updateData.coach2IsTeaching = !!coach2IsTeaching;
        const schedule = await storage.updateSchedule(
          req.params.id,
          updateData
        );
        res.json(schedule);
      } catch (error) {
        res.status(500).json({ message: "Failed to update schedule" });
      }
    }
  );

  // Conflicts
  app.get("/api/conflicts/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const conflicts = await storage.getConflicts(date);
      res.json(conflicts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conflicts" });
    }
  });

  // Statistics
  app.get("/api/statistics", async (req, res) => {
    try {
      const { startDate, endDate, coachName } = req.query as {
        startDate: string;
        endDate: string;
        coachName?: string;
      };
      const statistics = await storage.getCoachStatistics(
        startDate,
        endDate,
        coachName
      );
      res.json(statistics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });
}
