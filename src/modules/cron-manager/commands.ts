import { rpcCall } from "../../lib/rpc";
import type { CronJob } from "./store";

function wrapError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("invoke")) return new Error("Requires Tauri — run with 'npx tauri dev'");
  return new Error(msg);
}

export async function fetchJobs(): Promise<CronJob[]> {
  try {
    const res = await rpcCall<{ jobs: CronJob[] }>("cron_manager.get_jobs");
    return res.jobs;
  } catch (err) {
    throw wrapError(err);
  }
}

export async function addJob(name: string, cronExpression: string, command: string): Promise<CronJob> {
  try {
    const res = await rpcCall<{ job: CronJob }>("cron_manager.add_job", { name, cronExpression, command });
    return res.job;
  } catch (err) {
    throw wrapError(err);
  }
}

export async function updateJob(
  id: string,
  patch: { name?: string; cronExpression?: string; command?: string },
): Promise<CronJob> {
  try {
    const res = await rpcCall<{ job: CronJob }>("cron_manager.update_job", { id, ...patch });
    return res.job;
  } catch (err) {
    throw wrapError(err);
  }
}

export async function deleteJob(id: string): Promise<void> {
  try {
    await rpcCall<{ ok: boolean }>("cron_manager.delete_job", { id });
  } catch (err) {
    throw wrapError(err);
  }
}

export async function toggleJob(id: string, enabled: boolean): Promise<void> {
  try {
    await rpcCall<{ ok: boolean }>("cron_manager.toggle_job", { id, enabled });
  } catch (err) {
    throw wrapError(err);
  }
}

export async function runNow(id: string): Promise<string> {
  try {
    const res = await rpcCall<{ run_id: string }>("cron_manager.run_now", { id });
    return res.run_id;
  } catch (err) {
    throw wrapError(err);
  }
}

export async function getRunOutput(
  runId: string,
): Promise<{ output: string; done: boolean; exitCode: number | null }> {
  try {
    const res = await rpcCall<{ output: string; done: boolean; exit_code: number | null }>(
      "cron_manager.get_run_output",
      { run_id: runId },
    );
    return { output: res.output, done: res.done, exitCode: res.exit_code };
  } catch (err) {
    throw wrapError(err);
  }
}

export async function validateExpression(
  expression: string,
): Promise<{ valid: boolean; error: string | null }> {
  try {
    return await rpcCall<{ valid: boolean; error: string | null }>(
      "cron_manager.validate_expression",
      { expression },
    );
  } catch (err) {
    throw wrapError(err);
  }
}
