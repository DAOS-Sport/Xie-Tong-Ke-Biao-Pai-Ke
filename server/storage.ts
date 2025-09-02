import {
  users,
  venues,
  timeSlots,
  schedules,
  type User,
  type UpsertUser,
  type Venue,
  type TimeSlot,
  type Schedule,
  type InsertScheduleType,
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
      
      if (!coachTimeSlotMap.has(schedule.coachName)) {
        coachTimeSlotMap.set(schedule.coachName, new Map());
      }
      
      const timeSlotMap = coachTimeSlotMap.get(schedule.coachName)!;
      if (!timeSlotMap.has(schedule.timeSlotId)) {
        timeSlotMap.set(schedule.timeSlotId, []);
      }
      
      timeSlotMap.get(schedule.timeSlotId)!.push(schedule.venue.name);
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
      
      if (!coachStats.has(result.coachName)) {
        coachStats.set(result.coachName, {
          totalClasses: 0,
          venueBreakdown: []
        });
      }

      const stats = coachStats.get(result.coachName)!;
      stats.totalClasses += result.count;
      stats.venueBreakdown.push({
        venueName: result.venueName,
        count: result.count,
        color: result.venueColor
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
      .where(sql`${schedules.coachName} IS NOT NULL AND ${schedules.coachName} != ''`);
    
    return results.map(r => r.coachName).filter(Boolean) as string[];
  }
}

export const storage = new DatabaseStorage();
