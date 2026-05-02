/**
 * pg-boss worker handlers for the weekly push pipeline (Task #23).
 *
 * Three handlers are registered against the queues from
 * `infra/queue/queues`:
 *
 *   - weekly-push          : orchestrator. Pings Healthchecks /start,
 *                            marks the run running, fans out per-recipient
 *                            jobs (or short-circuits for dry-run), polls
 *                            until all recipients are non-pending,
 *                            generates the CSV report, pushes the
 *                            summary to LINE groups, and pings
 *                            Healthchecks success/fail.
 *
 *   - weekly-push-recipient: sends the LINE message for a single
 *                            recipient and updates that row's status.
 *                            Errors are caught and recorded — we do
 *                            NOT use pg-boss native retry; failed
 *                            recipients are re-driven by the manual
 *                            "retry-failed" admin endpoint instead.
 *
 *   - weekly-push-report   : generates / re-generates the CSV report
 *                            for an existing run on demand.
 */
import type PgBoss from "pg-boss";
import { startBoss, getBoss } from "../../infra/queue/boss";
import { queues } from "../../infra/queue/queues";
import {
  pingFail,
  pingStart,
  pingSuccess,
} from "../../infra/healthchecks/healthchecks.client";
import { weeklyPushRepo } from "./weeklyPush.repository";
import { generateAndStoreReport } from "./weeklyPush.report";
import {
  enqueueRecipientJob,
  RECIPIENT_RETRY_LIMIT,
  RECIPIENT_RETRY_DELAY_SECONDS,
} from "./weeklyPush.service";
import { sendTextMessage } from "../notification/lineNotify.adapter";
import { pushRunSummary } from "../notification/notification.service";
import type {
  WeeklyPushJobData,
  WeeklyPushRecipientJobData,
  WeeklyPushReportJobData,
} from "./types";

const ORCHESTRATOR_POLL_MS = 2_000;
// Worst-case for one recipient with retries 3 + delay 60 + backoff:
// 60 + 120 + 240 = 420s. Add slack so the orchestrator outlasts even
// the slowest recipient's full retry budget.
const ORCHESTRATOR_MAX_WAIT_MS =
  (RECIPIENT_RETRY_DELAY_SECONDS *
    (Math.pow(2, RECIPIENT_RETRY_LIMIT) - 1) +
    120) *
  1_000;

let workersRegistered = false;

interface RecipientPayload {
  message: string;
  scheduleCount: number;
}

function readRecipientPayload(value: unknown): RecipientPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.message !== "string") return null;
  return {
    message: v.message,
    scheduleCount: typeof v.scheduleCount === "number" ? v.scheduleCount : 0,
  };
}

async function waitForRecipientsToFinish(runId: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ORCHESTRATOR_MAX_WAIT_MS) {
    const counts = await weeklyPushRepo.countRecipientStatuses(runId);
    if (counts.pending === 0) return;
    await new Promise((r) => setTimeout(r, ORCHESTRATOR_POLL_MS));
  }
  console.warn(
    `[weeklyPush.worker] orchestrator timeout — pending recipients remain for run ${runId}`,
  );
}

