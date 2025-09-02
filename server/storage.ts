import {
  users,
  venues,
  timeSlots,
  schedules,
  coachRegistrations,
  type User,
  type UpsertUser,
  type Venue,
  type TimeSlot,
  type Schedule,
  type InsertScheduleType,
  type CoachRegistration,
  type InsertCoachRegistrationType,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, between, desc, sql, like, or } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Venue operations
  getVenues(): Promise<Venue[]>;
  initializeVenues(): Promise<void>;
  
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
}

export class DatabaseStorage implements IStorage {
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

  async initializeVenues(): Promise<void> {
    const existingVenues = await this.getVenues();
    if (existingVenues.length === 0) {
      const defaultVenues = [
        { name: "新北高中", color: "blue", order: 1 },
        { name: "三重商工", color: "green", order: 2 },
        { name: "三民高中", color: "purple", order: 3 },
        { name: "福林國小", color: "yellow", order: 4 },
        { name: "新莊國中", color: "orange", order: 5 },
        { name: "士東國小", color: "pink", order: 6 },
      ];
      
      await db.insert(venues).values(defaultVenues);
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

  async updateSchedule(id: string, updateData: { className: string; coachName: string }): Promise<Schedule> {
    const [result] = await db
      .update(schedules)
      .set({
        className: updateData.className,
        coachName: updateData.coachName,
        updatedAt: new Date(),
      })
      .where(eq(schedules.id, id))
      .returning();
    return result;
  }

  async deleteSchedule(id: string): Promise<void> {
    await db.delete(schedules).where(eq(schedules.id, id));
  }

  async getCoachSchedules(coachName: string, startDate: string, endDate: string): Promise<(Schedule & { venue: Venue; timeSlot: TimeSlot })[]> {
    return await db
      .select({
        id: schedules.id,
        date: schedules.date,
        venueId: schedules.venueId,
        timeSlotId: schedules.timeSlotId,
        className: schedules.className,
        coachName: schedules.coachName,
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
            like(schedules.coachName, `${coachName}-%`),
            like(schedules.coachName, `%-${coachName}`),
            like(schedules.coachName, `%-${coachName}-%`)
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
      if (!schedule.coachName) return;
      
      // 分析多教練格式：班級-教練1-教練2
      const coaches: string[] = [];
      if (schedule.coachName.includes('-')) {
        const parts = schedule.coachName.split('-');
        // 跳過第一部分（班級名稱），其他部分是教練
        for (let i = 1; i < parts.length; i++) {
          const coach = parts[i].trim();
          if (coach && coach !== '缺') {
            coaches.push(coach);
          }
        }
      }
      
      // 為每個教練檢查時間衝突
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
    const query = db
      .select({
        coachName: schedules.coachName,
        venueName: venues.name,
        venueColor: venues.color,
        count: sql<number>`count(*)`,
      })
      .from(schedules)
      .innerJoin(venues, eq(schedules.venueId, venues.id))
      .where(
        and(
          between(schedules.date, startDate, endDate),
          sql`${schedules.coachName} IS NOT NULL`,
          coachName ? eq(schedules.coachName, coachName) : undefined
        )
      )
      .groupBy(schedules.coachName, venues.name, venues.color);

    const results = await query;
    
    const coachStats = new Map<string, {
      totalClasses: number;
      venueBreakdown: { venueName: string; count: number; color: string }[];
    }>();

    results.forEach(result => {
      if (!result.coachName) return;
      
      // 分析多教練格式：班級-教練1-教練2
      const coaches: string[] = [];
      if (result.coachName.includes('-')) {
        const parts = result.coachName.split('-');
        // 跳過第一部分（班級名稱），其他部分是教練
        for (let i = 1; i < parts.length; i++) {
          const coach = parts[i].trim();
          if (coach && coach !== '缺') {
            coaches.push(coach);
          }
        }
      }
      
      // 為每個教練分別計算統計
      coaches.forEach(coachName => {
        if (!coachStats.has(coachName)) {
          coachStats.set(coachName, {
            totalClasses: 0,
            venueBreakdown: []
          });
        }

        const stats = coachStats.get(coachName)!;
        // 如果是多教練課程，每個教練分攤課程數
        const sharePerCoach = result.count / coaches.length;
        stats.totalClasses += sharePerCoach;
        stats.venueBreakdown.push({
          venueName: result.venueName,
          count: sharePerCoach,
          color: result.venueColor
        });
      });
    });

    return Array.from(coachStats.entries()).map(([coachName, stats]) => ({
      coachName,
      totalClasses: stats.totalClasses,
      venueBreakdown: stats.venueBreakdown
    }));
  }

  async getUniqueCoaches(): Promise<string[]> {
    const results = await db
      .selectDistinct({ coachName: schedules.coachName })
      .from(schedules)
      .where(sql`${schedules.coachName} IS NOT NULL AND ${schedules.coachName} != '' AND ${schedules.coachName} NOT LIKE '%缺%'`);
    
    // 分析教練名稱，支援多教練格式：班級-教練1-教練2
    const uniqueCoaches = new Set<string>();
    
    results.forEach(result => {
      if (!result.coachName) return;
      
      // 如果教練名稱包含連字符，表示可能是多個教練
      if (result.coachName.includes('-')) {
        // 分割教練名稱，第一部分通常是班級名稱，其他部分是教練
        const parts = result.coachName.split('-');
        // 跳過第一部分（班級名稱），處理其他部分作為教練名稱
        for (let i = 1; i < parts.length; i++) {
          const coach = parts[i].trim();
          if (coach && coach !== '缺') {
            uniqueCoaches.add(coach);
          }
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
}

export const storage = new DatabaseStorage();
