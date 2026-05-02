/**
 * Feature flags — central place to toggle optional modules.
 *
 * All flags default to ON so existing deployments behave identically;
 * each can be disabled by setting the matching env var to "0", "false",
 * or "off".
 */

const isOff = (raw: string | undefined): boolean => {
  if (raw === undefined) return false;
  const v = raw.toLowerCase().trim();
  return v === "0" || v === "false" || v === "off" || v === "no";
};

const isOn = (raw: string | undefined): boolean => {
  if (raw === undefined) return false;
  const v = raw.toLowerCase().trim();
  return v === "1" || v === "true" || v === "on" || v === "yes";
};

const flag = (key: string): boolean => !isOff(process.env[key]);

/**
 * Opt-in flag (defaults OFF). Used for the new pg-boss weekly push pipeline
 * which must NOT take over from the legacy node-cron path until explicitly
 * enabled per environment.
 */
const optInFlag = (key: string): boolean => isOn(process.env[key]);

export const featureFlags = {
  enableSchoolModule: flag("ENABLE_SCHOOL_MODULE"),
  enableLineNotify: flag("ENABLE_LINE_NOTIFY"),
  enableRagicSync: flag("ENABLE_RAGIC_SYNC"),
  // Task #23 — weekly push queue. Both default OFF.
  enableWeeklyPushQueue: optInFlag("ENABLE_WEEKLY_PUSH_QUEUE"),
  enableWeeklyPushWorker: optInFlag("ENABLE_WEEKLY_PUSH_WORKER"),
} as const;

export type FeatureFlags = typeof featureFlags;
