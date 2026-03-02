import { usePortMonitorStore } from "../store";

export default function PortTable() {
  const { ports, error } = usePortMonitorStore();

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
          </tr>
        </thead>
        <tbody>
          {ports.map((entry) => (
            <tr
              key={`${entry.pid}-${entry.port}`}
              className="border-b border-[var(--border)] hover:bg-[var(--bg-surface-hover)] transition-colors duration-75"
            >
              <td className="px-3 py-1.5 font-mono text-[var(--syntax-number)]">
                {entry.port}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
