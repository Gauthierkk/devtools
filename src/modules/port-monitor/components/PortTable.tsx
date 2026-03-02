import { useState } from "react";
import { usePortMonitorStore } from "../store";
import { killProcess, fetchPorts } from "../commands";
import { getPortInfo, getCategoryColor } from "../port-info";
import Icon from "../../../components/ui/Icon";

export default function PortTable() {
  const { ports, error, setPorts } = usePortMonitorStore();
  const [killingPid, setKillingPid] = useState<number | null>(null);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (ports.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-[var(--text-tertiary)]">No listening ports found</p>
      </div>
    );
  }

  async function handleKill(pid: number) {
    setKillingPid(pid);
    try {
      await killProcess(pid);
      // Brief delay for the OS to release the port
      await new Promise((r) => setTimeout(r, 500));
      const updated = await fetchPorts();
      setPorts(updated);
    } catch {
      // next poll will update anyway
    } finally {
      setKillingPid(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--bg-surface)] border-b border-border-default">
          <tr className="text-xs text-[var(--text-tertiary)]">
            <th className="px-3 py-2 font-medium">Port</th>
            <th className="px-3 py-2 font-medium">Process</th>
            <th className="px-3 py-2 font-medium">PID</th>
            <th className="px-3 py-2 font-medium">Address</th>
            <th className="px-3 py-2 font-medium">Protocol</th>
            <th className="w-10 px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {ports.map((entry) => {
            const info = getPortInfo(entry.port);
            const isKilling = killingPid === entry.pid;

            return (
              <tr
                key={`${entry.pid}-${entry.port}`}
                className="group border-b border-[var(--border)] hover:bg-[var(--bg-surface-hover)] transition-colors duration-75"
              >
                <td className="px-3 py-1.5">
                  <span className="font-mono text-[var(--syntax-number)]">{entry.port}</span>
                  {info && (
                    <span
                      className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight"
                      style={{
                        color: getCategoryColor(info.category),
                        backgroundColor: `color-mix(in srgb, ${getCategoryColor(info.category)} 12%, transparent)`,
                      }}
                    >
                      {info.label}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-[var(--text-primary)]">
                  {entry.process}
                </td>
                <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)]">
                  {entry.pid}
                </td>
                <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)]">
                  {entry.address}
                </td>
                <td className="px-3 py-1.5 text-[var(--text-tertiary)]">
                  {entry.protocol}
                </td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => handleKill(entry.pid)}
                    disabled={isKilling}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-danger disabled:opacity-50"
                    title={`Kill process ${entry.pid}`}
                  >
                    <Icon name="x-circle" size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
