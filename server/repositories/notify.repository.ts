/**
 * Notify repository — LINE push log persistence. The IStorage façade in
 * `server/storage.ts` delegates here; route handlers must NOT touch
 * `db` directly.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  lineNotifyLogs,
  type LineNotifyLog,
  type InsertLineNotifyLog,
} from "@shared/schema";

export class NotifyRepository {
  async getNotifyLogsByDate(date: string): Promise<LineNotifyLog[]> {
    return await db
      .select()
      .from(lineNotifyLogs)
      .where(eq(lineNotifyLogs.scheduleDate, date));
  }

  async insertNotifyLog(log: InsertLineNotifyLog): Promise<void> {
    await db.insert(lineNotifyLogs).values(log);
  }
}
