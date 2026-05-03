/**
 * Report writers for the weekly push pipeline (Task #23).
 *
 * Supports two formats:
 *   - CSV  — UTF-8 BOM, comma-separated, Excel-friendly (original format)
 *   - XLSX — via exceljs; proper workbook with styled header row
 *
 * Both share the same column set and data extraction logic (`rowData`).
 * `generateAndStoreReport` always persists CSV to Object Storage so the
 * stored `report_path` on the run row is stable. XLSX is generated on
 * demand in the download route (no extra storage cost).
 */
import ExcelJS from "exceljs";
import { writeReport } from "../../infra/files/reportStorage";
import { weeklyPushRepo } from "./weeklyPush.repository";
import type { WeeklyPushRecipient, WeeklyPushRun } from "@shared/schema";

type RowData = {
  runId: string;
  weekStartDate: string;
  weekEndDate: string;
  recipientName: string;
  lineUserId: string;
  status: string;
  attemptCount: number;
  sentAt: string;
  errorCode: string;
  errorMessage: string;
};

const COLUMNS: Array<{ header: string; key: keyof RowData; width: number }> = [
  { header: "Run ID",   key: "runId",         width: 38 },
  { header: "週起始日", key: "weekStartDate",  width: 12 },
  { header: "週結束日", key: "weekEndDate",    width: 12 },
  { header: "教練姓名", key: "recipientName",  width: 15 },
  { header: "LINE ID",  key: "lineUserId",     width: 38 },
  { header: "狀態",     key: "status",         width: 14 },
  { header: "嘗試次數", key: "attemptCount",   width: 10 },
  { header: "發送時間", key: "sentAt",         width: 24 },
  { header: "錯誤代碼", key: "errorCode",      width: 16 },
  { header: "錯誤訊息", key: "errorMessage",   width: 45 },
];

function rowData(run: WeeklyPushRun, r: WeeklyPushRecipient): RowData {
  return {
    runId:         run.id,
    weekStartDate: run.weekStartDate,
    weekEndDate:   run.weekEndDate,
    recipientName: r.recipientName,
    lineUserId:    r.lineUserId ?? "",
    status:        r.status,
    attemptCount:  r.attemptCount,
    sentAt:        r.sentAt
      ? (r.sentAt instanceof Date ? r.sentAt.toISOString() : String(r.sentAt))
      : "",
    errorCode:    r.errorCode    ?? "",
    errorMessage: r.errorMessage ?? "",
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function renderCsv(
  run: WeeklyPushRun,
  recipients: WeeklyPushRecipient[],
): string {
  const headers = COLUMNS.map((c) => c.header).join(",");
  const rows = recipients.map((r) =>
    COLUMNS.map((c) => csvEscape(rowData(run, r)[c.key])).join(","),
  );
  return "\uFEFF" + [headers, ...rows].join("\n") + "\n";
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

export async function renderXlsx(
  run: WeeklyPushRun,
  recipients: WeeklyPushRecipient[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "五泳池課表整合系統";

  const sheet = workbook.addWorksheet("週推播報表");
  sheet.columns = COLUMNS.map((c) => ({
    header: c.header,
    key:    c.key,
    width:  c.width,
  }));

  for (const r of recipients) {
    sheet.addRow(rowData(run, r));
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type:    "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };
  headerRow.commit();

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}

// ── Persist CSV (XLSX is generated on-demand, no extra storage cost) ─────────

/**
 * Generates the CSV for a run, persists it to Object Storage, and stores
 * the resulting path on `weekly_push_runs.report_path`.
 */
export async function generateAndStoreReport(runId: string): Promise<string> {
  const run = await weeklyPushRepo.getRunById(runId);
  if (!run) throw new Error(`run ${runId} not found`);
  const recipients = await weeklyPushRepo.listRecipientsByRun(runId);
  const csv = renderCsv(run, recipients);
  const storedPath = await writeReport(runId, csv, "csv");
  await weeklyPushRepo.updateRun(runId, { reportPath: storedPath });
  return storedPath;
}
