/**
 * Local report storage for the weekly push pipeline (Task #23).
 *
 * Reports are written to `/tmp/weekly-push-reports/{runId}.{ext}` so
 * they survive the lifetime of the process but are NOT promoted to
 * permanent storage. The task spec explicitly defers long-term retention
 * (R2 / Replit Object Storage) to a future iteration; the admin
 * download endpoint serves whatever the local FS still has.
 */
import { promises as fs } from "fs";
import path from "path";

const REPORT_DIR = "/tmp/weekly-push-reports";

async function ensureDir(): Promise<void> {
  await fs.mkdir(REPORT_DIR, { recursive: true });
}

export function reportPathFor(runId: string, ext: "csv" | "xlsx" = "csv"): string {
  // runId is a UUID from gen_random_uuid(); strip any path traversal anyway.
  const safe = runId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(REPORT_DIR, `${safe}.${ext}`);
}

export async function writeReport(
  runId: string,
  contents: string | Buffer,
  ext: "csv" | "xlsx" = "csv",
): Promise<string> {
  await ensureDir();
  const filePath = reportPathFor(runId, ext);
  await fs.writeFile(filePath, contents);
  return filePath;
}

export async function readReport(filePath: string): Promise<Buffer> {
  // Sanity check — never let a caller hand us a path outside the report dir.
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(REPORT_DIR))) {
    throw new Error("[reportStorage] refusing to read path outside report dir");
  }
  return fs.readFile(resolved);
}

export async function reportExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
