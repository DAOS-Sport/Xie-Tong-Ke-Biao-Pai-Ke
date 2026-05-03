import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { verifyAdminPassword } from "./adminPassword";

/**
 * Teacher-portal endpoints (multi-school feedbacks) used to be wide-open.
 * They now require ONE of:
 *   - A valid admin password (so multi-school-admin keeps working).
 *   - The shared TEACHER_PORTAL_TOKEN, sent as `x-teacher-portal-token`
 *     header or `?token=` query param. Distributed in the URL teachers
 *     receive from administrators.
 *
 * Fail-closed in every environment: if neither credential is provided we
 * return 401/503. When TEACHER_PORTAL_TOKEN is unset we return 503 with a
 * loud message in BOTH dev and prod so the misconfig is impossible to miss
 * (admin password remains a valid override for local poking around).
 */
function readToken(req: Request): string | null {
  const header = req.headers["x-teacher-portal-token"];
  if (typeof header === "string" && header.length > 0) return header;
  const query = req.query?.token;
  if (typeof query === "string" && query.length > 0) return query;
  return null;
}

export function requireTeacherPortalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (verifyAdminPassword(req)) return next();

  const expected = env.teacherPortalToken;
  if (!expected) {
    return res.status(503).json({
      message:
        "Teacher portal token not configured. Set TEACHER_PORTAL_TOKEN env var.",
    });
  }

  const provided = readToken(req);
  if (provided && provided === expected) return next();
  return res.status(401).json({ message: "需要老師端權限" });
}
