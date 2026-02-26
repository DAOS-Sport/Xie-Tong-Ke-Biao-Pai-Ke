import {
  users,
  venues,
  timeSlots,
  schedules,
  coachRegistrations,
  coachUsers,
  systemSettings,
  venueInfos,
  coachAvailability,
  coachVenuePreferences,
  type User,
  type UpsertUser,
  type Venue,
  type TimeSlot,
  type Schedule,
  type InsertScheduleType,
  type CoachRegistration,
  type InsertCoachRegistrationType,
  type CoachUser,
  type InsertCoachUserType,
  type SystemSetting,
  type VenueInfo,
  type CoachAvailability,
  type CoachVenuePreference,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, between, desc, sql, like, or, ilike } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Venue operations
  getVenues(): Promise<Venue[]>;
  initializeVenues(): Promise<void>;
  createVenue(name: string, color: string): Promise<Venue>;
  deleteVenue(id: string): Promise<void>;
  
  // Time slot operations
  getTimeSlots(): Promise<TimeSlot[]>;
  initializeTimeSlots(): Promise<void>;
  
  // Schedule operations
  getSchedulesByDate(date: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>;
  getSchedulesByDateRange(startDate: string, endDate: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>;
  upsertSchedule(schedule: InsertScheduleType): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;
  getCoachSchedules(coachName: string, startDate: string, endDate: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]>;
  getConflicts(date: string): Promise<{ coachName: string; timeSlotId: string; venues: string[] }[]>;
  
  // Coach registration operations  
  getSchedulesWithoutCoach(): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot; registrations: CoachRegistration[] })[]>;
  getSchedulesWithoutCoachByDateRange(startDate: string, endDate: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot; registrations: CoachRegistration[] })[]>;
  registerCoachForSchedule(registration: InsertCoachRegistrationType): Promise<CoachRegistration>;
  getCoachRegistrations(scheduleId: string): Promise<CoachRegistration[]>;
  getCoachStatistics(startDate: string, endDate: string, coachName?: string): Promise<{
    coachName: string;
    totalClasses: number;
    venueBreakdown: { venueName: string; count: number; color: string }[];
  }[]>;
  getUniqueCoaches(): Promise<string[]>;
  
  // Coach user operations (LINE-based)
  getCoachUserByLineId(lineId: string): Promise<CoachUser | undefined>;
  getCoachUserById(id: string): Promise<CoachUser | undefined>;
  createCoachUser(data: InsertCoachUserType): Promise<CoachUser>;
  updateCoachUserStatus(id: string, status: string): Promise<CoachUser>;
  updateCoachUserLineId(id: string, lineId: string): Promise<CoachUser | undefined>;
  updateCoachUserName(id: string, name: string): Promise<CoachUser | undefined>;
  getAllCoachUsers(): Promise<CoachUser[]>;
  getPendingCoachUsers(): Promise<CoachUser[]>;
  getApprovedCoachUsers(): Promise<CoachUser[]>;
  getColleaguesForCoach(coachName: string, date: string, venueId: string, timeSlotId: string): Promise<{ name: string; phone: string | null }[]>;
  
  // System settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  
  // Venue info
  getAllVenueInfos(): Promise<VenueInfo[]>;
  getVenueInfo(venueName: string): Promise<VenueInfo | undefined>;
  upsertVenueInfo(venueName: string, videoUrl: string | null, description: string | null, mapUrl?: string | null): Promise<VenueInfo>;

  // Schedule locking (two-phase scheduling)
  lockSchedules(venueId: string, startDate: string, endDate: string): Promise<void>;
  unlockSchedules(venueId: string, startDate: string, endDate: string): Promise<void>;
  assignCoach(scheduleId: string, coachName: string | null): Promise<Schedule>;
  getScheduleLockStatus(venueId: string, startDate: string, endDate: string): Promise<boolean>;

  // Coach availability
  getCoachAvailabilityByWeek(weekStart: string): Promise<CoachAvailability[]>;
  getCoachAvailabilityForCoach(coachName: string, weekStart: string): Promise<CoachAvailability[]>;
  upsertCoachAvailability(coachName: string, weekStart: string, slots: { dayOfWeek: number; timeSlotOrder: number }[]): Promise<void>;

  // Coach venue preferences
  getCoachVenuePreferences(coachName: string): Promise<CoachVenuePreference[]>;
  getAllCoachVenuePreferences(): Promise<CoachVenuePreference[]>;
  setCoachVenuePreferences(coachName: string, venueNames: string[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // 正常化字串：統一分隔符號，移除空白
  private normalizeString(s: string): string {
    return s.replace(/\s+/g, "").replace(/[－—–~～]/g, "-").trim();
  }

  // 按多種分隔符號拆分
  private splitByAnySeparator(s: string): string[] {
    return this.normalizeString(s).split(/[-、，,/|]/).filter(Boolean);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getVenues(): Promise<Venue[]> {
    return await db.select().from(venues).orderBy(venues.order);
  }

  async createVenue(name: string, color: string): Promise<Venue> {
    const existing = await this.getVenues();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(v => v.order)) : 0;
    const [venue] = await db.insert(venues).values({ name, color, order: maxOrder + 1 }).returning();
    return venue;
  }

  async deleteVenue(id: string): Promise<void> {
    const venue = await db.select().from(venues).where(eq(venues.id, id));
    if (venue.length > 0) {
      await db.delete(venueInfos).where(eq(venueInfos.venueName, venue[0].name));
      await db.delete(coachVenuePreferences).where(eq(coachVenuePreferences.venueName, venue[0].name));
    }
    await db.delete(schedules).where(eq(schedules.venueId, id));
    await db.delete(venues).where(eq(venues.id, id));
  }

  async initializeVenues(): Promise<void> {
    const existingVenues = await this.getVenues();
    if (existingVenues.length === 0) {
      const defaultVenues = [
        { name: "新北高中", color: "blue", order: 1 },
        { name: "三重商工", color: "green", order: 2 },
        { name: "三民高中", color: "purple", order: 3 },
        { name: "福林國小", color: "yellow", order: 4 },
        { name: "新莊國中", color: "orange", order: 5 },
        { name: "清江國小", color: "teal", order: 6 },
        { name: "松山國小", color: "red", order: 7 },
      ];
      await db.insert(venues).values(defaultVenues);
      console.log("✅ Default venues initialized");
    }
  }

  async getTimeSlots(): Promise<TimeSlot[]> {
    return await db.select().from(timeSlots).orderBy(timeSlots.order);
  }

  async initializeTimeSlots(): Promise<void> {
    const existingSlots = await this.getTimeSlots();
    if (existingSlots.length === 0) {
      const defaultTimeSlots = [
        { period: "第1節", startTime: "08", endTime: "09", order: 1 },
        { period: "第2節", startTime: "09", endTime: "10", order: 2 },
        { period: "第3節", startTime: "10", endTime: "11", order: 3 },
        { period: "第4節", startTime: "11", endTime: "12", order: 4 },
        { period: "第5節", startTime: "13", endTime: "14", order: 5 },
        { period: "第6節", startTime: "14", endTime: "15", order: 6 },
        { period: "第7節", startTime: "15", endTime: "16", order: 7 },
      ];
      
      await db.insert(timeSlots).values(defaultTimeSlots);
    }
  }

  async getSchedulesByDate(date: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]> {
    return await db
      .select({
        id: schedules.id,
        date: schedules.date,
        venueId: schedules.venueId,
        timeSlotId: schedules.timeSlotId,
        className: schedules.className,
        coachName: schedules.coachName,
        coachName2: schedules.coachName2,
        coachCount: schedules.coachCount,
        isClassLocked: schedules.isClassLocked,
        notes: schedules.notes,
        createdAt: schedules.createdAt,
        updatedAt: schedules.updatedAt,
        venue: venues,
        timeSlot: timeSlots,
      })
      .from(schedules)
      .innerJoin(venues, eq(schedules.venueId, venues.id))
      .innerJoin(timeSlots, eq(schedules.timeSlotId, timeSlots.id))
      .where(eq(schedules.date, date));
  }

  async getSchedulesByDateRange(startDate: string, endDate: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]> {
    return await db
      .select({
        id: schedules.id,
        date: schedules.date,
        venueId: schedules.venueId,
        timeSlotId: schedules.timeSlotId,
        className: schedules.className,
        coachName: schedules.coachName,
        coachName2: schedules.coachName2,
        coachCount: schedules.coachCount,
        isClassLocked: schedules.isClassLocked,
        notes: schedules.notes,
        createdAt: schedules.createdAt,
        updatedAt: schedules.updatedAt,
        venue: venues,
        timeSlot: timeSlots,
      })
      .from(schedules)
      .innerJoin(venues, eq(schedules.venueId, venues.id))
      .innerJoin(timeSlots, eq(schedules.timeSlotId, timeSlots.id))
      .where(between(schedules.date, startDate, endDate));
  }

  async upsertSchedule(schedule: InsertScheduleType): Promise<Schedule> {
    const [result] = await db
      .insert(schedules)
      .values({
        ...schedule,
        updatedAt: new Date(),
      })
      .returning();
    return result;
  }

  async updateSchedule(id: string, updateData: Partial<{ className: string; coachName: string; coachName2: string | null; coachCount: number }>): Promise<Schedule> {
    const setData: any = { updatedAt: new Date() };
    if (updateData.className !== undefined) setData.className = updateData.className;
    if (updateData.coachName !== undefined) setData.coachName = updateData.coachName;
    if (updateData.coachName2 !== undefined) setData.coachName2 = updateData.coachName2;
    if (updateData.coachCount !== undefined) setData.coachCount = updateData.coachCount;
    const [result] = await db
      .update(schedules)
      .set(setData)
      .where(eq(schedules.id, id))
      .returning();
    return result;
  }

  async deleteSchedule(id: string): Promise<void> {
    await db.delete(schedules).where(eq(schedules.id, id));
  }

  async getCoachSchedules(coachName: string, startDate: string, endDate: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]> {
    // 正常化輸入的教練名稱
    const normalizedCoachName = this.normalizeString(coachName);
    
    return await db
      .select({
        id: schedules.id,
        date: schedules.date,
        venueId: schedules.venueId,
        timeSlotId: schedules.timeSlotId,
        className: schedules.className,
        coachName: schedules.coachName,
        coachName2: schedules.coachName2,
        coachCount: schedules.coachCount,
        isClassLocked: schedules.isClassLocked,
        notes: schedules.notes,
        createdAt: schedules.createdAt,
        updatedAt: schedules.updatedAt,
        venue: venues,
        timeSlot: timeSlots,
      })
      .from(schedules)
      .innerJoin(venues, eq(schedules.venueId, venues.id))
      .innerJoin(timeSlots, eq(schedules.timeSlotId, timeSlots.id))
      .where(
        and(
          or(
            eq(schedules.coachName, coachName),
            like(schedules.coachName, `%-${coachName}`),
            like(schedules.coachName, `${coachName}-%`),
            like(schedules.coachName, `%-${coachName}-%`),
            sql`replace(replace(replace(${schedules.coachName}, '－', '-'), '—', '-'), ' ', '') ILIKE ${`%${normalizedCoachName}%`}`,
            eq(schedules.coachName2, coachName),
            sql`replace(replace(replace(${schedules.coachName2}, '－', '-'), '—', '-'), ' ', '') ILIKE ${`%${normalizedCoachName}%`}`
          ),
          between(schedules.date, startDate, endDate)
        )
      );
  }

  async getConflicts(date: string): Promise<{ coachName: string; timeSlotId: string; venues: string[] }[]> {
    const daySchedules = await this.getSchedulesByDate(date);
    const conflicts: { coachName: string; timeSlotId: string; venues: string[] }[] = [];
    
    const coachTimeSlotMap = new Map<string, Map<string, string[]>>();
    
    daySchedules.forEach(schedule => {
      const coaches: string[] = [];
      if (schedule.coachName) {
        if (schedule.coachName.includes('-')) {
          const parts = schedule.coachName.split('-');
          for (let i = 1; i < parts.length; i++) {
            const coach = parts[i].trim();
            if (coach && coach !== '缺') {
              coaches.push(coach);
            }
          }
        } else {
          coaches.push(schedule.coachName.trim());
        }
      }
      if (schedule.coachName2) {
        coaches.push(schedule.coachName2.trim());
      }
      if (coaches.length === 0) return;
      
      coaches.forEach(coachName => {
        if (!coachTimeSlotMap.has(coachName)) {
          coachTimeSlotMap.set(coachName, new Map());
        }
        
        const timeSlotMap = coachTimeSlotMap.get(coachName)!;
        if (!timeSlotMap.has(schedule.timeSlotId)) {
          timeSlotMap.set(schedule.timeSlotId, []);
        }
        
        timeSlotMap.get(schedule.timeSlotId)!.push(schedule.venue.name);
      });
    });
    
    coachTimeSlotMap.forEach((timeSlotMap, coachName) => {
      timeSlotMap.forEach((venues, timeSlotId) => {
        if (venues.length > 1) {
          conflicts.push({ coachName, timeSlotId, venues });
        }
      });
    });
    
    return conflicts;
  }

  async getCoachStatistics(startDate: string, endDate: string, coachName?: string): Promise<{
    coachName: string;
    totalClasses: number;
    venueBreakdown: { venueName: string; count: number; color: string }[];
  }[]> {
    const allSchedules = await db
      .select({
        coachName: schedules.coachName,
        coachName2: schedules.coachName2,
        venueName: venues.name,
        venueColor: venues.color,
      })
      .from(schedules)
      .innerJoin(venues, eq(schedules.venueId, venues.id))
      .where(
        and(
          between(schedules.date, startDate, endDate),
          sql`(${schedules.coachName} IS NOT NULL AND ${schedules.coachName} != '' OR ${schedules.coachName2} IS NOT NULL AND ${schedules.coachName2} != '')`
        )
      );

    const coachStats = new Map<string, {
      totalClasses: number;
      venueMap: Map<string, { count: number; color: string }>;
    }>();

    const addCoachCount = (name: string, venueName: string, venueColor: string) => {
      if (!name || name.trim() === '') return;
      const trimmed = name.trim();
      if (!coachStats.has(trimmed)) {
        coachStats.set(trimmed, { totalClasses: 0, venueMap: new Map() });
      }
      const stats = coachStats.get(trimmed)!;
      stats.totalClasses += 1;
      const existing = stats.venueMap.get(venueName);
      if (existing) {
        existing.count += 1;
      } else {
        stats.venueMap.set(venueName, { count: 1, color: venueColor });
      }
    };

    for (const row of allSchedules) {
      if (row.coachName) addCoachCount(row.coachName, row.venueName, row.venueColor);
      if (row.coachName2) addCoachCount(row.coachName2, row.venueName, row.venueColor);
    }

    let result = Array.from(coachStats.entries()).map(([name, stats]) => ({
      coachName: name,
      totalClasses: stats.totalClasses,
      venueBreakdown: Array.from(stats.venueMap.entries()).map(([venueName, v]) => ({
        venueName,
        count: v.count,
        color: v.color,
      })),
    }));

    if (coachName) {
      result = result.filter(r => r.coachName.includes(coachName));
    }

    result.sort((a, b) => b.totalClasses - a.totalClasses);
    return result;
  }

  async getUniqueCoaches(): Promise<string[]> {
    const results = await db
      .selectDistinct({ coachName: schedules.coachName })
      .from(schedules)
      .where(sql`${schedules.coachName} IS NOT NULL AND ${schedules.coachName} != '' AND ${schedules.coachName} NOT LIKE '%缺%'`);
    
    // 分析教練名稱，支援多教練格式：班級-教練1-教練2 及單獨教練
    const uniqueCoaches = new Set<string>();
    
    results.forEach(result => {
      if (!result.coachName) return;
      
      // 檢查是否包含任何分隔符號
      if (/[-－—–~～、，,/|]/.test(result.coachName)) {
        // 多教練格式：分割後跳過第一部分（班級），其餘為教練
        const parts = this.splitByAnySeparator(result.coachName);
        for (let i = 1; i < parts.length; i++) {
          const coach = parts[i].trim();
          if (coach && coach !== '缺') {
            uniqueCoaches.add(coach);
          }
        }
      } else {
        // 單獨教練名稱，直接加入
        const coach = result.coachName.trim();
        if (coach && coach !== '缺') {
          uniqueCoaches.add(coach);
        }
      }
    });
    
    return Array.from(uniqueCoaches).sort();
  }

  // 按日期範圍獲取沒有教練的課程（優化版本）
  async getSchedulesWithoutCoachByDateRange(startDate: string, endDate: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot; registrations: CoachRegistration[] })[]> {
    // 一次性查詢指定日期範圍的缺教練課程和其登記訊息
    const results = await db
      .select({
        id: schedules.id,
        date: schedules.date,
        venueId: schedules.venueId,
        timeSlotId: schedules.timeSlotId,
        className: schedules.className,
        coachName: schedules.coachName,
        coachName2: schedules.coachName2,
        coachCount: schedules.coachCount,
        isClassLocked: schedules.isClassLocked,
        notes: schedules.notes,
        createdAt: schedules.createdAt,
        updatedAt: schedules.updatedAt,
        venue: venues,
        timeSlot: timeSlots,
        registrationId: coachRegistrations.id,
        registrationCoachName: coachRegistrations.coachName,
        registrationRegisteredAt: coachRegistrations.registeredAt,
      })
      .from(schedules)
      .innerJoin(venues, eq(schedules.venueId, venues.id))
      .innerJoin(timeSlots, eq(schedules.timeSlotId, timeSlots.id))
      .leftJoin(coachRegistrations, eq(schedules.id, coachRegistrations.scheduleId))
      .where(
        and(
          sql`${schedules.className} IS NOT NULL AND ${schedules.className} != ''`,
          between(schedules.date, startDate, endDate),
          or(
            // 完全沒有教練的課程
            sql`${schedules.coachName} IS NULL`,
            sql`${schedules.coachName} = ''`,
            // 包含"缺"字的課程（表示還缺教練）
            sql`${schedules.coachName} LIKE '%缺%'`
          )
        )
      )
      .orderBy(schedules.date, timeSlots.order);

    // 將結果按schedule分組
    const schedulesMap = new Map<string, Schedule & { venue: Venue; timeSlot: TimeSlot; registrations: CoachRegistration[] }>();

    for (const result of results) {
      const scheduleId = result.id;
      
      if (!schedulesMap.has(scheduleId)) {
        schedulesMap.set(scheduleId, {
          id: result.id,
          date: result.date,
          venueId: result.venueId,
          timeSlotId: result.timeSlotId,
          className: result.className,
          coachName: result.coachName,
          coachName2: result.coachName2,
          coachCount: result.coachCount,
          isClassLocked: result.isClassLocked,
          notes: result.notes,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          venue: result.venue,
          timeSlot: result.timeSlot,
          registrations: [],
        });
      }

      // 如果有登記訊息，加入到該課程的登記列表中
      if (result.registrationId) {
        const schedule = schedulesMap.get(scheduleId)!;
        schedule.registrations.push({
          id: result.registrationId,
          scheduleId: scheduleId,
          coachName: result.registrationCoachName!,
          registeredAt: result.registrationRegisteredAt!,
        });
      }
    }

    return Array.from(schedulesMap.values());
  }

  // 獲取沒有教練的課程（並包含登記訊息）- 優化版本
  async getSchedulesWithoutCoach(): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot; registrations: CoachRegistration[] })[]> {
    // 一次性查詢所有缺教練的課程和其登記訊息
    const results = await db
      .select({
        id: schedules.id,
        date: schedules.date,
        venueId: schedules.venueId,
        timeSlotId: schedules.timeSlotId,
        className: schedules.className,
        coachName: schedules.coachName,
        coachName2: schedules.coachName2,
        coachCount: schedules.coachCount,
        isClassLocked: schedules.isClassLocked,
        notes: schedules.notes,
        createdAt: schedules.createdAt,
        updatedAt: schedules.updatedAt,
        venue: venues,
        timeSlot: timeSlots,
        registrationId: coachRegistrations.id,
        registrationCoachName: coachRegistrations.coachName,
        registrationRegisteredAt: coachRegistrations.registeredAt,
      })
      .from(schedules)
      .innerJoin(venues, eq(schedules.venueId, venues.id))
      .innerJoin(timeSlots, eq(schedules.timeSlotId, timeSlots.id))
      .leftJoin(coachRegistrations, eq(schedules.id, coachRegistrations.scheduleId))
      .where(
        and(
          sql`${schedules.className} IS NOT NULL AND ${schedules.className} != ''`,
          or(
            // 完全沒有教練的課程
            sql`${schedules.coachName} IS NULL`,
            sql`${schedules.coachName} = ''`,
            // 包含"缺"字的課程（表示還缺教練）
            sql`${schedules.coachName} LIKE '%缺%'`
          )
        )
      )
      .orderBy(schedules.date, timeSlots.order);

    // 將結果按schedule分組
    const schedulesMap = new Map<string, Schedule & { venue: Venue; timeSlot: TimeSlot; registrations: CoachRegistration[] }>();

    for (const result of results) {
      const scheduleId = result.id;
      
      if (!schedulesMap.has(scheduleId)) {
        schedulesMap.set(scheduleId, {
          id: result.id,
          date: result.date,
          venueId: result.venueId,
          timeSlotId: result.timeSlotId,
          className: result.className,
          coachName: result.coachName,
          coachName2: result.coachName2,
          coachCount: result.coachCount,
          isClassLocked: result.isClassLocked,
          notes: result.notes,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          venue: result.venue,
          timeSlot: result.timeSlot,
          registrations: [],
        });
      }

      // 如果有登記訊息，加入到該課程的登記列表中
      if (result.registrationId) {
        const schedule = schedulesMap.get(scheduleId)!;
        schedule.registrations.push({
          id: result.registrationId,
          scheduleId: scheduleId,
          coachName: result.registrationCoachName!,
          registeredAt: result.registrationRegisteredAt!,
        });
      }
    }

    return Array.from(schedulesMap.values());
  }

  // 教練登記功能
  async registerCoachForSchedule(registration: InsertCoachRegistrationType): Promise<CoachRegistration> {
    const [result] = await db
      .insert(coachRegistrations)
      .values(registration)
      .returning();
    return result;
  }

  // 獲取特定課程的教練登記列表
  async getCoachRegistrations(scheduleId: string): Promise<CoachRegistration[]> {
    return await db
      .select()
      .from(coachRegistrations)
      .where(eq(coachRegistrations.scheduleId, scheduleId))
      .orderBy(coachRegistrations.registeredAt);
  }

  // === Coach User 操作 (LINE 前台系統) ===

  async getCoachUserByLineId(lineId: string): Promise<CoachUser | undefined> {
    const [user] = await db.select().from(coachUsers).where(eq(coachUsers.lineId, lineId));
    return user;
  }

  async getCoachUserById(id: string): Promise<CoachUser | undefined> {
    const [user] = await db.select().from(coachUsers).where(eq(coachUsers.id, id));
    return user;
  }

  async createCoachUser(data: InsertCoachUserType): Promise<CoachUser> {
    const [user] = await db.insert(coachUsers).values(data).returning();
    return user;
  }

  async updateCoachUserStatus(id: string, status: string): Promise<CoachUser> {
    const [user] = await db
      .update(coachUsers)
      .set({ status, updatedAt: new Date() })
      .where(eq(coachUsers.id, id))
      .returning();
    return user;
  }

  async updateCoachUserLineId(id: string, lineId: string): Promise<CoachUser | undefined> {
    const [user] = await db
      .update(coachUsers)
      .set({ lineId, updatedAt: new Date() })
      .where(eq(coachUsers.id, id))
      .returning();
    return user;
  }

  async updateCoachUserName(id: string, name: string): Promise<CoachUser | undefined> {
    const [user] = await db
      .update(coachUsers)
      .set({ name, updatedAt: new Date() })
      .where(eq(coachUsers.id, id))
      .returning();
    return user;
  }

  async getAllCoachUsers(): Promise<CoachUser[]> {
    return await db.select().from(coachUsers).orderBy(
      sql`CASE WHEN ${coachUsers.name} = '陳柏榮' THEN 0 ELSE 1 END`,
      coachUsers.name
    );
  }

  async getPendingCoachUsers(): Promise<CoachUser[]> {
    return await db.select().from(coachUsers).where(eq(coachUsers.status, 'pending')).orderBy(desc(coachUsers.createdAt));
  }

  async getApprovedCoachUsers(): Promise<CoachUser[]> {
    return await db.select().from(coachUsers).where(eq(coachUsers.status, 'approved')).orderBy(coachUsers.name);
  }

  async getColleaguesForCoach(coachName: string, date: string, venueId: string, timeSlotId: string): Promise<{ name: string; phone: string | null }[]> {
    const sameSlotSchedules = await db
      .select({ coachName: schedules.coachName })
      .from(schedules)
      .where(
        and(
          eq(schedules.date, date),
          eq(schedules.venueId, venueId),
          eq(schedules.timeSlotId, timeSlotId)
        )
      );

    const colleagueNames = sameSlotSchedules
      .map(s => s.coachName)
      .filter((name): name is string => !!name && name !== coachName);

    if (colleagueNames.length === 0) return [];

    const colleagues: { name: string; phone: string | null }[] = [];
    for (const name of colleagueNames) {
      const [coachUser] = await db
        .select({ name: coachUsers.name, phone: coachUsers.phone })
        .from(coachUsers)
        .where(eq(coachUsers.name, name));
      colleagues.push({
        name,
        phone: coachUser?.phone || null,
      });
    }

    return colleagues;
  }

  async getSetting(key: string): Promise<string | null> {
    const [result] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return result?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db
      .insert(systemSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }

  async getAllVenueInfos(): Promise<VenueInfo[]> {
    return await db.select().from(venueInfos).orderBy(venueInfos.venueName);
  }

  async getVenueInfo(venueName: string): Promise<VenueInfo | undefined> {
    const [result] = await db
      .select()
      .from(venueInfos)
      .where(eq(venueInfos.venueName, venueName));
    return result;
  }

  async upsertVenueInfo(venueName: string, videoUrl: string | null, description: string | null, mapUrl?: string | null): Promise<VenueInfo> {
    const [result] = await db
      .insert(venueInfos)
      .values({ venueName, videoUrl, description, mapUrl: mapUrl ?? null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: venueInfos.venueName,
        set: { videoUrl, description, mapUrl: mapUrl ?? null, updatedAt: new Date() },
      })
      .returning();
    return result;
  }

  async lockSchedules(venueId: string, startDate: string, endDate: string): Promise<void> {
    await db
      .update(schedules)
      .set({ isClassLocked: true, updatedAt: new Date() })
      .where(
        and(
          eq(schedules.venueId, venueId),
          between(schedules.date, startDate, endDate)
        )
      );
  }

  async unlockSchedules(venueId: string, startDate: string, endDate: string): Promise<void> {
    await db
      .update(schedules)
      .set({ isClassLocked: false, updatedAt: new Date() })
      .where(
        and(
          eq(schedules.venueId, venueId),
          between(schedules.date, startDate, endDate)
        )
      );
  }

  async assignCoach(scheduleId: string, coachName: string | null): Promise<Schedule> {
    const [result] = await db
      .update(schedules)
      .set({ coachName, updatedAt: new Date() })
      .where(eq(schedules.id, scheduleId))
      .returning();
    return result;
  }

  async getScheduleLockStatus(venueId: string, startDate: string, endDate: string): Promise<boolean> {
    const result = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.venueId, venueId),
          between(schedules.date, startDate, endDate)
        )
      );
    if (result.length === 0) return false;
    return result.every(s => s.isClassLocked);
  }

  async getCoachAvailabilityByWeek(weekStart: string): Promise<CoachAvailability[]> {
    return await db
      .select()
      .from(coachAvailability)
      .where(eq(coachAvailability.weekStart, weekStart));
  }

  async getCoachAvailabilityForCoach(coachName: string, weekStart: string): Promise<CoachAvailability[]> {
    return await db
      .select()
      .from(coachAvailability)
      .where(
        and(
          eq(coachAvailability.coachName, coachName),
          eq(coachAvailability.weekStart, weekStart)
        )
      );
  }

  async upsertCoachAvailability(coachName: string, weekStart: string, slots: { dayOfWeek: number; timeSlotOrder: number }[]): Promise<void> {
    await db
      .delete(coachAvailability)
      .where(
        and(
          eq(coachAvailability.coachName, coachName),
          eq(coachAvailability.weekStart, weekStart)
        )
      );
    if (slots.length > 0) {
      await db.insert(coachAvailability).values(
        slots.map(s => ({
          coachName,
          weekStart,
          dayOfWeek: s.dayOfWeek,
          timeSlotOrder: s.timeSlotOrder,
        }))
      );
    }
  }

  async getCoachVenuePreferences(coachName: string): Promise<CoachVenuePreference[]> {
    return await db
      .select()
      .from(coachVenuePreferences)
      .where(eq(coachVenuePreferences.coachName, coachName));
  }

  async getAllCoachVenuePreferences(): Promise<CoachVenuePreference[]> {
    return await db.select().from(coachVenuePreferences);
  }

  async setCoachVenuePreferences(coachName: string, venueNames: string[]): Promise<void> {
    await db
      .delete(coachVenuePreferences)
      .where(eq(coachVenuePreferences.coachName, coachName));
    if (venueNames.length > 0) {
      await db.insert(coachVenuePreferences).values(
        venueNames.map(venueName => ({ coachName, venueName }))
      );
    }
  }

}

export const storage = new DatabaseStorage();
