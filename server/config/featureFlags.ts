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

const flag = (key: string): boolean => !isOff(process.env[key]);

export const featureFlags = {
  enableSchoolModule: flag("ENABLE_SCHOOL_MODULE"),
  enableLineNotify: flag("ENABLE_LINE_NOTIFY"),
  enableRagicSync: flag("ENABLE_RAGIC_SYNC"),
} as const;

export type FeatureFlags = typeof featureFlags;
