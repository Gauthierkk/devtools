import { useEffect, useState } from "react";
import { useCronManagerStore } from "../store";
import { addJob, updateJob, validateExpression } from "../commands";

const PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 9 am", value: "0 9 * * *" },
  { label: "Weekly Mon 9 am", value: "0 9 * * 1" },
  { label: "Monthly 1st", value: "0 0 1 * *" },
];

interface Props {
  onSaved: () => Promise<void>;
}

export default function CronForm({ onSaved }: Props) {
  const { editingJob, setEditingJob, setIsAdding } = useCronManagerStore();

  const [name, setName] = useState(editingJob?.name ?? "");
  const [cronExpression, setCronExpression] = useState(editingJob?.cronExpression ?? "");
  const [command, setCommand] = useState(editingJob?.command ?? "");
  const [cronValid, setCronValid] = useState<boolean | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Debounced cron validation
  useEffect(() => {
    if (!cronExpression.trim()) {
      setCronValid(null);
      setCronError(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await validateExpression(cronExpression);
        setCronValid(res.valid);
        setCronError(res.error);
      } catch {
        setCronValid(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cronExpression]);

  function handleCancel() {
    editingJob ? setEditingJob(null) : setIsAdding(false);
  }

  async function handleSave() {
    if (!cronExpression.trim() || !command.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (editingJob) {
        await updateJob(editingJob.id, { name, cronExpression, command });
      } else {
        await addJob(name, cronExpression, command);
      }
      await onSaved();
      handleCancel();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const inputBase =
    "w-full rounded border bg-bg-surface px-2 py-1.5 text-xs text-text-primary placeholder-[var(--text-tertiary)] outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="shrink-0 border-t border-border-default bg-bg-surface px-3 py-3">
      {/* Form header */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          {editingJob ? "Edit Job" : "New Job"}
        </span>
        <button
          onClick={handleCancel}
          className="text-xs text-[var(--text-tertiary)] transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Name */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. daily-backup"
            className={`${inputBase} border-border-default`}
          />
        </div>

        {/* Schedule */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Schedule
            </label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setCronExpression(e.target.value);
              }}
              className="cursor-pointer bg-transparent text-[10px] text-[var(--text-tertiary)] outline-none hover:text-text-primary"
            >
              <option value="">presets ▾</option>
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <input
              type="text"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="* * * * *"
              spellCheck={false}
              className={`${inputBase} font-mono ${
                cronValid === false
                  ? "border-danger focus:ring-danger"
                  : cronValid === true
                    ? "border-success focus:ring-accent"
                    : "border-border-default"
              }`}
            />
            {cronValid === true && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-success">✓</span>
            )}
          </div>
          {cronError && <p className="mt-0.5 text-[10px] text-danger">{cronError}</p>}
        </div>
      </div>

      {/* Command */}
      <div className="mt-2">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Command
        </label>
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="/path/to/script.sh"
          rows={2}
          spellCheck={false}
          className={`${inputBase} resize-none font-mono border-border-default`}
        />
      </div>

      {saveError && <p className="mt-1.5 text-xs text-danger">{saveError}</p>}

      {/* Actions */}
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          onClick={handleCancel}
          className="rounded px-3 py-1.5 text-xs text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !cronExpression.trim() || !command.trim() || cronValid === false}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : editingJob ? "Update" : "Add Job"}
        </button>
      </div>
    </div>
  );
}