async function handleWeeklyPushJob(
  jobs: PgBoss.Job<WeeklyPushJobData>[],
): Promise<void> {
  for (const job of jobs) {
    const { runId } = job.data;
    console.log(`[weeklyPush.worker] start orchestrator runId=${runId}`);
    await pingStart();

    const run = await weeklyPushRepo.getRunById(runId);
    if (!run) {
      console.error(`[weeklyPush.worker] run ${runId} not found`);
      await pingFail(`run ${runId} not found`);
      continue;
    }

    try {
      await weeklyPushRepo.updateRun(runId, {
        status: "running",
        startedAt: new Date(),
      });

      const recipients = await weeklyPushRepo.listRecipientsByRun(runId);

      if (run.dryRun) {
        // Dry-run: recipients were inserted as "skipped" by the
        // service, so there's nothing to send. Just produce the report
        // and push the summary so we exercise the full pipeline.
        console.log(
          `[weeklyPush.worker] DRY-RUN runId=${runId} skipping ${recipients.length} recipients`,
        );
      } else {
        // Wet-run: fan out one job per pending recipient.
        const pending = recipients.filter((r) => r.status === "pending");
        for (const r of pending) {
          await enqueueRecipientJob(runId, r.id);
        }
        await waitForRecipientsToFinish(runId);
      }

      const counts = await weeklyPushRepo.countRecipientStatuses(runId);
      const finalStatus =
        counts.failed === 0
          ? "success"
          : counts.success === 0 && counts.skipped === 0
            ? "failed"
            : "partial_failed";

      await weeklyPushRepo.updateRun(runId, {
        status: finalStatus,
        successCount: counts.success,
        failureCount: counts.failed,
        skippedCount: counts.skipped,
        totalCount: counts.total,
        completedAt: new Date(),
      });

      const reportPath = await generateAndStoreReport(runId);
      console.log(`[weeklyPush.worker] report ready at ${reportPath}`);

      const updated = await weeklyPushRepo.getRunById(runId);
      const allRecipients = await weeklyPushRepo.listRecipientsByRun(runId);
      if (updated) {
        await pushRunSummary({ run: updated, recipients: allRecipients });
      }

      if (finalStatus === "failed") {
        await pingFail(
          `runId=${runId} failure=${counts.failed}/${counts.total}`,
        );
      } else {
        await pingSuccess(
          `runId=${runId} success=${counts.success} fail=${counts.failed} skip=${counts.skipped}`,
        );
      }
    } catch (err) {
      console.error(
        `[weeklyPush.worker] orchestrator error runId=${runId}:`,
        err,
      );
      await weeklyPushRepo.updateRun(runId, {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      await pingFail(err);
    }
  }
}

/**
 * Recipient handler — `includeMetadata: true` so we can read
 * `job.retrycount` and decide whether to re-throw (let pg-boss
 * retry per its `retryLimit/retryDelay/retryBackoff` policy) or
 * mark the recipient as final-failed.
 *
 * Status semantics during retries:
 *   - success                → status='success', attemptCount=N+1
 *   - failure, retries left  → status='pending' (pg-boss will redrive),
 *                               attemptCount/errorCode updated, THROW
 *   - failure, final attempt → status='failed', no throw
 *   - hard input error (no LINE id / bad payload) → status='failed' immediately,
 *     no throw — these would never succeed on retry
 *
 * pg-boss exposes the metadata field as `retryCount` (camelCase) on
 * the TS surface even though the underlying column is `retrycount`.
 */
async function handleRecipientJob(
  jobs: PgBoss.JobWithMetadata<WeeklyPushRecipientJobData>[],
): Promise<void> {
  for (const job of jobs) {
    const { runId, recipientId } = job.data;
    const attemptNumber = (job.retryCount ?? 0) + 1;
    const isFinalAttempt = (job.retryCount ?? 0) >= RECIPIENT_RETRY_LIMIT;

    const recipient = await weeklyPushRepo.getRecipientById(recipientId);
    if (!recipient) {
      console.warn(
        `[weeklyPush.worker] recipient ${recipientId} not found for run ${runId}`,
      );
      continue;
    }
    // Only `pending` (incl. mid-retry) is actionable. Anything else means
    // a previous attempt already settled the row — idempotent skip so a
    // pg-boss redelivery doesn't double-send a successful message.
    if (recipient.status !== "pending") {
      continue;
    }

    // Hard input errors — never retried, no throw.
    if (!recipient.lineUserId) {
      await weeklyPushRepo.updateRecipient(recipientId, {
        status: "failed",
        attemptCount: attemptNumber,
        errorCode: "no_line_id",
        errorMessage: "recipient has no LINE user id",
      });
      continue;
    }
    const payload = readRecipientPayload(recipient.payloadJson);
    if (!payload) {
      await weeklyPushRepo.updateRecipient(recipientId, {
        status: "failed",
        attemptCount: attemptNumber,
        errorCode: "missing_payload",
        errorMessage: "recipient payload is missing or malformed",
      });
      continue;
    }

    const result = await sendTextMessage(recipient.lineUserId, payload.message);

    if (result.ok) {
      await weeklyPushRepo.updateRecipient(recipientId, {
        status: "success",
        attemptCount: attemptNumber,
        sentAt: new Date(),
        errorCode: null,
        errorMessage: null,
      });
      continue;
    }

    if (isFinalAttempt) {
      await weeklyPushRepo.updateRecipient(recipientId, {
        status: "failed",
        attemptCount: attemptNumber,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      // Don't throw — accept the failure as final so pg-boss marks the job complete.
      continue;
    }

    // Transient failure — keep status='pending', persist the latest error
    // for visibility, and THROW so pg-boss applies its retry policy.
    await weeklyPushRepo.updateRecipient(recipientId, {
      status: "pending",
      attemptCount: attemptNumber,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });
    throw new Error(
      `recipient ${recipientId} send failed (attempt ${attemptNumber}/${
        RECIPIENT_RETRY_LIMIT + 1
      }): ${result.errorCode ?? "unknown"} ${result.errorMessage ?? ""}`,
    );
  }
}

async function handleReportJob(
  jobs: PgBoss.Job<WeeklyPushReportJobData>[],
): Promise<void> {
  for (const job of jobs) {
    const { runId } = job.data;
    try {
      await generateAndStoreReport(runId);
    } catch (err) {
      console.error(
        `[weeklyPush.worker] report-job error runId=${runId}:`,
        err,
      );
    }
  }
}

/**
 * Boots pg-boss (idempotently), creates the three queues, and binds
 * the worker handlers. Safe to call multiple times — the second call
 * is a no-op.
 */
export async function startWeeklyPushWorkers(): Promise<void> {
  if (workersRegistered) return;
  await startBoss();
  const boss = getBoss();

  // pg-boss v10 requires the queue to exist before send/work.
  await boss.createQueue(queues.weeklyPush);
  await boss.createQueue(queues.weeklyPushRecipient);
  await boss.createQueue(queues.weeklyPushReport);

  await boss.work<WeeklyPushJobData>(
    queues.weeklyPush,
    { batchSize: 1 },
    handleWeeklyPushJob,
  );
  await boss.work<WeeklyPushRecipientJobData>(
    queues.weeklyPushRecipient,
    { batchSize: 4, includeMetadata: true },
    handleRecipientJob,
  );
  await boss.work<WeeklyPushReportJobData>(
    queues.weeklyPushReport,
    { batchSize: 1 },
    handleReportJob,
  );

  workersRegistered = true;
  console.log("[weeklyPush.worker] handlers registered");
}
