import type { Request } from "express";
import { randomBytes } from "crypto";

/**
 * Short-lived session tokens for the coach portal. Issued after a coach
 * successfully proves their LINE identity (LINE OAuth callback, or one of the
 * link/register endpoints that consume a `lineLoginTokens` entry). The token
 * is the only thing that lets a request fetch the full PII record via
 * `/api/coach-portal/me/:identifier`.
 *
 * Stored in-memory: acceptable because (1) the token has a 30-day TTL but is
 * also re-issued on every successful login, and (2) the worst case after a
 * server restart is the user has to re-login via LINE, which is the same UX
 * they already get when their browser sessionStorage is cleared.
 */
type CoachSession = {
  coachUserId: string;
  lineId: string;
  expiresAt: number;
};

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const sessions = new Map<string, CoachSession>();

function generateToken(): string {
  // 36 random bytes -> 48-char base64url token, CSPRNG-backed.
  return randomBytes(36).toString("base64url");
}

export function issueCoachSessionToken(
  coachUserId: string,
  lineId: string
): string {
  const token = generateToken();
  sessions.set(token, {
    coachUserId,
    lineId,
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

export function readCoachSessionToken(req: Request): string | null {
  const header = req.headers["x-coach-token"];
  if (typeof header === "string" && header.length > 0) return header;
  const query = req.query?.coachToken;
  if (typeof query === "string" && query.length > 0) return query;
  return null;
}

/**
 * Returns the session if the token is valid AND its bound coachUserId or
 * lineId matches the supplied identifier. Returns null otherwise.
 */
export function verifyCoachSessionFor(
  token: string | null,
  identifier: string
): CoachSession | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  if (session.coachUserId !== identifier && session.lineId !== identifier) {
    return null;
  }
  return session;
}

export function revokeCoachSessionToken(token: string): void {
  sessions.delete(token);
}
