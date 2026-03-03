import { rpcCall } from "../../lib/rpc";

function wrapTauriError<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invoke")) {
      throw new Error("Requires Tauri — run with 'npx tauri dev'");
    }
    throw err;
  });
}

export interface PingResult {
  latency_ms: number;
  min_ms: number;
  max_ms: number;
  samples: number;
}

export interface DownloadResult {
  speed_mbps: number;
  bytes_received: number;
  duration_s: number;
}

export interface DiskWriteResult {
  speed_mbs: number;
  temp_path: string;
  size_mb: number;
  duration_s: number;
}

export interface DiskReadResult {
  speed_mbs: number;
  size_mb: number;
  duration_s: number;
}

export const runPing = () =>
  wrapTauriError(rpcCall<PingResult>("speed_test.run_ping"));

export const runDownload = () =>
  wrapTauriError(rpcCall<DownloadResult>("speed_test.run_download"));

export const runDiskWrite = () =>
  wrapTauriError(rpcCall<DiskWriteResult>("speed_test.run_disk_write"));

export const runDiskRead = (temp_path: string) =>
  wrapTauriError(rpcCall<DiskReadResult>("speed_test.run_disk_read", { temp_path }));
