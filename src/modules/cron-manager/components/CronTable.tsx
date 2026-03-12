import { useState } from "react";
import { useCronManagerStore, type CronJob } from "../store";
import { toggleJob, deleteJob, runNow } from "../commands";
import Icon from "../../../components/ui/Icon";

interface Props {
  onRefresh: () => Promise<void>;
}

export default function CronTable({ onRefresh }: Props) {
  const { jobs, error, setEditingJob, setRunState } = useCronManagerStore();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        <Icon name="clock" size={28} className="text-[var(--text-tertiary)] opacity-30" />
        <p className="text-sm text-[var(--text-tertiary)]">No cron jobs found</p>
        <p className="text-xs text-[var(--text-tertiary)] opacity-60">Click + to add a job</p>
      </div>
    );
  }

  async function handleToggle(job: CronJob) {
    setTogglingId(job.id);
    try {
      await toggleJob(job.id, !job.isEnabled);
      await onRefresh();
    } catch {
      /* next refresh corrects state */
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(job: CronJob) {
    setDeletingId(job.id);
    try {
      await deleteJob(job.id);
      await onRefresh();
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRunNow(job: CronJob) {
    try {
      const runId = await runNow(job.id);
      setRunState({
        jobId: job.id,
        jobName: job.name || job.command.split(/\s+/)[0],
        jobCommand: job.command,
        runId,
        output: "",
        done: false,
        exitCode: null,
      });
    } catch {
      /* ignore */
    }
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-10 border-b border-border-default bg-bg-surface">
        <tr className="text-xs text-[var(--text-tertiary)]">
          <th className="w-10 px-3 py-2 font-medium" />
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 font-medium">Schedule</th>
          <th className="px-3 py-2 font-medium">Command</th>
          <th className="w-20 px-3 py-2 font-medium" />
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => {
          const isExternal = job.source === "external";
          const isToggling = togglingId === job.id;
          const isDeleting = deletingId === job.id;

          return (
            <tr
              key={job.id}
              className={`group border-b border-[var(--border)] transition-colors duration-75 ${
                isExternal ? "opacity-55" : "hover:bg-[var(--bg-surface-hover)]"
              }`}
            >
              {/* Enable toggle / external badge */}
              <td className="px-3 py-2">
                {isExternal ? (
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight"
                    style={{
                      color: "var(--text-tertiary)",
                      backgroundColor: "color-mix(in srgb, var(--text-tertiary) 14%, transparent)",
                    }}
                  >
                    ext
                  </span>
                ) : (
                  <button
                    onClick={() => handleToggle(job)}
                    disabled={isToggling}
                    title={job.isEnabled ? "Disable" : "Enable"}
                    className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: job.isEnabled
                        ? "var(--accent)"
                        : "color-mix(in srgb, var(--text-tertiary) 30%, transparent)",
                    }}
                  >
                    <span
                      className="pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                      style={{ transform: job.isEnabled ? "translateX(14px)" : "translateX(2px)" }}
                    />
                  </button>
                )}
              </td>

              {/* Name */}
              <td className="max-w-[130px] px-3 py-2">
                <span className="block truncate text-text-primary">
                  {job.name || <span className="italic text-[var(--text-tertiary)]">unnamed</span>}
                </span>
              </td>

              {/* Schedule */}
              <td className="whitespace-nowrap px-3 py-2">
                <code className="font-mono text-xs text-[var(--syntax-string)]">{job.cronExpression}</code>
              </td>

              {/* Command */}
              <td className="max-w-[260px] px-3 py-2">
                <span className="block truncate font-mono text-xs text-[var(--text-secondary)]">
                  {job.command}
                </span>
              </td>

              {/* Actions */}
              <td className="px-3 py-2">
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => handleRunNow(job)}
                    className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-tertiary)] opacity-0 transition-all hover:text-success group-hover:opacity-100 focus:opacity-100"
                    title="Run now"
                  >
                    <Icon name="play" size={11} />
                  </button>
                  {!isExternal && (
                    <>
                      <button
                        onClick={() => setEditingJob(job)}
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-tertiary)] opacity-0 transition-all hover:text-text-primary group-hover:opacity-100 focus:opacity-100"
                        title="Edit"
                      >
                        <Icon name="pencil" size={11} />
                      </button>
                      <button
                        onClick={() => handleDelete(job)}
                        disabled={isDeleting}
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-tertiary)] opacity-0 transition-all hover:text-danger group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                        title="Delete"
                      >
                        <Icon name="trash-2" size={11} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
