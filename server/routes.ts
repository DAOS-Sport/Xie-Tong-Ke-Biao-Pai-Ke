import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertScheduleSchema, insertCoachRegistrationSchema, insertTeacherFeedbackSchema } from "@shared/schema";
import { format, addDays, startOfWeek } from "date-fns";
import { getSchoolDb, initializeSchoolSchema, isValidSchoolCode } from "./multi-school-db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { schedules, teachers, teacherFeedbacks } from "@shared/schema";
import { setupWeeklyNotificationCron, setupDailyNotificationCron, sendWeeklyScheduleNotifications } from "./line-notify";
import { setupRagicSyncCron, syncRagicAll, getRagicSyncStatus } from "./ragic";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Initialize default data
  await storage.initializeVenues();
  await storage.initializeTimeSlots();
  
  // 強制初始化多學校系統 - 確保部署環境與開發環境一致
  const isDeployment = process.env.REPLIT_DEPLOYMENT === '1';
  const environment = isDeployment ? '🚀 PRODUCTION' : '🛠️ DEVELOPMENT';
  
  try {
    console.log(`${environment}: Initializing multi-school system...`);
    
    // 檢查資料庫連接
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured - cannot initialize multi-school system');
    }
    
    console.log(`${environment}: Creating schemas...`);
    await initializeSchoolSchema('demo');
    console.log(`${environment}: ✅ school_demo initialized`);
    
    await initializeSchoolSchema('school1');
    console.log(`${environment}: ✅ school_school1 initialized`);
    
    await initializeSchoolSchema('school2');
    console.log(`${environment}: ✅ school_school2 initialized`);
    
    console.log(`${environment}: ✅ Multi-school system initialized successfully`);
  } catch (error) {
    console.error(`${environment}: ❌ Multi-school initialization FAILED:`, error);
    
    if (isDeployment) {
      console.error('🚨 CRITICAL: Production deployment failed to initialize database!');
      console.error('🔧 Please check:');
      console.error('   1. DATABASE_URL environment variable is set');
      console.error('   2. Database is accessible');
      console.error('   3. Database has necessary permissions');
      throw error; // 在生產環境中，初始化失敗應該中斷啟動
    } else {
      console.error('⚠️ Development initialization error (continuing anyway):', error);
    }
  }

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

  // Create venue
  app.post('/api/admin/venues', async (req, res) => {
    try {
      const password = req.headers['x-admin-password'] || req.body?.password;
      if (password !== 'dream0935314711') {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { name, color } = req.body;
      if (!name || !color) {
        return res.status(400).json({ message: "Name and color are required" });
      }
      const existingVenues = await storage.getVenues();
      if (existingVenues.some(v => v.name === name)) {
        return res.status(400).json({ message: "場館名稱已存在" });
      }
      const venue = await storage.createVenue(name, color);
      res.json(venue);
    } catch (error) {
      console.error("Error creating venue:", error);
      res.status(500).json({ message: "Failed to create venue" });
    }
  });

  // Delete venue
  app.delete('/api/admin/venues/:id', async (req, res) => {
    try {
      const password = req.headers['x-admin-password'] as string;
      if (password !== 'dream0935314711') {
        return res.status(401).json({ message: "Unauthorized" });
      }
      await storage.deleteVenue(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting venue:", error);
      res.status(500).json({ message: "Failed to delete venue" });
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

  app.post('/api/schedules/copy-week', async (req: any, res) => {
    try {
      const password = req.headers['x-admin-password'] as string;
      if (password !== 'dream0935314711') {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { sourceStartDate, sourceEndDate, targetStartDate, venueId } = req.body;
      if (!sourceStartDate || !sourceEndDate || !targetStartDate || !venueId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const sourceSchedules = await storage.getSchedulesByDateRange(sourceStartDate, sourceEndDate);
      const venueSchedules = sourceSchedules.filter(s => s.venueId === venueId && s.className);

      let copied = 0;
      const sourceStart = new Date(sourceStartDate + 'T00:00:00');
      const targetStart = new Date(targetStartDate + 'T00:00:00');

      for (const schedule of venueSchedules) {
        const scheduleDate = new Date(schedule.date + 'T00:00:00');
        const dayOffset = Math.round((scheduleDate.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24));
        const targetDate = addDays(targetStart, dayOffset);
        const targetDateStr = format(targetDate, 'yyyy-MM-dd');

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
  });

  // Schedule lock/unlock (two-phase scheduling)
  app.post('/api/schedules/lock', async (req: any, res) => {
    try {
      const password = req.headers['x-admin-password'] || req.query.password;
      if (password !== 'dream0935314711') {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { venueId, startDate, endDate } = req.body;
      if (!venueId || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing venueId, startDate, or endDate" });
      }
      await storage.lockSchedules(venueId, startDate, endDate);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to lock schedules" });
    }
  });

  app.post('/api/schedules/unlock', async (req: any, res) => {
    try {
      const password = req.headers['x-admin-password'] || req.query.password;
      if (password !== 'dream0935314711') {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { venueId, startDate, endDate } = req.body;
      if (!venueId || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing venueId, startDate, or endDate" });
      }
      await storage.unlockSchedules(venueId, startDate, endDate);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to unlock schedules" });
    }
  });

  app.get('/api/schedules/lock-status', async (req: any, res) => {
    try {
      const { venueId, startDate, endDate } = req.query as {
        venueId: string;
        startDate: string;
        endDate: string;
      };
      if (!venueId || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing parameters" });
      }
      const locked = await storage.getScheduleLockStatus(venueId, startDate, endDate);
      res.json({ isLocked: locked });
    } catch (error) {
      res.status(500).json({ message: "Failed to check lock status" });
    }
  });

  app.put('/api/schedules/:id/assign-coach', async (req: any, res) => {
    try {
      const password = req.headers['x-admin-password'] || req.query.password;
      if (password !== 'dream0935314711') {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { coachName, coachName2 } = req.body;
      if (coachName2 !== undefined) {
        const schedule = await storage.updateSchedule(req.params.id, { coachName2: coachName2 || null });
        return res.json(schedule);
      }
      const schedule = await storage.assignCoach(req.params.id, coachName || null);
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Failed to assign coach" });
    }
  });

  app.patch('/api/schedules/:id', async (req: any, res) => {
    try {
      const password = req.headers['x-admin-password'] || req.query.password;
      if (password !== 'dream0935314711') {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { coachCount, coachName, coachName2 } = req.body;
      const updateData: any = {};
      if (coachCount !== undefined) {
        const count = parseInt(coachCount);
        if (count !== 1 && count !== 2) return res.status(400).json({ message: "Coach count must be 1 or 2" });
        updateData.coachCount = count;
      }
      if (coachName !== undefined) updateData.coachName = coachName;
      if (coachName2 !== undefined) updateData.coachName2 = coachName2;
      const schedule = await storage.updateSchedule(req.params.id, updateData);
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ message: "Failed to update schedule" });
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

  // Coach autocomplete (from schedules)
  app.get('/api/coaches', async (req, res) => {
    try {
      const coaches = await storage.getUniqueCoaches();
      res.json(coaches);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch coaches" });
    }
  });

  app.get('/api/approved-coaches', async (req, res) => {
    try {
      const approvedUsers = await storage.getApprovedCoachUsers();
      const names = approvedUsers.map(u => u.linkedCoachName || u.name).filter(Boolean);
      res.json(names);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch approved coaches" });
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
      
      // 使用原生 SQL 查詢確保正確的 schema
      const teacherList = await db.execute(sql.raw(`
        SELECT teacher_name, subject, created_at
        FROM school_${schoolCode}.teachers 
        ORDER BY teacher_name
      `));
      
      // 轉換為前端需要的格式
      const formattedTeachers = teacherList.rows.map((row: any) => ({
        teacherName: row.teacher_name,
        subject: row.subject,
        createdAt: row.created_at
      }));
      
      console.log(`✅ Fetched ${formattedTeachers.length} teachers for school ${schoolCode}`);
      res.json(formattedTeachers);
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
    // 部署環境檢測 - 只有 REPLIT_DEPLOYMENT=1 才是真正的部署
    const isDeployment = process.env.REPLIT_DEPLOYMENT === '1';
    
    try {
      const { schoolCode } = req.params;
      
      // 檢查資料庫連接
      if (!process.env.DATABASE_URL) {
        console.error('❌ 資料庫未配置');
        return res.status(503).json({
          message: "Database not configured",
          error: "Please set up DATABASE_URL environment variable",
          isDeployment,
          setupRequired: true
        });
      }
      
      if (isDeployment) {
        console.log('🚀 PRODUCTION: Saving feedback for school:', schoolCode);
        console.log('🚀 PRODUCTION: Request body:', JSON.stringify(req.body, null, 2));
        console.log('🚀 PRODUCTION: DATABASE_URL exists:', !!process.env.DATABASE_URL);
        console.log('🚀 PRODUCTION: Current timestamp:', new Date().toISOString());
      }
      
      let db;
      try {
        db = await getSchoolDb(schoolCode);
      } catch (dbError) {
        console.error('❌ 資料庫連接失敗:', dbError);
        return res.status(503).json({
          message: "Database connection failed",
          error: isDeployment 
            ? "請為部署環境配置 DATABASE_URL。部署環境使用獨立資料庫，與開發環境不同。" 
            : "Database connection error",
          isDeployment,
          setupRequired: true,
          when: new Date().toISOString()
        });
      }
      
      // 額外驗證 schedule ID 格式（支援 varchar UUID）
      if (!req.body.scheduleId || req.body.scheduleId.length < 10) {
        return res.status(400).json({ 
          message: "Invalid schedule ID - ID is required" 
        });
      }
      
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
      
      // ✅ 修復：使用正確的 Drizzle SQL 語法
      const result = await db.execute(sql`
        INSERT INTO ${sql.raw(`school_${schoolCode}.teacher_feedbacks`)}
        (schedule_id, teacher_name, status, reschedule_date, reschedule_period, comment, updated_at) 
        VALUES (
          ${feedbackData.scheduleId},
          ${feedbackData.teacherName},
          ${feedbackData.status},
          ${feedbackData.rescheduleDate || null},
          ${feedbackData.reschedulePeriod || null},
          ${feedbackData.comment || null},
          NOW()
        )
        ON CONFLICT (schedule_id, teacher_name) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          reschedule_date = EXCLUDED.reschedule_date,
          reschedule_period = EXCLUDED.reschedule_period,
          comment = EXCLUDED.comment,
          updated_at = NOW()
        RETURNING *
      `);
      
      if (isDeployment) {
        console.log('🔍 PRODUCTION: About to execute SQL query');
        console.log('🔍 PRODUCTION: Parameters:', {
          scheduleId: feedbackData.scheduleId,
          teacherName: feedbackData.teacherName,
          status: feedbackData.status,
          rescheduleDate: feedbackData.rescheduleDate || null,
          reschedulePeriod: feedbackData.reschedulePeriod || null,
          comment: feedbackData.comment || null
        });
      }
      
      if (isDeployment) {
        console.log('✅ PRODUCTION: Query executed successfully');
        console.log('✅ PRODUCTION: Result type:', typeof result);
        console.log('✅ PRODUCTION: Result keys:', Object.keys(result));
        console.log('✅ PRODUCTION: Result object:', JSON.stringify(result, null, 2));
        console.log('✅ PRODUCTION: Result rows:', result.rows);
        console.log('✅ PRODUCTION: Rows length:', result.rows?.length);
        if (result.rows && result.rows.length > 0) {
          console.log('✅ PRODUCTION: First row:', JSON.stringify(result.rows[0], null, 2));
        }
      }
      
      if (!result.rows || result.rows.length === 0) {
        console.error('❌ No rows returned from database');
        throw new Error('Database insert failed - no rows returned');
      }
      
      const savedFeedback = result.rows[0];
      if (isDeployment) {
        console.log('✅ Deployment: Returning feedback:', savedFeedback);
      }
      
      res.json(savedFeedback);
    } catch (error) {
      console.error('💥 ERROR: Failed to save teacher feedback:', error);
      if (isDeployment) {
        console.error('🚨 PRODUCTION ERROR: Type:', typeof error);
        console.error('🚨 PRODUCTION ERROR: Constructor:', error?.constructor?.name);
        console.error('🚨 PRODUCTION ERROR: Message:', error instanceof Error ? error.message : 'Unknown error');
        console.error('🚨 PRODUCTION ERROR: Stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('🚨 PRODUCTION ERROR: Full error object:', JSON.stringify(error, null, 2));
      }
      res.status(500).json({ 
        message: "Failed to save feedback",
        error: process.env.REPLIT_DEPLOYMENT === '1'
          ? (error instanceof Error ? error.message : String(error))
          : 'Database error',
        schoolCode: req.params.schoolCode,
        when: new Date().toISOString(),
        // 在部署環境提供更多調試信息
        debugInfo: process.env.REPLIT_DEPLOYMENT === '1' ? {
          errorType: error?.constructor?.name || 'Unknown',
          hasRows: 'unknown',
          sqlState: (error as any)?.code || 'unknown'
        } : undefined
      });
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

  // === 管理端密碼驗證中介軟體 ===
  const ADMIN_PASSWORD = 'dream0935314711';
  
  const requireAdminPassword = (req: any, res: any, next: any) => {
    const password = req.headers['x-admin-password'] || req.query.password;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "需要管理員密碼" });
    }
    next();
  };

  // === 教練前台系統 API ===

  // === LINE Login OAuth 2.0 ===

  const LINE_AUTH_URL = 'https://access.line.me/oauth2/v2.1/authorize';
  const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
  const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

  const lineLoginTokens = new Map<string, { lineId: string; lineName: string; linePicture: string; expiresAt: number }>();

  function getLineRedirectUri(req: any) {
    return `https://swim-scheduler-ronchen2.replit.app/api/auth/line/callback`;
  }

  function generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 48; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  const lineOAuthStates = new Map<string, number>();

  app.get('/api/auth/line', (req: any, res) => {
    const LINE_CLIENT_ID = process.env.LINE_CHANNEL_ID;
    if (!LINE_CLIENT_ID) {
      return res.status(500).json({ message: "LINE Login 尚未設定" });
    }

    const state = generateToken();
    const nonce = generateToken();
    lineOAuthStates.set(state, Date.now() + 10 * 60 * 1000);

    const redirectUri = getLineRedirectUri(req);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINE_CLIENT_ID,
      redirect_uri: redirectUri,
      state,
      scope: 'profile openid',
      nonce,
    });

    res.redirect(`${LINE_AUTH_URL}?${params.toString()}`);
  });

  app.get('/api/auth/line/callback', async (req: any, res) => {
    const { code, state, error: lineError } = req.query;

    if (lineError) {
      console.error('LINE Login error:', lineError);
      return res.redirect('/coach-portal?error=line_denied');
    }

    if (!code || !state) {
      return res.redirect('/coach-portal?error=no_code');
    }

    const stateExpiry = lineOAuthStates.get(state as string);
    if (!stateExpiry || Date.now() > stateExpiry) {
      lineOAuthStates.delete(state as string);
      return res.redirect('/coach-portal?error=invalid_state');
    }
    lineOAuthStates.delete(state as string);

    const LINE_CLIENT_ID = process.env.LINE_CHANNEL_ID;
    const LINE_CLIENT_SECRET = process.env.LINE_CHANNEL_SECRET;

    if (!LINE_CLIENT_ID || !LINE_CLIENT_SECRET) {
      return res.redirect('/coach-portal?error=line_not_configured');
    }

    try {
      const redirectUri = getLineRedirectUri(req);
      const tokenRes = await fetch(LINE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: redirectUri,
          client_id: LINE_CLIENT_ID,
          client_secret: LINE_CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) {
        const errData = await tokenRes.text();
        console.error('LINE token exchange failed:', errData);
        return res.redirect('/coach-portal?error=token_failed');
      }

      const tokenData = await tokenRes.json() as { access_token: string };
      const profileRes = await fetch(LINE_PROFILE_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!profileRes.ok) {
        return res.redirect('/coach-portal?error=profile_failed');
      }

      const profile = await profileRes.json() as { userId: string; displayName: string; pictureUrl?: string };

      const existingUser = await storage.getCoachUserByLineId(profile.userId);
      if (existingUser) {
        return res.redirect(`/coach-portal?lineLogin=existing&userId=${existingUser.id}`);
      }

      const token = generateToken();
      lineLoginTokens.set(token, {
        lineId: profile.userId,
        lineName: profile.displayName,
        linePicture: profile.pictureUrl || '',
        expiresAt: Date.now() + 15 * 60 * 1000,
      });

      return res.redirect(`/coach-portal?lineLogin=new&token=${token}`);
    } catch (error) {
      console.error('LINE Login callback error:', error);
      return res.redirect('/coach-portal?error=callback_failed');
    }
  });

  app.get('/api/auth/line/status', (req, res) => {
    const configured = !!(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET);
    res.json({ configured });
  });

  app.get('/api/auth/line/token-info/:token', (req, res) => {
    const { token } = req.params;
    const data = lineLoginTokens.get(token);
    if (!data || Date.now() > data.expiresAt) {
      lineLoginTokens.delete(token);
      return res.status(404).json({ message: "Token 已過期或不存在" });
    }
    res.json({ lineName: data.lineName, linePicture: data.linePicture });
  });

  // 教練註冊（LINE 登入後填寫資料）
  // 取得可連結的已審核教練名單（給第一次 LINE 登入用）
  app.get('/api/coach-portal/linkable-coaches', async (req, res) => {
    try {
      const approved = await storage.getApprovedCoachUsers();
      // Return coaches that don't yet have a LINE ID (so they still need linking)
      const linkable = approved
        .filter(c => !c.lineId)
        .map(c => ({ id: c.id, name: c.name }));
      res.json(linkable);
    } catch (error) {
      res.status(500).json({ message: "查詢失敗" });
    }
  });

  // 將 LINE ID 連結到現有已審核教練帳號
  app.post('/api/coach-portal/link-existing', async (req, res) => {
    try {
      const { lineToken, coachUserId } = req.body;
      if (!lineToken || !coachUserId) {
        return res.status(400).json({ message: "缺少必要參數" });
      }
      const tokenData = lineLoginTokens.get(lineToken);
      if (!tokenData || Date.now() > tokenData.expiresAt) {
        lineLoginTokens.delete(lineToken);
        return res.status(400).json({ message: "LINE 登入已過期，請重新登入" });
      }
      // Check if this LINE ID is already used
      const existing = await storage.getCoachUserByLineId(tokenData.lineId);
      if (existing) {
        lineLoginTokens.delete(lineToken);
        return res.json(existing);
      }
      // Update the coach's lineId
      const updated = await storage.updateCoachUserLineId(coachUserId, tokenData.lineId);
      if (!updated) {
        return res.status(404).json({ message: "找不到教練帳號" });
      }
      lineLoginTokens.delete(lineToken);
      res.json(updated);
    } catch (error) {
      console.error('Error linking LINE to coach:', error);
      res.status(500).json({ message: "連結失敗" });
    }
  });

  // 用姓名連結 LINE ID（新流程：教練自行輸入姓名，與 Ragic DB 核對）
  app.post('/api/coach-portal/link-by-name', async (req, res) => {
    try {
      const { lineToken, name } = req.body;
      if (!lineToken || !name?.trim()) {
        return res.status(400).json({ message: "缺少必要參數" });
      }
      const tokenData = lineLoginTokens.get(lineToken);
      if (!tokenData || Date.now() > tokenData.expiresAt) {
        lineLoginTokens.delete(lineToken);
        return res.status(400).json({ message: "LINE 登入已過期，請重新登入" });
      }
      const trimmedName = name.trim();

      // Check if LINE ID already linked
      const existingByLine = await storage.getCoachUserByLineId(tokenData.lineId);
      if (existingByLine) {
        lineLoginTokens.delete(lineToken);
        return res.json(existingByLine);
      }

      // Find coach by name in our DB (synced from Ragic)
      const allCoaches = await storage.getAllCoachUsers();
      const matched = allCoaches.find(c => c.name === trimmedName && c.status === 'approved');

      if (matched) {
        const updated = await storage.updateCoachUserLineId(matched.id, tokenData.lineId);
        lineLoginTokens.delete(lineToken);
        return res.json(updated);
      }

      // Not found in DB → notify 陳柏榮 via LINE push
      const CHEN_BO_RONG_LINE_ID = "U8fd0e4be4e44a1304f9fa2e9855f4559";
      const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (channelAccessToken) {
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${channelAccessToken}`,
          },
          body: JSON.stringify({
            to: CHEN_BO_RONG_LINE_ID,
            messages: [{
              type: "text",
              text: `【教練登入通知】\n教練「${trimmedName}」嘗試登入教練前台，但在 Ragic 資料庫中查無此名字。\n請確認該教練是否已建檔，或協助手動設定。`,
            }],
          }),
        }).catch(err => console.error("[LINE] Failed to notify 陳柏榮:", err));
      }

      return res.status(404).json({
        message: `查無「${trimmedName}」的教練資料，已通知管理員，請稍候或聯繫陳柏榮。`
      });
    } catch (error) {
      console.error('Error linking by name:', error);
      res.status(500).json({ message: "連結失敗" });
    }
  });

  app.post('/api/coach-portal/register', async (req, res) => {
    try {
      const { lineToken, name, phone, email } = req.body;

      if (!lineToken || typeof lineToken !== 'string') {
        return res.status(400).json({ message: "請先使用 LINE 登入" });
      }

      const tokenData = lineLoginTokens.get(lineToken);
      if (!tokenData || Date.now() > tokenData.expiresAt) {
        lineLoginTokens.delete(lineToken);
        return res.status(400).json({ message: "LINE 登入已過期，請重新登入" });
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
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
        status: 'pending',
        role: 'coach',
        linkedCoachName: null,
      });

      lineLoginTokens.delete(lineToken);
      res.json(coachUser);
    } catch (error) {
      console.error('Error registering coach user:', error);
      res.status(500).json({ message: "註冊失敗" });
    }
  });

  // 教練登入（用 LINE ID 或用戶 ID 查詢）
  app.get('/api/coach-portal/me/:identifier', async (req, res) => {
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
      console.error('Error fetching coach user:', error);
      res.status(500).json({ message: "查詢失敗" });
    }
  });

  // 教練個人課表
  app.get('/api/coach-portal/my-schedule', async (req, res) => {
    try {
      const { coachName, startDate, endDate } = req.query as {
        coachName: string;
        startDate: string;
        endDate: string;
      };

      if (!coachName || !startDate || !endDate) {
        return res.status(400).json({ message: "缺少必要參數" });
      }

      const mySchedules = await storage.getCoachSchedules(coachName, startDate, endDate);
      res.json(mySchedules);
    } catch (error) {
      console.error('Error fetching personal schedule:', error);
      res.status(500).json({ message: "查詢個人課表失敗" });
    }
  });

  // 當日同場教練查詢
  app.get('/api/coach-portal/colleagues', async (req, res) => {
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

      const colleagues = await storage.getColleaguesForCoach(coachName, date, venueId, timeSlotId);
      res.json(colleagues);
    } catch (error) {
      console.error('Error fetching colleagues:', error);
      res.status(500).json({ message: "查詢同場教練失敗" });
    }
  });

  // === 管理端：教練帳號審核 API（需密碼驗證） ===

  // 獲取所有教練用戶
  app.get('/api/admin/coach-users', requireAdminPassword, async (req, res) => {
    try {
      const { status } = req.query as { status?: string };
      if (status === 'pending') {
        const users = await storage.getPendingCoachUsers();
        res.json(users);
      } else {
        const users = await storage.getAllCoachUsers();
        res.json(users);
      }
    } catch (error) {
      console.error('Error fetching coach users:', error);
      res.status(500).json({ message: "查詢教練用戶失敗" });
    }
  });

  // 審核教練帳號（通過/拒絕）
  app.put('/api/admin/coach-users/:id/status', requireAdminPassword, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "狀態只能是 approved 或 rejected" });
      }

      const user = await storage.updateCoachUserStatus(id, status);
      res.json(user);
    } catch (error) {
      console.error('Error updating coach user status:', error);
      res.status(500).json({ message: "更新審核狀態失敗" });
    }
  });

  // 更新教練姓名（管理員）
  app.put('/api/admin/coach-users/:id/name', requireAdminPassword, async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: "姓名不得為空" });
      }
      const user = await storage.updateCoachUserName(id, name.trim());
      if (!user) return res.status(404).json({ message: "找不到教練" });
      res.json(user);
    } catch (error) {
      console.error('Error updating coach user name:', error);
      res.status(500).json({ message: "更新姓名失敗" });
    }
  });

  // 取得已通過審核的教練列表（公開，供前台選擇）
  app.get('/api/coach-portal/approved-coaches', async (req, res) => {
    try {
      const users = await storage.getApprovedCoachUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching approved coaches:', error);
      res.status(500).json({ message: "查詢已通過教練失敗" });
    }
  });

  // === 系統設定 API ===

  // 取得教練守則（公開）
  app.get('/api/settings/coach-rules', async (req, res) => {
    try {
      const value = await storage.getSetting('coach_rules');
      res.json({ content: value || '' });
    } catch (error) {
      console.error('Error fetching coach rules:', error);
      res.status(500).json({ message: "查詢教練守則失敗" });
    }
  });

  // 更新教練守則（需密碼）
  app.put('/api/admin/settings/coach-rules', requireAdminPassword, async (req, res) => {
    try {
      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({ message: "內容格式無效" });
      }
      await storage.setSetting('coach_rules', content);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating coach rules:', error);
      res.status(500).json({ message: "更新教練守則失敗" });
    }
  });

  // === 場館資訊 API ===

  // 取得所有場館資訊（公開）
  app.get('/api/venue-infos', async (req, res) => {
    try {
      const infos = await storage.getAllVenueInfos();
      res.json(infos);
    } catch (error) {
      console.error('Error fetching venue infos:', error);
      res.status(500).json({ message: "查詢場館資訊失敗" });
    }
  });

  // 更新場館資訊（需密碼）
  app.put('/api/admin/venue-infos/:venueName', requireAdminPassword, async (req, res) => {
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
      console.error('Error updating venue info:', error);
      res.status(500).json({ message: "更新場館資訊失敗" });
    }
  });

  // === 教練可用時段 API ===

  app.get('/api/coach-availability', async (req, res) => {
    try {
      const { weekStart } = req.query as { weekStart: string };
      if (!weekStart) {
        return res.status(400).json({ message: "Missing weekStart parameter" });
      }
      const availability = await storage.getCoachAvailabilityByWeek(weekStart);
      res.json(availability);
    } catch (error) {
      console.error('Error fetching coach availability:', error);
      res.status(500).json({ message: "Failed to fetch coach availability" });
    }
  });

  app.get('/api/coach-portal/availability', async (req, res) => {
    try {
      const { coachName, weekStart } = req.query as { coachName: string; weekStart: string };
      if (!coachName || !weekStart) {
        return res.status(400).json({ message: "Missing coachName or weekStart" });
      }
      const availability = await storage.getCoachAvailabilityForCoach(coachName, weekStart);
      res.json(availability);
    } catch (error) {
      console.error('Error fetching coach availability:', error);
      res.status(500).json({ message: "Failed to fetch coach availability" });
    }
  });

  app.post('/api/coach-portal/availability', async (req, res) => {
    try {
      const { coachName, weekStart, slots } = req.body as {
        coachName: string;
        weekStart: string;
        slots: { dayOfWeek: number; timeSlotOrder: number; available?: boolean }[];
      };
      if (!coachName || !weekStart || !Array.isArray(slots)) {
        return res.status(400).json({ message: "Missing coachName, weekStart, or slots" });
      }
      const availableSlots = slots.filter(s => s.available !== false);
      for (const slot of availableSlots) {
        if (slot.dayOfWeek < 1 || slot.dayOfWeek > 7 || slot.timeSlotOrder < 1 || slot.timeSlotOrder > 7) {
          return res.status(400).json({ message: "dayOfWeek must be 1-7, timeSlotOrder must be 1-7" });
        }
      }
      await storage.upsertCoachAvailability(coachName, weekStart, availableSlots);
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving coach availability:', error);
      res.status(500).json({ message: "Failed to save coach availability" });
    }
  });

  app.get('/api/coach-portal/venue-preferences', async (req, res) => {
    try {
      const { coachName } = req.query as { coachName: string };
      if (!coachName) {
        return res.status(400).json({ message: "Missing coachName" });
      }
      const prefs = await storage.getCoachVenuePreferences(coachName);
      res.json(prefs.map(p => p.venueName));
    } catch (error) {
      console.error('Error fetching coach venue preferences:', error);
      res.status(500).json({ message: "Failed to fetch venue preferences" });
    }
  });

  app.post('/api/coach-portal/venue-preferences', async (req, res) => {
    try {
      const { coachName, venueNames } = req.body as { coachName: string; venueNames: string[] };
      if (!coachName || !Array.isArray(venueNames)) {
        return res.status(400).json({ message: "Missing coachName or venueNames" });
      }
      await storage.setCoachVenuePreferences(coachName, venueNames);
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving coach venue preferences:', error);
      res.status(500).json({ message: "Failed to save venue preferences" });
    }
  });

  app.get('/api/admin/coach-venue-preferences', async (req, res) => {
    try {
      const password = req.headers['x-admin-password'] || req.query?.password;
      if (password !== 'dream0935314711') {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const allPrefs = await storage.getAllCoachVenuePreferences();
      const grouped: Record<string, string[]> = {};
      allPrefs.forEach(p => {
        if (!grouped[p.coachName]) grouped[p.coachName] = [];
        grouped[p.coachName].push(p.venueName);
      });
      res.json(grouped);
    } catch (error) {
      console.error('Error fetching all venue preferences:', error);
      res.status(500).json({ message: "Failed to fetch venue preferences" });
    }
  });

  app.get('/api/coach-portal/assigned-slots', async (req, res) => {
    try {
      const { coachName, startDate, endDate } = req.query as {
        coachName: string;
        startDate: string;
        endDate: string;
      };
      if (!coachName || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing parameters" });
      }
      const scheduleList = await storage.getCoachSchedules(coachName, startDate, endDate);
      const assignedSlots = scheduleList.map(s => {
        const dateObj = new Date(s.date + 'T00:00:00');
        let dayOfWeek = dateObj.getDay();
        dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
        return { dayOfWeek, timeSlotOrder: s.timeSlot.order };
      });
      res.json(assignedSlots);
    } catch (error) {
      console.error('Error fetching assigned slots:', error);
      res.status(500).json({ message: "Failed to fetch assigned slots" });
    }
  });

  const httpServer = createServer(app);
  // 部署環境診斷端點
  app.get('/api/deployment-test', async (req, res) => {
    try {
      const isDeployment = process.env.NODE_ENV === 'production' || 
                          process.env.REPLIT_DEPLOYMENT === '1' ||
                          process.env.REPL_SLUG !== undefined;
      const hasDbUrl = !!process.env.DATABASE_URL;
      
      console.log('🔍 Deployment Diagnostic:');
      console.log('- REPLIT_DEPLOYMENT:', process.env.REPLIT_DEPLOYMENT);
      console.log('- NODE_ENV:', process.env.NODE_ENV);
      console.log('- REPL_SLUG:', process.env.REPL_SLUG);
      console.log('- Has DATABASE_URL:', hasDbUrl);
      console.log('- Final isDeployment:', isDeployment);
      
      // 測試資料庫連接
      let dbTestResult = 'failed';
      try {
        const db = await getSchoolDb('demo');
        const testQuery = await db.execute(sql.raw('SELECT 1 as test'));
        dbTestResult = testQuery.rows.length > 0 ? 'success' : 'failed';
      } catch (dbError) {
        console.error('Database test error:', dbError);
      }
      
      res.json({
        deployment: isDeployment,
        replit_deployment: process.env.REPLIT_DEPLOYMENT,
        node_env: process.env.NODE_ENV,
        repl_slug: process.env.REPL_SLUG,
        database_url_exists: hasDbUrl,
        database_connection: dbTestResult,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      console.error('Deployment test error:', error);
      res.status(500).json({ error: 'Test failed' });
    }
  });

  app.post('/api/admin/send-weekly-notifications', async (req, res) => {
    const password = req.headers['x-admin-password'] || req.body?.password;
    if (password !== 'dream0935314711') {
      return res.status(401).json({ message: '密碼錯誤' });
    }

    try {
      await sendWeeklyScheduleNotifications();
      res.json({ success: true, message: '推播已發送' });
    } catch (error) {
      console.error('Manual notification trigger error:', error);
      res.status(500).json({ message: '推播發送失敗' });
    }
  });

  setupWeeklyNotificationCron();
  setupDailyNotificationCron();

  app.get('/api/admin/ragic-status', async (req, res) => {
    const password = req.headers['x-admin-password'] || req.query?.password;
    if (password !== 'dream0935314711') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(getRagicSyncStatus());
  });

  app.post('/api/admin/ragic-sync', async (req, res) => {
    const password = req.headers['x-admin-password'] || req.body?.password;
    if (password !== 'dream0935314711') {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const result = await syncRagicAll();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Manual Ragic sync error:", error);
      res.status(500).json({ message: "同步失敗", error: String(error) });
    }
  });

  setupRagicSyncCron();

  return httpServer;
}
