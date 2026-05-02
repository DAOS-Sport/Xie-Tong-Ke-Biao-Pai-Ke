/**
 * LINE group destinations used by the weekly push summary (Task #23).
 *
 * `itGroupId` is the operations channel that always receives the run
 * summary so the team can see success/failure counts and grab the
 * report download URL.
 *
 * `xieTongGroupId` is the user-facing 協同課 channel; it only receives
 * the summary when explicitly enabled via env so we can verify the
 * pipeline against the IT group first without spamming staff.
 *
 * Both values may be `null` when their env vars are unset — callers
 * must skip the push (and log a warning) instead of crashing.
 */
export const lineGroups = {
  itGroupId: process.env.LINE_IT_GROUP_ID || null,
  xieTongGroupId: process.env.LINE_XIE_TONG_GROUP_ID || null,
} as const;

export type LineGroups = typeof lineGroups;
