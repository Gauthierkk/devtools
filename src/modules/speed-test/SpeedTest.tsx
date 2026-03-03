import { useCallback } from "react";
import { useSpeedTestStore } from "./store";
import { runPing, runDownload, runDiskWrite, runDiskRead } from "./commands";
import MetricCard from "./components/MetricCard";

// Gauge scale maximums (for 100% fill)
const MAX_PING_MS = 200;
const MAX_DOWNLOAD_MBPS = 1000;
const MAX_DISK_MBS = 3000;

// Gauge accent colors (themed per metric type)
const COLOR_PING = "hsl(250, 70%, 65%)";       // purple
const COLOR_DOWNLOAD = "hsl(160, 65%, 50%)";    // teal-green
const COLOR_DISK_WRITE = "hsl(30, 90%, 58%)";   // amber
const COLOR_DISK_READ = "hsl(200, 80%, 55%)";   // sky blue

// ─── Icons ────────────────────────────────────────────────────────────────────
function PingIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function WriteIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ReadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SpeedTest() {
  const {
    ping, download, diskWrite, diskRead,
    isRunning,
    updateMetric, setIsRunning, setDiskTempPath, reset,
  } = useSpeedTestStore();

  const runTests = useCallback(async () => {
    reset();
    setIsRunning(true);

    // 1. Ping
    updateMetric("ping", { status: "running" });
    try {
      const res = await runPing();
      updateMetric("ping", {
        status: "done",
        value: res.latency_ms,
        subtitle: `min ${res.min_ms} ms · max ${res.max_ms} ms`,
      });
    } catch (err) {
      updateMetric("ping", {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. Download
    updateMetric("download", { status: "running" });
    try {
      const res = await runDownload();
      updateMetric("download", {
        status: "done",
        value: res.speed_mbps,
        subtitle: `${(res.bytes_received / 1_000_000).toFixed(0)} MB in ${res.duration_s} s`,
      });
    } catch (err) {
      updateMetric("download", {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 3. Disk write
    let tempPath: string | null = null;
    updateMetric("diskWrite", { status: "running" });
    try {
      const res = await runDiskWrite();
      tempPath = res.temp_path;
      setDiskTempPath(tempPath);
      updateMetric("diskWrite", {
        status: "done",
        value: res.speed_mbs,
        subtitle: `${res.size_mb} MB in ${res.duration_s} s`,
      });
    } catch (err) {
      updateMetric("diskWrite", {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. Disk read
    updateMetric("diskRead", { status: "running" });
    if (tempPath) {
      try {
        const res = await runDiskRead(tempPath);
        updateMetric("diskRead", {
          status: "done",
          value: res.speed_mbs,
          subtitle: `${res.size_mb} MB in ${res.duration_s} s`,
        });
      } catch (err) {
        updateMetric("diskRead", {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      updateMetric("diskRead", {
        status: "error",
        error: "Skipped — disk write test did not produce a file",
      });
    }

    setIsRunning(false);
  }, [reset, setIsRunning, setDiskTempPath, updateMetric]);

  const hasAnyResult =
    ping.status !== "idle" ||
    download.status !== "idle" ||
    diskWrite.status !== "idle" ||
    diskRead.status !== "idle";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[42px] shrink-0 items-center border-b border-border-default px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Speed Test
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-6 py-6">
        {/* Metric grid */}
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <MetricCard
            label="Ping"
            icon={<PingIcon />}
            value={ping.value}
            unit="ms"
            subtitle={ping.subtitle}
            status={ping.status}
            error={ping.error}
            maxValue={MAX_PING_MS}
            color={COLOR_PING}
          />
          <MetricCard
            label="Download"
            icon={<DownloadIcon />}
            value={download.value}
            unit="Mbps"
            subtitle={download.subtitle}
            status={download.status}
            error={download.error}
            maxValue={MAX_DOWNLOAD_MBPS}
            color={COLOR_DOWNLOAD}
          />
          <MetricCard
            label="Disk Write"
            icon={<WriteIcon />}
            value={diskWrite.value}
            unit="MB/s"
            subtitle={diskWrite.subtitle}
            status={diskWrite.status}
            error={diskWrite.error}
            maxValue={MAX_DISK_MBS}
            color={COLOR_DISK_WRITE}
          />
          <MetricCard
            label="Disk Read"
            icon={<ReadIcon />}
            value={diskRead.value}
            unit="MB/s"
            subtitle={diskRead.subtitle}
            status={diskRead.status}
            error={diskRead.error}
            maxValue={MAX_DISK_MBS}
            color={COLOR_DISK_READ}
          />
        </div>

        {/* Action button */}
        <div className="mt-8">
          {!isRunning ? (
            <button
              onClick={hasAnyResult ? () => { reset(); setTimeout(runTests, 0); } : runTests}
              className="flex items-center gap-2 rounded-lg bg-accent px-8 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 active:opacity-75"
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {hasAnyResult ? "Run Again" : "Start Test"}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border-default px-8 py-3 text-sm font-medium text-text-secondary">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Running…
            </div>
          )}
        </div>

        {/* Note */}
        <p className="mt-4 text-xs text-text-tertiary">
          Network tests require internet. Disk tests run locally.
        </p>
      </div>
    </div>
  );
}
