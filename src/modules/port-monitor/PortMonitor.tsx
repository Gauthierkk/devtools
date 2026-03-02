import { useEffect, useRef, useCallback } from "react";
import { usePortMonitorStore } from "./store";
import { fetchPorts } from "./commands";
import PortTable from "./components/PortTable";

const POLL_INTERVAL = 2000;

export default function PortMonitor() {
  const { ports, setPorts, setError } = usePortMonitorStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchPorts();
      setPorts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setPorts, setError]);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center gap-3 border-b border-border-default bg-bg-surface px-3">
        <span className="text-sm font-medium text-text-primary">Listening Ports</span>
        <div className="flex-1" />
        <span className="text-xs text-[var(--text-tertiary)]">
          {ports.length} {ports.length === 1 ? "port" : "ports"}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" title="Auto-refreshing" />
      </div>
      <PortTable />
    </div>
  );
}
