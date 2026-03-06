import { useCallback, useEffect, useRef } from "react";
import { useSpeedTestStore } from "./store";
import {
  listServers,
  runPingBatch,
  runDownloadTest,
  runUploadTest,
  getSpeedProgress,
} from "./commands";
import MetricCard from "./components/MetricCard";

// Gauge accent colors
const COLOR_DOWNLOAD = "hsl(160, 65%, 50%)";  // teal-green
const COLOR_UPLOAD = "hsl(250, 70%, 65%)";     // purple

const CONNECTIVITY_CHECK_INTERVAL = 5_000; // 5 seconds
const PROGRESS_POLL_MS = 500;

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

// ─── Connectivity hook ────────────────────────────────────────────────────────
function useConnectivityCheck() {
  const onlineRef = useRef(navigator.onLine);
  const isOnline = useSpeedTestStore((s) => s.isOnline);
  const setIsOnline = useSpeedTestStore((s) => s.setIsOnline);

  useEffect(() => {
    const handleOnline = () => { onlineRef.current = true; setIsOnline(true); };
    const handleOffline = () => { onlineRef.current = false; setIsOnline(false); };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Polling fallback — navigator.onLine can be unreliable
    const interval = setInterval(async () => {
      try {
        await fetch("https://1.1.1.1/cdn-cgi/trace", { mode: "no-cors", cache: "no-store" });
        if (!onlineRef.current) { onlineRef.current = true; setIsOnline(true); }
      } catch {
        if (onlineRef.current) { onlineRef.current = false; setIsOnline(false); }
      }
    }, CONNECTIVITY_CHECK_INTERVAL);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [setIsOnline]);

  return isOnline;
}

// ─── Progress polling helper ─────────────────────────────────────────────────
function startProgressPoll(
  phase: "download" | "upload",
  updateMetric: (key: "download" | "upload", patch: Record<string, unknown>) => void,
): () => void {
  const interval = setInterval(async () => {
    try {
      const p = await getSpeedProgress(phase);
      if (p.total_bytes > 0) {
        updateMetric(phase, {
          value: Math.round(p.speed_mbps * 10) / 10,
          subtitle: `${(p.total_bytes / 1_000_000).toFixed(0)} MB — ${p.elapsed_s.toFixed(1)}s`,
        });
      }
    } catch { /* ignore polling errors */ }
  }, PROGRESS_POLL_MS);
  return () => clearInterval(interval);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SpeedTest() {
  const {
    ping, download, upload,
    isRunning, servers, selectedServerId,
    downloadResult, uploadResult, pingDetails,
    updateMetric, setIsRunning, reset,
    setServers, setSelectedServerId,
    setDownloadResult, setUploadResult, setPingDetails,
  } = useSpeedTestStore();

  const isOnline = useConnectivityCheck();

  // Load servers on mount
  useEffect(() => {
    listServers()
      .then((res) => setServers(res.servers))
      .catch(() => {}); // Silently fail — Cloudflare default always works
  }, [setServers]);

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null;

  const runTests = useCallback(async () => {
    reset();
    setIsRunning(true);

    const serverId = selectedServerId ?? undefined;

    // 1. Ping — all targets in parallel, single fast call
    updateMetric("ping", { status: "running" });
    try {
      const res = await runPingBatch(6, serverId);
      const serverName = selectedServer?.name ?? "Cloudflare";
      updateMetric("ping", {
        status: "done",
        value: res.latency_ms,
        subtitle: `via ${serverName}`,
      });
      setPingDetails({
        serverName,
        serverLocation: selectedServer?.location ?? "Global CDN",
        min_ms: res.min_ms,
        max_ms: res.max_ms,
        jitter_ms: res.jitter_ms,
        samples: res.samples,
        all_ms: res.all_ms,
      });
    } catch (err) {
      updateMetric("ping", {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2. Download — parallel multi-stream test with live progress polling
    updateMetric("download", { status: "running" });
    {
      const stopPoll = startProgressPoll("download", updateMetric);
      try {
        const result = await runDownloadTest(serverId);
        stopPoll();
        setDownloadResult({
          total_bytes: result.total_bytes,
          duration_s: result.duration_s,
          streams: result.streams,
        });
        updateMetric("download", {
          status: "done",
          value: result.speed_mbps,
          subtitle: `${(result.total_bytes / 1_000_000).toFixed(0)} MB over ${result.duration_s}s (${result.streams} streams)`,
        });
      } catch (err) {
        stopPoll();
        updateMetric("download", {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Upload — parallel multi-stream test with live progress polling
    updateMetric("upload", { status: "running" });
    {
      const stopPoll = startProgressPoll("upload", updateMetric);
      try {
        const result = await runUploadTest(serverId);
        stopPoll();
        setUploadResult({
          total_bytes: result.total_bytes,
          duration_s: result.duration_s,
          streams: result.streams,
        });
        updateMetric("upload", {
          status: "done",
          value: result.speed_mbps,
          subtitle: `${(result.total_bytes / 1_000_000).toFixed(0)} MB over ${result.duration_s}s (${result.streams} streams)`,
        });
      } catch (err) {
        stopPoll();
        updateMetric("upload", {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    setIsRunning(false);
  }, [reset, setIsRunning, updateMetric, selectedServerId, selectedServer, setDownloadResult, setUploadResult, setPingDetails]);

  const hasAnyResult =
    ping.status !== "idle" ||
    download.status !== "idle" ||
    upload.status !== "idle";

  // ─── Offline overlay ──────────────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-[42px] shrink-0 items-center border-b border-border-default px-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Speed Test
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <circle cx="12" cy="20" r="1" fill="currentColor" />
          </svg>
          <span className="text-sm font-medium text-text-secondary">
            Internet Connection Not Found
          </span>
          <span className="text-xs text-text-tertiary">
            Checking connectivity every {CONNECTIVITY_CHECK_INTERVAL / 1000}s...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[42px] shrink-0 items-center border-b border-border-default px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Speed Test
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-6">

        {/* Gauges */}
        <div className="grid grid-cols-2 gap-4" style={{ width: "clamp(360px, 90vw, 720px)" }}>
          <MetricCard
            label="Download"
            icon={<DownloadIcon />}
            value={download.value}
            unit="Mbps"
            subtitle={download.subtitle}
            status={download.status}
            error={download.error}
            color={COLOR_DOWNLOAD}
            details={download.status === "done" && downloadResult ? {
              serverName: selectedServer?.name ?? "Cloudflare",
              serverLocation: selectedServer?.location ?? "Global CDN",
              totalBytes: downloadResult.total_bytes,
              streams: downloadResult.streams,
              duration_s: downloadResult.duration_s,
            } : undefined}
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
            details={upload.status === "done" && uploadResult ? {
              serverName: (selectedServer?.upload_url ? selectedServer.name : "Cloudflare"),
              serverLocation: (selectedServer?.upload_url ? selectedServer.location : "Global CDN"),
              totalBytes: uploadResult.total_bytes,
              streams: uploadResult.streams,
              duration_s: uploadResult.duration_s,
            } : undefined}
          />
        </div>

        {/* Ping + Server selector — side by side */}
        <div className="mt-4 grid grid-cols-2 gap-4" style={{ width: "clamp(360px, 90vw, 720px)" }}>
          {/* Ping */}
          <div className="w-full rounded-xl border border-border-default bg-bg-surface px-6 py-4">
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
              <p className="mt-1 text-right text-xs text-text-tertiary inline-flex items-center gap-1 float-right">
                {ping.subtitle}
                {pingDetails && (
                  <span className="group/ping relative cursor-help">
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="inline-block text-text-tertiary transition-colors hover:text-text-secondary">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span className="pointer-events-none opacity-0 transition-opacity group-hover/ping:pointer-events-auto group-hover/ping:opacity-100">
                      <span className="absolute bottom-full right-0 z-50 mb-2 rounded-lg border border-border-default bg-bg-surface px-3 py-2 shadow-lg">
                        <table className="text-left text-xs">
                          <tbody>
                            <tr><td className="whitespace-nowrap pr-3 text-text-tertiary">Server</td><td className="whitespace-nowrap font-medium text-text-primary">{pingDetails.serverName} ({pingDetails.serverLocation})</td></tr>
                            <tr><td className="whitespace-nowrap pr-3 text-text-tertiary">Samples</td><td className="whitespace-nowrap font-medium text-text-primary">{pingDetails.samples}</td></tr>
                            <tr><td className="whitespace-nowrap pr-3 text-text-tertiary">Min</td><td className="whitespace-nowrap font-medium text-text-primary">{pingDetails.min_ms} ms</td></tr>
                            <tr><td className="whitespace-nowrap pr-3 text-text-tertiary">Max</td><td className="whitespace-nowrap font-medium text-text-primary">{pingDetails.max_ms} ms</td></tr>
                            <tr><td className="whitespace-nowrap pr-3 text-text-tertiary">Jitter</td><td className="whitespace-nowrap font-medium text-text-primary">{pingDetails.jitter_ms} ms</td></tr>
                          </tbody>
                        </table>
                      </span>
                    </span>
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Server selector */}
          <div className="w-full rounded-xl border border-border-default bg-bg-surface px-6 py-4">
            <div className="flex items-center gap-2 mb-2">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <circle cx="6" cy="6" r="1" fill="currentColor" />
                <circle cx="6" cy="18" r="1" fill="currentColor" />
              </svg>
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Server</span>
            </div>
            <select
              value={selectedServerId ?? "cloudflare"}
              onChange={(e) => setSelectedServerId(e.target.value === "cloudflare" ? null : e.target.value)}
              disabled={isRunning}
              className="w-full rounded-md border border-border-default bg-bg-surface px-2 py-1.5 text-xs text-text-primary outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            >
              {servers.length === 0 ? (
                <option value="cloudflare">Cloudflare — Global CDN</option>
              ) : (
                (() => {
                  const grouped = new Map<string, typeof servers>();
                  for (const s of servers) {
                    const continent = s.continent || "Other";
                    if (!grouped.has(continent)) grouped.set(continent, []);
                    grouped.get(continent)!.push(s);
                  }
                  return Array.from(grouped.entries()).map(([continent, group]) => (
                    <optgroup key={continent} label={continent}>
                      {group.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.location}{s.upload_url ? "" : " (dl only)"}
                        </option>
                      ))}
                    </optgroup>
                  ));
                })()
              )}
            </select>
          </div>
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
