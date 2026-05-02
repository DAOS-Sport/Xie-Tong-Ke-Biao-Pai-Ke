import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";

/**
 * Pulls the admin password from a request, looking at:
 *   - x-admin-password header
 *   - ?password= query parameter
 *   - body.password
 */
function extractPassword(req: Request): string | undefined {
  const headerVal = req.headers["x-admin-password"];
  if (typeof headerVal === "string" && headerVal.length > 0) return headerVal;
  const queryVal = (req.query as any)?.password;
  if (typeof queryVal === "string" && queryVal.length > 0) return queryVal;
  const bodyVal = (req.body as any)?.password;
  if (typeof bodyVal === "string" && bodyVal.length > 0) return bodyVal;
  return undefined;
}

/**
 * Returns true when the request carries a valid admin password.
 * Throws at startup (via env.adminPassword getter) if the env var is
 * missing in production.
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
