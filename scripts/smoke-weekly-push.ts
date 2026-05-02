/**
 * One-shot smoke test for the Task #23 weekly push pipeline.
 *
 *   npx tsx scripts/smoke-weekly-push.ts
 *
 * Boots pg-boss + workers in this process, enqueues a dry-run, waits
 * for completion, and prints the row counts + the CSV contents.
 * Exits non-zero on any acceptance violation so this can be wired
 * into a smoke step later.
 *
 * Set DRY_RUN=0 to attempt a wet run — only do this with real LINE
 * tokens and a populated coach roster you actually want to push to.
 */
import { startBoss, stopBoss, getBoss } from "../server/infra/queue/boss";
import { readReport } from "../server/infra/files/reportStorage";
import { queues } from "../server/infra/queue/queues";
import { startWeeklyPushWorkers } from "../server/modules/weeklyPush/weeklyPush.worker";
import {
  enqueueWeeklyPush,
  retryFailedRecipients,
} from "../server/modules/weeklyPush/weeklyPush.service";
import { weeklyPushRepo } from "../server/modules/weeklyPush/weeklyPush.repository";

async function waitForRun(runId: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = await weeklyPushRepo.getRunById(runId);
    if (run && (run.status === "success" || run.status === "failed" || run.status === "partial_failed")) {
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`run ${runId} did not finish within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  console.log("[smoke] booting pg-boss + workers");
  await startBoss();
  const boss = getBoss();
  await boss.createQueue(queues.weeklyPush);
  await boss.createQueue(queues.weeklyPushRecipient);
  await boss.createQueue(queues.weeklyPushReport);
  await startWeeklyPushWorkers();

  const dryRun = process.env.DRY_RUN !== "0";
  console.log(`[smoke] enqueue dryRun=${dryRun}`);
  const r1 = await enqueueWeeklyPush({ dryRun, triggerSource: "manual" });
  console.log(
    `[smoke] run=${r1.run.id} recipients=${r1.recipientsCreated} reused=${r1.reused}`,
  );

  await waitForRun(r1.run.id);
  const run = await weeklyPushRepo.getRunById(r1.run.id);
  const recipients = await weeklyPushRepo.listRecipientsByRun(r1.run.id);

  console.log("[smoke] final run state:");
  console.log(JSON.stringify(run, null, 2));
  console.log(
    `[smoke] recipient counts: total=${recipients.length} statuses=${JSON.stringify(
      recipients.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {}),
    )}`,
  );

  if (!run?.reportPath) {
    throw new Error("[smoke] FAIL — run.reportPath is not set");
  }
  const csv = (await readReport(run.reportPath)).toString("utf8");
  console.log(`[smoke] report (${run.reportPath}):`);
  console.log(csv.split("\n").slice(0, 6).join("\n"));

  // ── Acceptance assertions ──────────────────────────────────────
  if (dryRun) {
    if (run.status !== "success") {
      throw new Error(`[smoke] FAIL — dry-run status=${run.status}, expected success`);
    }
    if (recipients.some((r) => r.status !== "skipped")) {
      throw new Error("[smoke] FAIL — dry-run produced non-skipped recipient");
    }
  }

  // Idempotency check (only meaningful for wet runs).
  if (!dryRun) {
    const r2 = await enqueueWeeklyPush({
      weekStartDate: r1.run.weekStartDate,
      weekEndDate: r1.run.weekEndDate,
      triggerSource: "manual",
    });
    if (!r2.reused) {
      throw new Error("[smoke] FAIL — second wet enqueue was NOT deduped");
    }
    console.log("[smoke] OK — second enqueue reused runId=" + r2.run.id);
  }

  // retry-failed should reject when there are no failures.
  try {
    await retryFailedRecipients(r1.run.id);
    if (!recipients.some((r) => r.status === "failed")) {
      throw new Error("[smoke] FAIL — retry-failed accepted with no failures");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("no failed recipients")) throw err;
    console.log("[smoke] OK — retry-failed correctly rejected: " + msg);
  }

  console.log("[smoke] ALL CHECKS PASSED");
}

main()
  .then(() => stopBoss())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[smoke] error:", err);
    await stopBoss().catch(() => {});
    process.exit(1);
  });
