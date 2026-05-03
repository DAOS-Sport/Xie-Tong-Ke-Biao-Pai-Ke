import type { Request } from "express";
import { randomBytes } from "crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { coachPortalSessions } from "../../../shared/schema";

/**
 * DB-backed session tokens for the coach portal. Issued after a coach
 * successfully proves their LINE identity. Persisted to `coach_portal_sessions`
 * so tokens survive server restarts — coaches stay logged in for 30 days.
 */

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(): string {
  // 36 random bytes → 48-char base64url token, CSPRNG-backed.
  return randomBytes(36).toString("base64url");
}

export async function issueCoachSessionToken(
  coachUserId: string,
  lineId: string
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(coachPortalSessions).values({ token, coachUserId, lineId, expiresAt });
  // Prune expired sessions for this coach (best-effort housekeeping)
  db.delete(coachPortalSessions)
    .where(and(
      eq(coachPortalSessions.coachUserId, coachUserId),
      lt(coachPortalSessions.expiresAt, new Date()),
    ))
    .catch(() => {});
  return token;
}

export function readCoachSessionToken(req: Request): string | null {
  const header = req.headers["x-coach-token"];
  if (typeof header === "string" && header.length > 0) return header;
  const query = req.query?.coachToken;
  if (typeof query === "string" && query.length > 0) return query;
  return null;
}

type CoachSessionData = { coachUserId: string; lineId: string };

async function lookupSession(token: string | null): Promise<CoachSessionData | null> {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(coachPortalSessions)
    .where(eq(coachPortalSessions.token, token));
  if (!row) return null;
  if (Date.now() > row.expiresAt.getTime()) {
    await db.delete(coachPortalSessions).where(eq(coachPortalSessions.token, token));
    return null;
  }
  return { coachUserId: row.coachUserId, lineId: row.lineId };
}

/**
 * Returns the session if the token is valid AND its bound coachUserId or
 * lineId matches the supplied identifier. Returns null otherwise.
 */
export async function verifyCoachSessionFor(
  token: string | null,
  identifier: string
): Promise<CoachSessionData | null> {
  const session = await lookupSession(token);
  if (!session) return null;
  if (session.coachUserId !== identifier && session.lineId !== identifier) return null;
  return session;
}

/**
 * Resolves the session from the request without requiring a specific identifier.
 * Used by write endpoints to verify the caller owns the resource they're modifying.
 */
export async function resolveCoachToken(req: Request): Promise<CoachSessionData | null> {
  return lookupSession(readCoachSessionToken(req));
}

export async function revokeCoachSessionToken(token: string): Promise<void> {
  await db.delete(coachPortalSessions).where(eq(coachPortalSessions.token, token));
}
