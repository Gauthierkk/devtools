import { useEffect, useRef, useCallback } from "react";
import { useNetworkStatsStore } from "./store";
import { fetchSnapshot } from "./commands";
import type { NetworkSnapshot, InterfaceInfo } from "./commands";
import AreaChart from "./components/AreaChart";

const POLL_MS = 500;
const COLOR_RECV = "hsl(200, 80%, 55%)"; // blue
const COLOR_SENT = "hsl(30, 90%, 55%)"; // orange

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}

function formatNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

// Status colors for connection states
const STATUS_COLORS: Record<string, string> = {
  ESTABLISHED: "bg-success",
  LISTEN: "bg-accent",
  TIME_WAIT: "bg-warning",
  CLOSE_WAIT: "bg-warning",
  NONE: "bg-[var(--text-tertiary)]",
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function NetworkingStats() {
  const { snapshots, rates, error, pushSnapshot, setError } =
    useNetworkStatsStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const snap = await fetchSnapshot();
      pushSnapshot(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [pushSnapshot, setError]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const latest: NetworkSnapshot | null =
    snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[42px] shrink-0 items-center border-b border-border-default px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Network Stats
        </span>
        <div className="flex-1" />
        {latest && (
          <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
            Live
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          </span>
        )}
      </div>

      {/* Error state */}
      {error && !latest && (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="text-center">
            <p className="text-sm text-danger">{error}</p>
            <p className="mt-1 text-xs text-text-tertiary">
              Requires Tauri — run with 'npx tauri dev'
            </p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!latest && !error && (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-text-tertiary animate-pulse">
            Connecting...
          </span>
        </div>
      )}

      {/* Dashboard */}
      {latest && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {/* Bandwidth chart */}
            <AreaChart
              data={rates.map((r) => r.bytesRecvPerSec)}
              secondaryData={rates.map((r) => r.bytesSentPerSec)}
              color={COLOR_RECV}
              secondaryColor={COLOR_SENT}
              label="Download"
              secondaryLabel="Upload"
              height={200}
              pollMs={POLL_MS}
            />

            {/* Packets chart */}
            <AreaChart
              data={rates.map((r) => r.packetsRecvPerSec)}
              secondaryData={rates.map((r) => r.packetsSentPerSec)}
              color={COLOR_RECV}
              secondaryColor={COLOR_SENT}
              label="Packets In"
              secondaryLabel="Packets Out"
              unit=" pkt/s"
              formatValue={(v) => formatNum(v)}
              height={140}
              pollMs={POLL_MS}
            />

            {/* Totals + Connections row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Cumulative totals */}
              <div className="rounded-xl border border-border-default bg-bg-surface p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Cumulative Totals
                </h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                  <Stat
                    label="Received"
                    value={formatBytes(latest.totals.bytes_recv)}
                    color={COLOR_RECV}
                  />
                  <Stat
                    label="Sent"
                    value={formatBytes(latest.totals.bytes_sent)}
                    color={COLOR_SENT}
                  />
                  <Stat
                    label="Packets In"
                    value={formatNum(latest.totals.packets_recv)}
                  />
                  <Stat
                    label="Packets Out"
                    value={formatNum(latest.totals.packets_sent)}
                  />
                  <Stat
                    label="Errors"
                    value={String(
                      latest.totals.errin + latest.totals.errout,
                    )}
                    warn={latest.totals.errin + latest.totals.errout > 0}
                  />
                  <Stat
                    label="Drops"
                    value={String(
                      latest.totals.dropin + latest.totals.dropout,
                    )}
                    warn={latest.totals.dropin + latest.totals.dropout > 0}
                  />
                </div>
              </div>

              {/* Connections */}
              <div className="rounded-xl border border-border-default bg-bg-surface p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Connections
                  <span className="ml-2 font-normal text-text-tertiary">
                    {latest.connections.total}
                  </span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(latest.connections.by_status)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => (
                      <span
                        key={status}
                        className="flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1 text-xs"
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${STATUS_COLORS[status] ?? "bg-[var(--text-tertiary)]"}`}
                        />
                        <span className="font-medium text-text-primary">
                          {count}
                        </span>
                        <span className="text-text-tertiary">{status}</span>
                      </span>
                    ))}
                </div>
              </div>
            </div>

            {/* Interface cards */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Interfaces
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(latest.interfaces)
                  .sort(([, a], [, b]) => {
                    // Sort: up first, then by traffic
                    if (a.is_up !== b.is_up) return a.is_up ? -1 : 1;
                    return (
                      b.io.bytes_recv +
                      b.io.bytes_sent -
                      (a.io.bytes_recv + a.io.bytes_sent)
                    );
                  })
                  .map(([name, iface]) => (
                    <InterfaceCard key={name} name={name} iface={iface} />
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  color,
  warn,
}: {
  label: string;
  value: string;
  color?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-text-tertiary">{label}</p>
      <p
        className={`text-sm font-semibold ${warn ? "text-warning" : "text-text-primary"}`}
        style={color ? { color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function InterfaceCard({
  name,
  iface,
}: {
  name: string;
  iface: InterfaceInfo;
}) {
  const ipv4 = iface.addrs.find((a) => a.family === "IPv4");
  const hasErrors = iface.io.errin + iface.io.errout > 0;
  const hasDrops = iface.io.dropin + iface.io.dropout > 0;

  return (
    <div
      className={`rounded-lg border bg-bg-surface p-3 ${iface.is_up ? "border-border-default" : "border-border-default opacity-50"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${iface.is_up ? "bg-success" : "bg-[var(--text-tertiary)]"}`}
          />
          <span className="text-sm font-semibold text-text-primary">
            {name}
          </span>
        </div>
        {iface.speed > 0 && (
          <span className="text-xs text-text-tertiary">
            {iface.speed >= 1000
              ? `${iface.speed / 1000} Gbps`
              : `${iface.speed} Mbps`}
          </span>
        )}
      </div>

      {ipv4 && (
        <p className="mb-2 text-xs text-text-secondary">{ipv4.address}</p>
      )}

      <div className="grid grid-cols-2 gap-1 text-xs">
        <span className="text-text-tertiary">Recv</span>
        <span className="text-right font-medium text-text-primary">
          {formatBytes(iface.io.bytes_recv)}
        </span>
        <span className="text-text-tertiary">Sent</span>
        <span className="text-right font-medium text-text-primary">
          {formatBytes(iface.io.bytes_sent)}
        </span>
        {(hasErrors || hasDrops) && (
          <>
            <span className="text-text-tertiary">Err/Drop</span>
            <span className="text-right font-medium text-warning">
              {iface.io.errin + iface.io.errout}/
              {iface.io.dropin + iface.io.dropout}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
