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

export interface ServerInfo {
  id: string;
  name: string;
  location: string;
  download_url: string;
  upload_url: string | null;
}

export interface PingBatchResult {
  latency_ms: number;
  min_ms: number;
  max_ms: number;
  jitter_ms: number;
  providers: string[];
  samples: number;
  all_ms: number[];
}

export interface DownloadChunkResult {
  speed_mbps: number;
  bytes_received: number;
  duration_s: number;
}

export interface UploadChunkResult {
  speed_mbps: number;
  bytes_sent: number;
  duration_s: number;
}

export const listServers = () =>
  wrapTauriError(rpcCall<{ servers: ServerInfo[] }>("speed_test.list_servers", {}));

export const runPingBatch = (n_samples = 6, server_id?: string) =>
  wrapTauriError(rpcCall<PingBatchResult>("speed_test.run_ping_batch", { n_samples, server_id }));

export const runDownloadChunk = (bytes_to_fetch: number, server_id?: string) =>
  wrapTauriError(rpcCall<DownloadChunkResult>("speed_test.run_download_chunk", { bytes_to_fetch, server_id }));

export const runUploadChunk = (bytes_to_send: number, server_id?: string) =>
  wrapTauriError(rpcCall<UploadChunkResult>("speed_test.run_upload_chunk", { bytes_to_send, server_id }));
