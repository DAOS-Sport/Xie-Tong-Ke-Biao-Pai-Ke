import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { env } from "../config/env";

const LINE_AUTH_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";

export type LineLoginToken = {
  lineId: string;
  lineName: string;
  linePicture: string;
  expiresAt: number;
};

/**
 * In-memory store for short-lived LINE OAuth tokens.
 * Exported so the coach-portal module can consume + delete them after binding.
 */
export const lineLoginTokens = new Map<string, LineLoginToken>();

const lineOAuthStates = new Map<string, number>();

function getLineRedirectUri(_req: any) {
  return `${env.publicOrigin}/api/auth/line/callback`;
}

function generateToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function registerAuthRoutes(app: Express): void {
  // Replit Auth — current user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // === LINE Login OAuth 2.0 ===

  app.get("/api/auth/line", (req, res) => {
    const LINE_CLIENT_ID = env.lineChannelId;
    if (!LINE_CLIENT_ID) {
      return res.status(500).json({ message: "LINE Login 尚未設定" });
    }

    const state = generateToken();
    const nonce = generateToken();
    lineOAuthStates.set(state, Date.now() + 10 * 60 * 1000);

    const redirectUri = getLineRedirectUri(req);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: LINE_CLIENT_ID,
      redirect_uri: redirectUri,
      state,
      scope: "profile openid",
      nonce,
    });

    res.redirect(`${LINE_AUTH_URL}?${params.toString()}`);
  });

  app.get("/api/auth/line/callback", async (req, res) => {
    const { code, state, error: lineError } = req.query;

    if (lineError) {
      console.error("LINE Login error:", lineError);
      return res.redirect("/coach-portal?error=line_denied");
    }

    if (!code || !state) {
      return res.redirect("/coach-portal?error=no_code");
    }

    const stateExpiry = lineOAuthStates.get(state as string);
    if (!stateExpiry || Date.now() > stateExpiry) {
      lineOAuthStates.delete(state as string);
      return res.redirect("/coach-portal?error=invalid_state");
    }
    lineOAuthStates.delete(state as string);

    const LINE_CLIENT_ID = env.lineChannelId;
    const LINE_CLIENT_SECRET = env.lineChannelSecret;

    if (!LINE_CLIENT_ID || !LINE_CLIENT_SECRET) {
      return res.redirect("/coach-portal?error=line_not_configured");
    }

    try {
      const redirectUri = getLineRedirectUri(req);
      const tokenRes = await fetch(LINE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
          client_id: LINE_CLIENT_ID,
          client_secret: LINE_CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) {
        const errData = await tokenRes.text();
        console.error("LINE token exchange failed:", errData);
        return res.redirect("/coach-portal?error=token_failed");
      }

      const tokenData = (await tokenRes.json()) as { access_token: string };
      const profileRes = await fetch(LINE_PROFILE_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!profileRes.ok) {
        return res.redirect("/coach-portal?error=profile_failed");
      }

      const profile = (await profileRes.json()) as {
        userId: string;
        displayName: string;
        pictureUrl?: string;
      };

      const existingUser = await storage.getCoachUserByLineId(profile.userId);
      if (existingUser) {
        return res.redirect(
          `/coach-portal?lineLogin=existing&userId=${existingUser.id}`
        );
      }

      const token = generateToken();
      lineLoginTokens.set(token, {
        lineId: profile.userId,
        lineName: profile.displayName,
        linePicture: profile.pictureUrl || "",
        expiresAt: Date.now() + 15 * 60 * 1000,
      });

      return res.redirect(`/coach-portal?lineLogin=new&token=${token}`);
    } catch (error) {
      console.error("LINE Login callback error:", error);
      return res.redirect("/coach-portal?error=callback_failed");
    }
  });

  app.get("/api/auth/line/status", (_req, res) => {
    const configured = !!(env.lineChannelId && env.lineChannelSecret);
    res.json({ configured });
  });

  app.get("/api/auth/line/token-info/:token", (req, res) => {
    const { token } = req.params;
    const data = lineLoginTokens.get(token);
    if (!data || Date.now() > data.expiresAt) {
      lineLoginTokens.delete(token);
      return res.status(404).json({ message: "Token 已過期或不存在" });
    }
    res.json({ lineName: data.lineName, linePicture: data.linePicture });
  });
}
