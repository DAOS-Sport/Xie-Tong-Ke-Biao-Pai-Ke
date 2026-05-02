/**
 * Thin adapter around the LINE Push API used by the weekly-push
 * worker (Task #23).
 *
 * The legacy `server/line-notify.ts` already owns the cron-triggered
 * push code and an internal `sendLinePushMessage` helper. We do NOT
 * want to rewrite or expose that file's internals, so this adapter
 * re-implements the same minimal POST so the worker has its own
 * boundary for testing and error mapping.
 */
import { env } from "../../config/env";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export interface LinePushResult {
  ok: boolean;
  status: number; // HTTP status, or 0 on transport error
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Sends a single text push message to a LINE user/group ID.
 * Never throws — callers branch on `ok` so the worker can record
 * structured failure info on the recipient row.
 */
export async function sendTextMessage(
  to: string,
  text: string,
): Promise<LinePushResult> {
  const token = env.lineChannelAccessToken;
  if (!token) {
    return {
      ok: false,
      status: 0,
      errorCode: "no_token",
      errorMessage: "LINE_CHANNEL_ACCESS_TOKEN is not set",
    };
  }

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text }],
      }),
    });
    if (res.ok) return { ok: true, status: res.status, errorCode: null, errorMessage: null };
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      errorCode: `http_${res.status}`,
      errorMessage: body.slice(0, 500),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorCode: "transport_error",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
