import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";

/**
 * Narrow lookup helper — pulls a string field from a record-shaped value
 * without resorting to `any`. Returns undefined for any non-string value.
 */
function readStringField(
  source: unknown,
  field: string
): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  const value = (source as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Pulls the admin password from a request, looking at:
 *   - x-admin-password header
 *   - ?password= query parameter
 *   - body.password
 */
function extractPassword(req: Request): string | undefined {
  const headerVal = req.headers["x-admin-password"];
  if (typeof headerVal === "string" && headerVal.length > 0) return headerVal;

  const fromQuery = readStringField(req.query, "password");
  if (fromQuery) return fromQuery;

  const fromBody = readStringField(req.body, "password");
  if (fromBody) return fromBody;

  return undefined;
}

/**
 * Returns true when the request carries a valid admin password.
 * `env.adminPassword` is resolved eagerly at module load — production
 * boot fails if the env var is missing.
 */
export function verifyAdminPassword(req: Request): boolean {
  const provided = extractPassword(req);
  if (!provided) return false;
  return provided === env.adminPassword;
}

/**
 * Express middleware: rejects requests without a valid admin password.
 */
export function requireAdminPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!verifyAdminPassword(req)) {
    return res.status(401).json({ message: "需要管理員密碼" });
  }
  next();
}
