/**
 * CSV report writer for the weekly push (Task #23).
 *
 * Produces one row per recipient with everything an admin needs to
 * audit a run: who, when, status, errors, attempt count. Output is
 * written via `infra/files/reportStorage` so all reports land in
 * the same `/tmp/weekly-push-reports/` dir.
 *
 * Excel output is intentionally NOT implemented in the first cut —
 * the spec defers exceljs to a follow-up. CSV opens cleanly in Excel
 * with a UTF-8 BOM, which we include.
 */
import { writeReport } from "../../infra/files/reportStorage";
import { weeklyPushRepo } from "./weeklyPush.repository";
import type { WeeklyPushRecipient, WeeklyPushRun } from "@shared/schema";

const HEADERS = [
  "runId",
  "weekStartDate",
  "weekEndDate",
  "recipientName",
  "lineUserId",
  "status",
  "attemptCount",
  "sentAt",
  "errorCode",
  "errorMessage",
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowFor(run: WeeklyPushRun, r: WeeklyPushRecipient): string {
  return [
    run.id,
    run.weekStartDate,
    run.weekEndDate,
    r.recipientName,
    r.lineUserId,
    r.status,
    r.attemptCount,
    r.sentAt,
    r.errorCode,
    r.errorMessage,
  ]
    .map(csvEscape)
    .join(",");
}

export function renderCsv(
  run: WeeklyPushRun,
  recipients: WeeklyPushRecipient[],
): string {
  const lines = [HEADERS.join(",")];
  for (const r of recipients) lines.push(rowFor(run, r));
  // Excel-friendly UTF-8 BOM.
  return "\uFEFF" + lines.join("\n") + "\n";
}

/**
 * Generates the CSV for a run and persists it to the local report
 * directory. Returns the on-disk path so the orchestrator can stash
 * it onto `weekly_push_runs.report_path`.
 */
export async function generateAndStoreReport(runId: string): Promise<string> {
  const run = await weeklyPushRepo.getRunById(runId);
  if (!run) throw new Error(`run ${runId} not found`);
  const recipients = await weeklyPushRepo.listRecipientsByRun(runId);
  const csv = renderCsv(run, recipients);
  const path = await writeReport(runId, csv, "csv");
  await weeklyPushRepo.updateRun(runId, { reportPath: path });
  return path;
}
