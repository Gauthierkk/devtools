import { invoke } from "@tauri-apps/api/core";

export async function rpcCall<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return invoke<T>("rpc_call", { method, params });
}
