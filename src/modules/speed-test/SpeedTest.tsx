import { useCallback } from "react";
import { useSpeedTestStore } from "./store";
import { runPingBatch, runDownloadChunk, runUploadChunk } from "./commands";
import MetricCard from "./components/MetricCard";

// Gauge accent colors
const COLOR_DOWNLOAD = "hsl(160, 65%, 50%)";  // teal-green
const COLOR_UPLOAD = "hsl(250, 70%, 65%)";     // purple

const CHUNK_BYTES = 3_000_000; // smaller chunks = more frequent gauge updates
const CHUNKS = 8;

// ─── Icons ────────────────────────────────────────────────────────────────────
function DownloadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SpeedTest() {
  const {
    ping, download, upload,
    isRunning,
    updateMetric, setIsRunning, reset,
  } = useSpeedTestStore();

  const runTests = useCallback(async () => {
    reset();
    setIsRunning(true);

    // 1. Ping — all targets in parallel, single fast call
    updateMetric("ping", { status: "running" });
    try {
      const res = await runPingBatch(6);
      updateMetric("ping", {
        status: "done",
        value: res.latency_ms,
        subtitle: `via ${res.providers.join(", ")} · min ${res.min_ms} · max ${res.max_ms} ms`,
      });
    } catch (err) {
      updateMetric("ping", {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. Download — 8 chunks of 3MB, live-updating average speed
    updateMetric("download", { status: "running" });
    {
      let totalBytes = 0;
      let totalDuration = 0;
      for (let i = 0; i < CHUNKS; i++) {
        try {
          const res = await runDownloadChunk(CHUNK_BYTES);
          totalBytes += res.bytes_received;
          totalDuration += res.duration_s;
          const avgSpeed = (totalBytes * 8) / (totalDuration * 1_000_000);
          updateMetric("download", {
            value: Math.round(avgSpeed * 10) / 10,
            subtitle: `${(totalBytes / 1_000_000).toFixed(0)} / ${((CHUNKS * CHUNK_BYTES) / 1_000_000).toFixed(0)} MB`,
          });
        } catch (err) {
          if (totalBytes === 0) {
            updateMetric("download", {
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            });
            break;
          }
        }
      }
      if (totalBytes > 0) {
        const finalSpeed = (totalBytes * 8) / (totalDuration * 1_000_000);
        updateMetric("download", {
          status: "done",
          value: Math.round(finalSpeed * 10) / 10,
          subtitle: `avg over ${(totalBytes / 1_000_000).toFixed(0)} MB`,
        });
      }
    }

    // 3. Upload — 8 chunks of 3MB, live-updating average speed
    updateMetric("upload", { status: "running" });
    {
      let totalBytes = 0;
      let totalDuration = 0;
      for (let i = 0; i < CHUNKS; i++) {
        try {
          const res = await runUploadChunk(CHUNK_BYTES);
          totalBytes += res.bytes_sent;
          totalDuration += res.duration_s;
          const avgSpeed = (totalBytes * 8) / (totalDuration * 1_000_000);
          updateMetric("upload", {
            value: Math.round(avgSpeed * 10) / 10,
            subtitle: `${(totalBytes / 1_000_000).toFixed(0)} / ${((CHUNKS * CHUNK_BYTES) / 1_000_000).toFixed(0)} MB`,
          });
        } catch (err) {
          if (totalBytes === 0) {
            updateMetric("upload", {
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            });
            break;
          }
        }
      }
      if (totalBytes > 0) {
        const finalSpeed = (totalBytes * 8) / (totalDuration * 1_000_000);
        updateMetric("upload", {
          status: "done",
          value: Math.round(finalSpeed * 10) / 10,
          subtitle: `avg over ${(totalBytes / 1_000_000).toFixed(0)} MB`,
        });
      }
    }

    setIsRunning(false);
  }, [reset, setIsRunning, updateMetric]);

  const hasAnyResult =
    ping.status !== "idle" ||
    download.status !== "idle" ||
    upload.status !== "idle";

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

        {/* Gauges */}
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <MetricCard
            label="Download"
            icon={<DownloadIcon />}
            value={download.value}
            unit="Mbps"
            subtitle={download.subtitle}
            status={download.status}
            error={download.error}
            color={COLOR_DOWNLOAD}
          />
          <MetricCard
            label="Upload"
            icon={<UploadIcon />}
            value={upload.value}
            unit="Mbps"
            subtitle={upload.subtitle}
            status={upload.status}
            error={upload.error}
            color={COLOR_UPLOAD}
          />
        </div>

        {/* Ping — plain number row */}
        <div className="mt-4 w-full max-w-2xl rounded-xl border border-border-default bg-bg-surface px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <circle cx="12" cy="20" r="1" fill="currentColor" />
              </svg>
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Ping</span>
              {ping.status === "running" && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              {ping.status === "idle" && (
                <span className="text-lg font-semibold text-text-tertiary">—</span>
              )}
              {ping.status === "running" && (
                <span className="text-sm text-text-tertiary animate-pulse">Testing…</span>
              )}
              {ping.status === "done" && ping.value != null && (
                <>
                  <span className="text-2xl font-bold text-text-primary">
                    {ping.value % 1 === 0 ? ping.value : ping.value.toFixed(1)}
                  </span>
                  <span className="text-xs text-text-secondary">ms</span>
                </>
              )}
              {ping.status === "error" && (
                <span className="text-xs text-danger">{ping.error}</span>
              )}
            </div>
          </div>
          {ping.subtitle && ping.status === "done" && (
            <p className="mt-1 text-right text-xs text-text-tertiary">{ping.subtitle}</p>
          )}
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

        <p className="mt-4 text-xs text-text-tertiary">
          Requires internet connection.
        </p>
      </div>
    </div>
  );
}
