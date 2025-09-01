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
}, (table) => ({
  uniqueDateVenueTimeSlot: unique().on(table.date, table.venueId, table.timeSlotId),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  venue: one(venues, {
    fields: [schedules.venueId],
    references: [venues.id],
  }),
  timeSlot: one(timeSlots, {
    fields: [schedules.timeSlotId],
    references: [timeSlots.id],
  }),
}));

export const venuesRelations = relations(venues, ({ many }) => ({
  schedules: many(schedules),
}));

export const timeSlotsRelations = relations(timeSlots, ({ many }) => ({
  schedules: many(schedules),
}));

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertVenue = typeof venues.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type InsertTimeSlot = typeof timeSlots.$inferInsert;
export type TimeSlot = typeof timeSlots.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;

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

export type InsertScheduleType = z.infer<typeof insertScheduleSchema>;
export type InsertUserType = z.infer<typeof insertUserSchema>;
