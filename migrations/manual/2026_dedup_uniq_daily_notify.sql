-- =============================================================
-- Production-safe dedup + unique-index creation for
--   line_notify_logs (coach_name, notify_type, schedule_date)
--
-- Problem:
--   CREATE UNIQUE INDEX uniq_daily_notify ON line_notify_logs (...)
--   failed because production already contains duplicate rows.
--
-- Strategy:
--   1. Run everything in a single transaction.
--   2. Snapshot the rows we are about to delete into an audit table.
--   3. For each duplicate group, KEEP the row with MIN(id) and
--      DELETE the rest.
--   4. Sanity-check that no duplicates remain (RAISE EXCEPTION
--      otherwise so the whole transaction rolls back).
--   5. Create the unique index with IF NOT EXISTS.
--
-- Guarantees:
--   - No DROP TABLE, no TRUNCATE, no destructive ALTER.
--   - Idempotent: re-running is a no-op once data is clean.
--   - Auditable: deleted rows are preserved in
--     line_notify_logs_dedup_backup.
-- =============================================================

BEGIN;

-- ── 1. Audit backup table (created only if missing).
--      Stores every row removed by any run of this script,
--      together with the timestamp + reason of the cleanup.
CREATE TABLE IF NOT EXISTS line_notify_logs_dedup_backup (
    id            varchar      NOT NULL,
    coach_name    varchar      NOT NULL,
    line_id       varchar,
    sent_at       timestamp    NOT NULL,
    content       text         NOT NULL,
    notify_type   varchar      NOT NULL,
    schedule_date date         NOT NULL,
    backup_at     timestamptz  NOT NULL DEFAULT now(),
    backup_reason text         NOT NULL DEFAULT 'uniq_daily_notify dedup'
);

-- ── 2. Copy the about-to-be-deleted duplicates into the audit table.
INSERT INTO line_notify_logs_dedup_backup
    (id, coach_name, line_id, sent_at, content, notify_type, schedule_date)
SELECT l.id, l.coach_name, l.line_id, l.sent_at,
       l.content, l.notify_type, l.schedule_date
FROM line_notify_logs l
JOIN (
    SELECT coach_name, notify_type, schedule_date, MIN(id) AS keep_id
    FROM line_notify_logs
    GROUP BY coach_name, notify_type, schedule_date
    HAVING COUNT(*) > 1
) dups
  ON dups.coach_name    = l.coach_name
 AND dups.notify_type   = l.notify_type
 AND dups.schedule_date = l.schedule_date
 AND l.id <> dups.keep_id;

-- ── 3. Delete the duplicate rows, keeping the survivor (MIN(id)).
WITH dups AS (
    SELECT coach_name, notify_type, schedule_date, MIN(id) AS keep_id
    FROM line_notify_logs
    GROUP BY coach_name, notify_type, schedule_date
    HAVING COUNT(*) > 1
)
DELETE FROM line_notify_logs l
USING dups
WHERE l.coach_name    = dups.coach_name
  AND l.notify_type   = dups.notify_type
  AND l.schedule_date = dups.schedule_date
  AND l.id           <> dups.keep_id;

-- ── 4. Sanity check: zero duplicates must remain. If any do, abort.
DO $$
DECLARE
    remaining int;
BEGIN
    SELECT COUNT(*) INTO remaining
    FROM (
        SELECT 1
        FROM line_notify_logs
        GROUP BY coach_name, notify_type, schedule_date
        HAVING COUNT(*) > 1
    ) x;

    IF remaining > 0 THEN
        RAISE EXCEPTION
            'Dedup failed: % duplicate group(s) still present in line_notify_logs',
            remaining;
    END IF;
END $$;

-- ── 5. Create the unique index. IF NOT EXISTS makes this idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_notify
    ON line_notify_logs (coach_name, notify_type, schedule_date);

COMMIT;

-- =============================================================
-- Execution:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -f migrations/manual/2026_dedup_uniq_daily_notify.sql
--
-- Verification (optional, run after script succeeds):
--   SELECT coach_name, notify_type, schedule_date, COUNT(*)
--   FROM line_notify_logs
--   GROUP BY 1,2,3
--   HAVING COUNT(*) > 1;     -- should return 0 rows
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'line_notify_logs'
--     AND indexname = 'uniq_daily_notify';   -- should return 1 row
-- =============================================================
