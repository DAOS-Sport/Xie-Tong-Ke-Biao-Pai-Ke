/**
 * Repository wrapping all per-school SQL access.
 *
 * Routes never touch raw SQL or `getSchoolDb` directly — they call into
 * this module so the unsafe parts (string concatenation around schema
 * names, dynamic table targets) are isolated and validated here.
 *
 * `schoolCode` is restricted to /^[a-zA-Z0-9_]+$/ by `isValidSchoolCode`,
 * so it is safe to interpolate into identifiers.
 */
import { sql, and, eq, gte, lte } from "drizzle-orm";
import { schedules, insertScheduleSchema } from "@shared/schema";
import { getSchoolDb, isValidSchoolCode } from "../multi-school-db";

function assertSchool(schoolCode: string) {
  if (!isValidSchoolCode(schoolCode)) {
    throw new Error(`Invalid school code: ${schoolCode}`);
  }
}

export type SchoolTeacher = {
  teacherName: string;
  subject: string | null;
  createdAt: string | null;
};

export async function listTeachers(
  schoolCode: string
): Promise<SchoolTeacher[]> {
  assertSchool(schoolCode);
  const db = await getSchoolDb(schoolCode);
  const result = await db.execute(
    sql.raw(`
      SELECT teacher_name, subject, created_at
      FROM school_${schoolCode}.teachers
      ORDER BY teacher_name
    `)
  );
  return result.rows.map((row: any) => ({
    teacherName: row.teacher_name,
    subject: row.subject,
    createdAt: row.created_at,
  }));
}

export async function listSchedules(
  schoolCode: string,
  filters: { teacher?: string; startDate?: string; endDate?: string }
) {
  assertSchool(schoolCode);
  const db = await getSchoolDb(schoolCode);

  const whereConditions: any[] = [];
  if (filters.teacher) {
    whereConditions.push(eq(schedules.coachName, filters.teacher));
  }
  if (filters.startDate && filters.endDate) {
    whereConditions.push(
      and(
        gte(schedules.date, filters.startDate),
        lte(schedules.date, filters.endDate)
      )
    );
  }

  return whereConditions.length > 0
    ? await db.select().from(schedules).where(and(...whereConditions))
    : await db.select().from(schedules);
}

export async function listFeedbacks(
  schoolCode: string,
  filters: { teacher?: string; scheduleId?: string }
): Promise<any[]> {
  assertSchool(schoolCode);
  const db = await getSchoolDb(schoolCode);

  const conditions: any[] = [];
  if (filters.teacher) {
    conditions.push(sql`teacher_name = ${filters.teacher}`);
  }
  if (filters.scheduleId) {
    conditions.push(sql`schedule_id = ${filters.scheduleId}`);
  }

  const whereClause =
    conditions.length > 0
      ? sql` WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

  const result = await db.execute(sql`
    SELECT * FROM ${sql.raw(`school_${schoolCode}.teacher_feedbacks`)}
    ${whereClause}
    ORDER BY updated_at DESC
  `);

  return (result.rows as any[]) || [];
}

export type FeedbackInput = {
  scheduleId: string;
  teacherName: string;
  status: string;
  rescheduleDate?: string | null;
  reschedulePeriod?: string | null;
  comment?: string | null;
};

export async function upsertFeedback(
  schoolCode: string,
  data: FeedbackInput
) {
  assertSchool(schoolCode);
  const db = await getSchoolDb(schoolCode);
  const result = await db.execute(sql`
    INSERT INTO ${sql.raw(`school_${schoolCode}.teacher_feedbacks`)}
      (schedule_id, teacher_name, status, reschedule_date, reschedule_period, comment, updated_at)
    VALUES (
      ${data.scheduleId},
      ${data.teacherName},
      ${data.status},
      ${data.rescheduleDate || null},
      ${data.reschedulePeriod || null},
      ${data.comment || null},
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
  if (!result.rows || result.rows.length === 0) {
    throw new Error("Database insert failed - no rows returned");
  }
  return result.rows[0];
}

export async function createSchoolSchedule(
  schoolCode: string,
  rawBody: unknown
) {
  assertSchool(schoolCode);
  const validation = insertScheduleSchema.safeParse(rawBody);
  if (!validation.success) {
    return { ok: false as const, errors: validation.error.issues };
  }
  const db = await getSchoolDb(schoolCode);
  const inserted = await db
    .insert(schedules)
    .values({
      ...validation.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return { ok: true as const, schedule: inserted[0] };
}

export async function deleteSchoolSchedule(
  schoolCode: string,
  scheduleId: string
) {
  assertSchool(schoolCode);
  const db = await getSchoolDb(schoolCode);
  const deleted = await db
    .delete(schedules)
    .where(eq(schedules.id, scheduleId))
    .returning();
  return deleted.length > 0;
}

export async function pingSchoolDb(schoolCode: string): Promise<boolean> {
  assertSchool(schoolCode);
  const db = await getSchoolDb(schoolCode);
  const result = await db.execute(sql`SELECT 1 as test`);
  return result.rows.length > 0;
}
