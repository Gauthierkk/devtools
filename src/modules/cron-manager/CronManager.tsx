import { useCallback, useEffect } from "react";
import { useCronManagerStore } from "./store";
import { fetchJobs } from "./commands";
import CronTable from "./components/CronTable";
import CronForm from "./components/CronForm";
import OutputPanel from "./components/OutputPanel";
import Icon from "../../components/ui/Icon";

export default function CronManager() {
  const { jobs, error, loading, isAdding, editingJob, setJobs, setError, setLoading, setIsAdding, reset } =
    useCronManagerStore();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchJobs();
      setJobs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [setJobs, setError, setLoading]);

  useEffect(() => {
    reset();
    refresh();
    return () => reset();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showForm = isAdding || editingJob !== null;
  const devtoolsCount = jobs.filter((j) => j.source === "devtools").length;
  const externalCount = jobs.filter((j) => j.source === "external").length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-default bg-bg-surface px-3">
        <span className="text-sm font-medium text-text-primary">Cron Jobs</span>
        <div className="flex-1" />
        {loading && (
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-spin text-[var(--text-tertiary)]"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        <span className="text-xs text-[var(--text-tertiary)]">
          {devtoolsCount} managed{externalCount > 0 ? ` · ${externalCount} external` : ""}
        </span>
        <button
          onClick={() => setIsAdding(true)}
          disabled={showForm}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-text-primary disabled:opacity-40"
          title="Add cron job"
        >
          <Icon name="plus" size={14} />
        </button>
        <button
          onClick={refresh}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-text-primary"
          title="Refresh"
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 border-b border-border-default px-3 py-2" style={{ backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {/* Job table */}
      <div className="min-h-0 flex-1 overflow-auto">
        <CronTable onRefresh={refresh} />
      </div>

      {/* Add/edit form (slides in from bottom) */}
      {showForm && <CronForm onSaved={refresh} />}

      {/* Run output panel */}
      <OutputPanel />
    </div>
  );
}
