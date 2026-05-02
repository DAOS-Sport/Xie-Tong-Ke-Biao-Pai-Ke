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
import { enqueueRecipientJob } from "./weeklyPush.service";
import { sendTextMessage } from "../notification/lineNotify.adapter";
import { pushRunSummary } from "../notification/notification.service";
import type {
  WeeklyPushJobData,
  WeeklyPushRecipientJobData,
  WeeklyPushReportJobData,
} from "./types";

const ORCHESTRATOR_POLL_MS = 2_000;
const ORCHESTRATOR_MAX_WAIT_MS = 5 * 60 * 1_000; // 5 min ceiling

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

async function handleRecipientJob(
  jobs: PgBoss.Job<WeeklyPushRecipientJobData>[],
): Promise<void> {
  for (const job of jobs) {
    const { runId, recipientId } = job.data;
    const recipient = await weeklyPushRepo.getRecipientById(recipientId);
    if (!recipient) {
      console.warn(
        `[weeklyPush.worker] recipient ${recipientId} not found for run ${runId}`,
      );
      continue;
    }
    if (recipient.status !== "pending") {
      // Already processed — happens if pg-boss redelivers; idempotent skip.
      continue;
    }
    if (!recipient.lineUserId) {
      await weeklyPushRepo.updateRecipient(recipientId, {
        status: "failed",
        attemptCount: recipient.attemptCount + 1,
        errorCode: "no_line_id",
        errorMessage: "recipient has no LINE user id",
      });
      continue;
    }

    const payload = readRecipientPayload(recipient.payloadJson);
    if (!payload) {
      await weeklyPushRepo.updateRecipient(recipientId, {
        status: "failed",
        attemptCount: recipient.attemptCount + 1,
        errorCode: "missing_payload",
        errorMessage: "recipient payload is missing or malformed",
      });
      continue;
    }

    const result = await sendTextMessage(recipient.lineUserId, payload.message);
    if (result.ok) {
      await weeklyPushRepo.updateRecipient(recipientId, {
        status: "success",
        attemptCount: recipient.attemptCount + 1,
        sentAt: new Date(),
        errorCode: null,
        errorMessage: null,
      });
    } else {
      await weeklyPushRepo.updateRecipient(recipientId, {
        status: "failed",
        attemptCount: recipient.attemptCount + 1,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }
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
    { batchSize: 4 },
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
