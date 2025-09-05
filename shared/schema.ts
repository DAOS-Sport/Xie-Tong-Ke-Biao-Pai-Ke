import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  date,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("student"), // admin, coach, student
  coachName: varchar("coach_name"), // For coach role users
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const venues = pgTable("venues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  color: varchar("color").notNull(),
  order: integer("order").notNull(),
});

export const timeSlots = pgTable("time_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  period: varchar("period").notNull(), // 第1節, 第2節, etc.
  startTime: varchar("start_time").notNull(),
  endTime: varchar("end_time").notNull(),
  order: integer("order").notNull(),
});

export const schedules = pgTable("schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(),
  venueId: varchar("venue_id").notNull().references(() => venues.id),
  timeSlotId: varchar("time_slot_id").notNull().references(() => timeSlots.id),
  className: varchar("class_name"),
  coachName: varchar("coach_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 教練登記表 - 存儲對沒有教練課程的登記
export const coachRegistrations = pgTable("coach_registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id").notNull().references(() => schedules.id, { onDelete: 'cascade' }),
  coachName: varchar("coach_name").notNull(),
  registeredAt: timestamp("registered_at").defaultNow(),
});

// 多學校系統表定義
// 教師表 - 各學校的教師清單
export const teachers = pgTable("teachers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherName: varchar("teacher_name").notNull(),
  subject: varchar("subject"), // 科目（可選）
  createdAt: timestamp("created_at").defaultNow(),
});

// 教師回覆表 - 老師對課程的回覆狀態
export const teacherFeedbacks = pgTable("teacher_feedbacks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id").notNull().references(() => schedules.id, { onDelete: 'cascade' }),
  teacherName: varchar("teacher_name").notNull(),
  status: varchar("status").notNull(), // need_coop / no_coop / reschedule
  rescheduleDate: date("reschedule_date"), // 調課日期（status=reschedule時必填）
  reschedulePeriod: varchar("reschedule_period"), // 調課節次（status=reschedule時必填）
  comment: text("comment"), // 備註（可選）
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // 同一老師對同一課程只保留最後一次回覆
  unique().on(table.scheduleId, table.teacherName),
]);

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  venue: one(venues, {
    fields: [schedules.venueId],
    references: [venues.id],
  }),
  timeSlot: one(timeSlots, {
    fields: [schedules.timeSlotId],
    references: [timeSlots.id],
  }),
  coachRegistrations: many(coachRegistrations),
  teacherFeedbacks: many(teacherFeedbacks),
}));

export const coachRegistrationsRelations = relations(coachRegistrations, ({ one }) => ({
  schedule: one(schedules, {
    fields: [coachRegistrations.scheduleId],
    references: [schedules.id],
  }),
}));

export const venuesRelations = relations(venues, ({ many }) => ({
  schedules: many(schedules),
}));

export const timeSlotsRelations = relations(timeSlots, ({ many }) => ({
  schedules: many(schedules),
}));

export const teachersRelations = relations(teachers, ({ many }) => ({
  feedbacks: many(teacherFeedbacks),
}));

export const teacherFeedbacksRelations = relations(teacherFeedbacks, ({ one }) => ({
  schedule: one(schedules, {
    fields: [teacherFeedbacks.scheduleId],
    references: [schedules.id],
  }),
}));

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertVenue = typeof venues.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type InsertTimeSlot = typeof timeSlots.$inferInsert;
export type TimeSlot = typeof timeSlots.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type InsertCoachRegistration = typeof coachRegistrations.$inferInsert;
export type CoachRegistration = typeof coachRegistrations.$inferSelect;
export type InsertTeacher = typeof teachers.$inferInsert;
export type Teacher = typeof teachers.$inferSelect;
export type InsertTeacherFeedback = typeof teacherFeedbacks.$inferInsert;
export type TeacherFeedback = typeof teacherFeedbacks.$inferSelect;

export const insertScheduleSchema = createInsertSchema(schedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCoachRegistrationSchema = createInsertSchema(coachRegistrations).omit({
  id: true,
  registeredAt: true,
});

export const insertTeacherFeedbackSchema = createInsertSchema(teacherFeedbacks).omit({
  id: true,
  updatedAt: true,
});

export type InsertScheduleType = z.infer<typeof insertScheduleSchema>;
export type InsertUserType = z.infer<typeof insertUserSchema>;
export type InsertCoachRegistrationType = z.infer<typeof insertCoachRegistrationSchema>;
export type InsertTeacherFeedbackType = z.infer<typeof insertTeacherFeedbackSchema>;
