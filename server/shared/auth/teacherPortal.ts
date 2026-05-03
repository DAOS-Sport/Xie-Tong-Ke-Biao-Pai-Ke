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
 * Dev convenience: if TEACHER_PORTAL_TOKEN is unset AND we are NOT in a
 * deployment, we allow the request through with a one-time warn so local
 * development doesn't get locked out. In production deployments without the
 * env var the endpoint hard-fails so the misconfig is loud.
 */
let warnedOnce = false;

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
  const provided = readToken(req);

  if (expected) {
    if (provided && provided === expected) return next();
    return res.status(401).json({ message: "需要老師端權限" });
  }

  // No token configured.
  if (env.isDeployment) {
    return res.status(503).json({
      message:
        "Teacher portal token not configured. Set TEACHER_PORTAL_TOKEN env var.",
    });
  }

  if (!warnedOnce) {
    console.warn(
      "[teacher-portal] TEACHER_PORTAL_TOKEN not set; allowing requests in dev"
    );
    warnedOnce = true;
  }
  return next();
}
