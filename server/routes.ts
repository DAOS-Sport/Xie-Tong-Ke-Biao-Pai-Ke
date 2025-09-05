import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertScheduleSchema, insertCoachRegistrationSchema, insertTeacherFeedbackSchema } from "@shared/schema";
import { format, addDays, startOfWeek } from "date-fns";
import { getSchoolDb, initializeSchoolSchema, isValidSchoolCode } from "./multi-school-db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { schedules, teachers, teacherFeedbacks } from "@shared/schema";

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

  // 尋找教練 - 獲取沒有教練的課程（支援日期範圍）
  app.get('/api/schedules-without-coach', async (req, res) => {
    try {
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      
      let schedules;
      if (startDate && endDate) {
        // 如果提供日期範圍，使用優化版本查詢
        schedules = await storage.getSchedulesWithoutCoachByDateRange(startDate, endDate);
      } else {
        // 否則查詢所有
        schedules = await storage.getSchedulesWithoutCoach();
      }
      
      res.json(schedules);
    } catch (error) {
      console.error('Error fetching schedules without coach:', error);
      res.status(500).json({ message: "Failed to fetch schedules without coach" });
    }
  });

  // 教練登記功能
  app.post('/api/coach-registrations', async (req, res) => {
    try {
      const validation = insertCoachRegistrationSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid registration data", errors: validation.error.issues });
      }

      const registration = await storage.registerCoachForSchedule(validation.data);
      res.json(registration);
    } catch (error) {
      console.error('Error registering coach:', error);
      res.status(500).json({ message: "Failed to register coach" });
    }
  });

  // 獲取特定課程的教練登記列表
  app.get('/api/coach-registrations/:scheduleId', async (req, res) => {
    try {
      const { scheduleId } = req.params;
      const registrations = await storage.getCoachRegistrations(scheduleId);
      res.json(registrations);
    } catch (error) {
      console.error('Error fetching coach registrations:', error);
      res.status(500).json({ message: "Failed to fetch coach registrations" });
    }
  });

  // === 多學校系統 API ===
  
  // 中介軟體：驗證學校代碼
  const validateSchoolCode = (req: any, res: any, next: any) => {
    const { schoolCode } = req.params;
    if (!isValidSchoolCode(schoolCode)) {
      return res.status(400).json({ message: "Invalid school code" });
    }
    next();
  };

  // 初始化學校 schema（管理功能）
  app.post('/api/admin/init-school/:schoolCode', async (req, res) => {
    try {
      const { schoolCode } = req.params;
      if (!isValidSchoolCode(schoolCode)) {
        return res.status(400).json({ message: "Invalid school code" });
      }
      
      await initializeSchoolSchema(schoolCode);
      res.json({ message: `School ${schoolCode} initialized successfully` });
    } catch (error) {
      console.error('Error initializing school:', error);
      res.status(500).json({ message: "Failed to initialize school" });
    }
  });

  // 匯入課表資料的端點
  app.post('/api/admin/import-schedule/:schoolCode', async (req, res) => {
    try {
      const { schoolCode } = req.params;
      if (!isValidSchoolCode(schoolCode)) {
        return res.status(400).json({ message: "Invalid school code" });
      }
      
      // 動態匯入並執行
      const { importScheduleData } = await import('./import-schedule');
      const count = await importScheduleData();
      
      res.json({ message: `Successfully imported ${count} schedule records`, count });
    } catch (error) {
      console.error('Error importing schedule:', error);
      res.status(500).json({ message: "Failed to import schedule data" });
    }
  });

  // 獲取學校的教師列表
  app.get('/api/:schoolCode/teachers', validateSchoolCode, async (req, res) => {
    try {
      const { schoolCode } = req.params;
      const db = await getSchoolDb(schoolCode);
      
      const teacherList = await db.select().from(teachers);
      res.json(teacherList);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      res.status(500).json({ message: "Failed to fetch teachers" });
    }
  });

  // 獲取學校的時間段
  app.get('/api/:schoolCode/time-slots', validateSchoolCode, async (req, res) => {
    try {
      const timeSlots = await storage.getTimeSlots(); // 使用共用的時間段
      res.json(timeSlots);
    } catch (error) {
      console.error('Error fetching time slots:', error);
      res.status(500).json({ message: "Failed to fetch time slots" });
    }
  });

  // 獲取學校的場館
  app.get('/api/:schoolCode/venues', validateSchoolCode, async (req, res) => {
    try {
      const venues = await storage.getVenues(); // 使用共用的場館
      res.json(venues);
    } catch (error) {
      console.error('Error fetching venues:', error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  // 獲取學校的課表（支援篩選）
  app.get('/api/:schoolCode/schedules', validateSchoolCode, async (req, res) => {
    try {
      const { schoolCode } = req.params;
      const { teacher, weekStart, weekEnd, startDate, endDate } = req.query as any;
      const db = await getSchoolDb(schoolCode);
      
      let whereConditions: any[] = [];
      
      // 教師篩選
      if (teacher) {
        whereConditions.push(eq(schedules.coachName, teacher));
      }
      
      // 日期範圍篩選 - 修正邏輯
      if (startDate && endDate) {
        whereConditions.push(
          and(
            gte(schedules.date, startDate),
            lte(schedules.date, endDate)
          )
        );
      }
      
      const scheduleList = whereConditions.length > 0 
        ? await db.select().from(schedules).where(and(...whereConditions))
        : await db.select().from(schedules);
      
      res.json(scheduleList);
    } catch (error) {
      console.error('Error fetching school schedules:', error);
      res.status(500).json({ message: "Failed to fetch schedules" });
    }
  });

  // 獲取教師回覆
  app.get('/api/:schoolCode/feedbacks', validateSchoolCode, async (req, res) => {
    try {
      const { schoolCode } = req.params;
      const { teacher, scheduleId } = req.query as any;
      const db = await getSchoolDb(schoolCode);
      
      let query = `SELECT * FROM school_${schoolCode}.teacher_feedbacks`;
      const conditions = [];
      
      if (teacher) {
        conditions.push(`teacher_name = '${teacher}'`);
      }
      
      if (scheduleId) {
        conditions.push(`schedule_id = '${scheduleId}'`);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ' ORDER BY updated_at DESC';
      
      const result = await db.execute(sql.raw(query));
      res.json(result.rows || []);
    } catch (error) {
      console.error('Error fetching teacher feedbacks:', error);
      res.status(500).json({ message: "Failed to fetch feedbacks" });
    }
  });

  // 提交或更新教師回覆
  app.post('/api/:schoolCode/feedbacks', validateSchoolCode, async (req, res) => {
    try {
      const { schoolCode } = req.params;
      
      // 部署環境額外日誌
      if (process.env.REPLIT_DEPLOYMENT) {
        console.log('🚀 Deployment: Saving feedback for school:', schoolCode);
        console.log('🚀 Deployment: Request body:', req.body);
      }
      
      const db = await getSchoolDb(schoolCode);
      
      const validation = insertTeacherFeedbackSchema.safeParse(req.body);
      if (!validation.success) {
        console.error('❌ Validation failed:', validation.error.issues);
        return res.status(400).json({ 
          message: "Invalid feedback data", 
          errors: validation.error.issues 
        });
      }
      
      const feedbackData = validation.data;
      
      // 驗證調課資料
      if (feedbackData.status === 'reschedule') {
        if (!feedbackData.rescheduleDate || !feedbackData.reschedulePeriod) {
          return res.status(400).json({ 
            message: "Reschedule date and period are required when status is reschedule" 
          });
        }
      }
      
      // 使用原生SQL插入，處理更新或插入
      const insertQuery = `
        INSERT INTO school_${schoolCode}.teacher_feedbacks 
        (schedule_id, teacher_name, status, reschedule_date, reschedule_period, comment, updated_at) 
        VALUES ('${feedbackData.scheduleId}', '${feedbackData.teacherName}', '${feedbackData.status}', 
                ${feedbackData.rescheduleDate ? `'${feedbackData.rescheduleDate}'` : 'NULL'}, 
                ${feedbackData.reschedulePeriod ? `'${feedbackData.reschedulePeriod}'` : 'NULL'}, 
                ${feedbackData.comment ? `'${feedbackData.comment.replace(/'/g, "''")}'` : 'NULL'}, 
                NOW())
        ON CONFLICT (schedule_id, teacher_name) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          reschedule_date = EXCLUDED.reschedule_date,
          reschedule_period = EXCLUDED.reschedule_period,
          comment = EXCLUDED.comment,
          updated_at = NOW()
        RETURNING *
      `;
      
      const result = await db.execute(sql.raw(insertQuery));
      
      if (process.env.REPLIT_DEPLOYMENT) {
        console.log('✅ Deployment: Feedback saved successfully');
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error saving teacher feedback:', error);
      if (process.env.REPLIT_DEPLOYMENT) {
        console.error('🚨 Deployment: Detailed error:', error);
      }
      res.status(500).json({ message: "Failed to save feedback" });
    }
  });

  // 新增課表
  app.post('/api/:schoolCode/schedules', validateSchoolCode, async (req, res) => {
    try {
      const { schoolCode } = req.params;
      const db = await getSchoolDb(schoolCode);
      
      const validation = insertScheduleSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid schedule data", 
          errors: validation.error.issues 
        });
      }
      
      const scheduleData = validation.data;
      const newSchedule = await db.insert(schedules)
        .values({
          ...scheduleData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      res.json(newSchedule[0]);
    } catch (error) {
      console.error('Error adding schedule:', error);
      res.status(500).json({ message: "Failed to add schedule" });
    }
  });

  // 刪除課表
  app.delete('/api/:schoolCode/schedules/:scheduleId', validateSchoolCode, async (req, res) => {
    try {
      const { schoolCode, scheduleId } = req.params;
      const db = await getSchoolDb(schoolCode);
      
      const deletedSchedule = await db.delete(schedules)
        .where(eq(schedules.id, scheduleId))
        .returning();
      
      if (deletedSchedule.length === 0) {
        return res.status(404).json({ message: "Schedule not found" });
      }
      
      res.json({ message: "Schedule deleted successfully" });
    } catch (error) {
      console.error('Error deleting schedule:', error);
      res.status(500).json({ message: "Failed to delete schedule" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
