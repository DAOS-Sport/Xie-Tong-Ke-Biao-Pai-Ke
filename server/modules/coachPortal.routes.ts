import type { Express } from "express";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { coachAvailability, coachVenuePreferences } from "@shared/schema";
import { lineLoginTokens } from "./auth.routes";
import { env } from "../config/env";

const CHEN_BO_RONG_LINE_ID = "U8fd0e4be4e44a1304f9fa2e9855f4559";

export function registerCoachPortalRoutes(app: Express): void {
  // Linkable coaches (already approved but no LINE binding yet)
  app.get("/api/coach-portal/linkable-coaches", async (_req, res) => {
    try {
      const approved = await storage.getApprovedCoachUsers();
      const linkable = approved
        .filter((c) => !c.lineId)
        .map((c) => ({ id: c.id, name: c.name }));
      res.json(linkable);
    } catch (error) {
      res.status(500).json({ message: "查詢失敗" });
    }
  });

  app.post("/api/coach-portal/link-existing", async (req, res) => {
    try {
      const { lineToken, coachUserId } = req.body;
      if (!lineToken || !coachUserId) {
        return res.status(400).json({ message: "缺少必要參數" });
      }
      const tokenData = lineLoginTokens.get(lineToken);
      if (!tokenData || Date.now() > tokenData.expiresAt) {
        lineLoginTokens.delete(lineToken);
        return res
          .status(400)
          .json({ message: "LINE 登入已過期，請重新登入" });
      }
      const existing = await storage.getCoachUserByLineId(tokenData.lineId);
      if (existing) {
        lineLoginTokens.delete(lineToken);
        return res.json(existing);
      }
      const updated = await storage.updateCoachUserLineId(
        coachUserId,
        tokenData.lineId
      );
      if (!updated) {
        return res.status(404).json({ message: "找不到教練帳號" });
      }
      lineLoginTokens.delete(lineToken);
      res.json(updated);
    } catch (error) {
      console.error("Error linking LINE to coach:", error);
      res.status(500).json({ message: "連結失敗" });
    }
  });

  app.post("/api/coach-portal/link-by-name", async (req, res) => {
    try {
      const { lineToken, name } = req.body;
      if (!lineToken || !name?.trim()) {
        return res.status(400).json({ message: "缺少必要參數" });
      }
      const tokenData = lineLoginTokens.get(lineToken);
      if (!tokenData || Date.now() > tokenData.expiresAt) {
        lineLoginTokens.delete(lineToken);
        return res
          .status(400)
          .json({ message: "LINE 登入已過期，請重新登入" });
      }
      const trimmedName = name.trim();

      const existingByLine = await storage.getCoachUserByLineId(
        tokenData.lineId
      );
      if (existingByLine) {
        lineLoginTokens.delete(lineToken);
        return res.json(existingByLine);
      }

      const allCoaches = await storage.getAllCoachUsers();
      const matched = allCoaches.find(
        (c) => c.name === trimmedName && c.status === "approved"
      );

      if (matched) {
        const updated = await storage.updateCoachUserLineId(
          matched.id,
          tokenData.lineId
        );
        lineLoginTokens.delete(lineToken);
        return res.json(updated);
      }

      // Not found in DB → notify 陳柏榮 via LINE push
      const channelAccessToken = env.lineChannelAccessToken;
      if (channelAccessToken) {
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${channelAccessToken}`,
          },
          body: JSON.stringify({
            to: CHEN_BO_RONG_LINE_ID,
            messages: [
              {
                type: "text",
                text: `【教練登入通知】\n教練「${trimmedName}」嘗試登入教練前台，但在 Ragic 資料庫中查無此名字。\n請確認該教練是否已建檔，或協助手動設定。`,
              },
            ],
          }),
        }).catch((err) =>
          console.error("[LINE] Failed to notify 陳柏榮:", err)
        );
      }

      return res.status(404).json({
        message: `查無「${trimmedName}」的教練資料，已通知管理員，請稍候或聯繫陳柏榮。`,
      });
    } catch (error) {
      console.error("Error linking by name:", error);
      res.status(500).json({ message: "連結失敗" });
    }
  });

  app.post("/api/coach-portal/register", async (req, res) => {
    try {
      const { lineToken, name, phone, email } = req.body;

      if (!lineToken || typeof lineToken !== "string") {
        return res.status(400).json({ message: "請先使用 LINE 登入" });
      }

      const tokenData = lineLoginTokens.get(lineToken);
      if (!tokenData || Date.now() > tokenData.expiresAt) {
        lineLoginTokens.delete(lineToken);
        return res
          .status(400)
          .json({ message: "LINE 登入已過期，請重新登入" });
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "姓名為必填欄位" });
      }

      const existingUser = await storage.getCoachUserByLineId(tokenData.lineId);
      if (existingUser) {
        lineLoginTokens.delete(lineToken);
        return res.json(existingUser);
      }

      const coachUser = await storage.createCoachUser({
        lineId: tokenData.lineId,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        status: "pending",
        role: "coach",
        linkedCoachName: null,
      });

      lineLoginTokens.delete(lineToken);
      res.json(coachUser);
    } catch (error) {
      console.error("Error registering coach user:", error);
      res.status(500).json({ message: "註冊失敗" });
    }
  });

  app.get("/api/coach-portal/me/:identifier", async (req, res) => {
    try {
      const { identifier } = req.params;
      let user = await storage.getCoachUserByLineId(identifier);
      if (!user) {
        user = await storage.getCoachUserById(identifier);
      }
      if (!user) {
        return res.status(404).json({ message: "找不到用戶" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching coach user:", error);
      res.status(500).json({ message: "查詢失敗" });
    }
  });

  app.get("/api/coach-portal/my-schedule", async (req, res) => {
    try {
      const { coachName, startDate, endDate } = req.query as {
        coachName: string;
        startDate: string;
        endDate: string;
      };
      if (!coachName || !startDate || !endDate) {
        return res.status(400).json({ message: "缺少必要參數" });
      }
      const mySchedules = await storage.getCoachSchedules(
        coachName,
        startDate,
        endDate
      );
      res.json(mySchedules);
    } catch (error) {
      console.error("Error fetching personal schedule:", error);
      res.status(500).json({ message: "查詢個人課表失敗" });
    }
  });

  app.get("/api/coach-portal/colleagues", async (req, res) => {
    try {
      const { coachName, date, venueId, timeSlotId } = req.query as {
        coachName: string;
        date: string;
        venueId: string;
        timeSlotId: string;
      };
      if (!coachName || !date || !venueId || !timeSlotId) {
        return res.status(400).json({ message: "缺少必要參數" });
      }
      const colleagues = await storage.getColleaguesForCoach(
        coachName,
        date,
        venueId,
        timeSlotId
      );
      res.json(colleagues);
    } catch (error) {
      console.error("Error fetching colleagues:", error);
      res.status(500).json({ message: "查詢同場教練失敗" });
    }
  });

  app.get("/api/coach-portal/approved-coaches", async (_req, res) => {
    try {
      const users = await storage.getApprovedCoachUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching approved coaches:", error);
      res.status(500).json({ message: "查詢已通過教練失敗" });
    }
  });

  // Availability
  app.get("/api/coach-portal/availability", async (req, res) => {
    try {
      const { coachName, weekStart } = req.query as {
        coachName: string;
        weekStart: string;
      };
      if (!coachName || !weekStart) {
        return res.status(400).json({ message: "Missing coachName or weekStart" });
      }
      const availability = await storage.getCoachAvailabilityForCoach(
        coachName,
        weekStart
      );
      res.json(availability);
    } catch (error) {
      console.error("Error fetching coach availability:", error);
      res.status(500).json({ message: "Failed to fetch coach availability" });
    }
  });

  app.post("/api/coach-portal/availability", async (req, res) => {
    try {
      const { coachName, weekStart, slots } = req.body as {
        coachName: string;
        weekStart: string;
        slots: { dayOfWeek: number; timeSlotOrder: number; available?: boolean }[];
      };
      if (!coachName || !weekStart || !Array.isArray(slots)) {
        return res
          .status(400)
          .json({ message: "Missing coachName, weekStart, or slots" });
      }
      const availableSlots = slots.filter((s) => s.available !== false);
      for (const slot of availableSlots) {
        if (
          slot.dayOfWeek < 1 ||
          slot.dayOfWeek > 7 ||
          slot.timeSlotOrder < 1 ||
          slot.timeSlotOrder > 7
        ) {
          return res
            .status(400)
            .json({ message: "dayOfWeek must be 1-7, timeSlotOrder must be 1-7" });
        }
      }
      await storage.upsertCoachAvailability(
        coachName,
        weekStart,
        availableSlots
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving coach availability:", error);
      res.status(500).json({ message: "Failed to save coach availability" });
    }
  });

  app.get("/api/coach-portal/venue-preferences", async (req, res) => {
    try {
      const { coachName } = req.query as { coachName: string };
      if (!coachName) {
        return res.status(400).json({ message: "Missing coachName" });
      }
      const prefs = await storage.getCoachVenuePreferences(coachName);
      res.json(prefs.map((p) => p.venueName));
    } catch (error) {
      console.error("Error fetching coach venue preferences:", error);
      res.status(500).json({ message: "Failed to fetch venue preferences" });
    }
  });

  app.post("/api/coach-portal/venue-preferences", async (req, res) => {
    try {
      const { coachName, venueNames } = req.body as {
        coachName: string;
        venueNames: string[];
      };
      if (!coachName || !Array.isArray(venueNames)) {
        return res
          .status(400)
          .json({ message: "Missing coachName or venueNames" });
      }
      await storage.setCoachVenuePreferences(coachName, venueNames);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving coach venue preferences:", error);
      res.status(500).json({ message: "Failed to save venue preferences" });
    }
  });

  app.get("/api/coach-portal/fill-status", async (req, res) => {
    try {
      const { coachName } = req.query as { coachName: string };
      if (!coachName)
        return res.status(400).json({ message: "Missing coachName" });
      const avail = await db
        .select({ id: coachAvailability.id })
        .from(coachAvailability)
        .where(eq(coachAvailability.coachName, coachName))
        .limit(1);
      const prefs = await db
        .select({ id: coachVenuePreferences.id })
        .from(coachVenuePreferences)
        .where(eq(coachVenuePreferences.coachName, coachName))
        .limit(1);
      res.json({
        hasAvailability: avail.length > 0,
        hasVenuePrefs: prefs.length > 0,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch fill status" });
    }
  });

  app.get("/api/coach-portal/assigned-slots", async (req, res) => {
    try {
      const { coachName, startDate, endDate } = req.query as {
        coachName: string;
        startDate: string;
        endDate: string;
      };
      if (!coachName || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing parameters" });
      }
      const scheduleList = await storage.getCoachSchedules(
        coachName,
        startDate,
        endDate
      );
      const assignedSlots = scheduleList.map((s) => {
        const dateObj = new Date(s.date + "T00:00:00");
        let dayOfWeek = dateObj.getDay();
        dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
        return { dayOfWeek, timeSlotOrder: s.timeSlot.order };
      });
      res.json(assignedSlots);
    } catch (error) {
      console.error("Error fetching assigned slots:", error);
      res.status(500).json({ message: "Failed to fetch assigned slots" });
    }
  });
}
