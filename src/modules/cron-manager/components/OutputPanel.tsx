import { useEffect, useRef } from "react";
import { useCronManagerStore } from "../store";
import { getRunOutput } from "../commands";
import Icon from "../../../components/ui/Icon";

const POLL_MS = 400;

export default function OutputPanel() {
  const { runState, setRunState, updateRunOutput } = useCronManagerStore();
  const outputRef = useRef<HTMLPreElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll backend while job is running
  useEffect(() => {
    if (!runState || runState.done) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await getRunOutput(runState.runId);
        updateRunOutput(res.output, res.done, res.exitCode);
        if (res.done && intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      } catch {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, POLL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runState?.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom as output streams in
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [runState?.output]);

  if (!runState) return null;

  const isDone = runState.done;
  const exitOk = isDone && runState.exitCode === 0;
  const exitBad = isDone && runState.exitCode !== null && runState.exitCode !== 0;

  return (
    <div className="shrink-0 border-t border-border-default" style={{ height: 180 }}>
      {/* Panel header */}
      <div className="flex h-8 items-center gap-2 border-b border-[var(--border)] bg-bg-surface px-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            !isDone ? "animate-pulse bg-accent" : exitOk ? "bg-success" : "bg-danger"
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
          {runState.jobName}
        </span>
        {isDone && runState.exitCode !== null && (
          <span className={`shrink-0 font-mono text-[10px] ${exitOk ? "text-success" : "text-danger"}`}>
            exit {runState.exitCode}
          </span>
        )}
        <button
          onClick={() => setRunState(null)}
          className="shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-text-primary"
          title="Close"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {/* Terminal output */}
      <pre
        ref={outputRef}
        className="h-[148px] overflow-auto bg-[var(--bg-base)] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
        style={{ color: "var(--text-secondary)" }}
      >
        {runState.output || (
          <span style={{ color: "var(--text-tertiary)" }}>
            {isDone ? "(no output)" : "Running…"}
          </span>
        )}
        {exitBad && (
          <span style={{ color: "var(--danger)" }}>
            {"\n"}Process exited with code {runState.exitCode}
          </span>
        )}
      </pre>
    </div>
  );
}
