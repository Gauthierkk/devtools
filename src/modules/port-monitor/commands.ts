import { rpcCall } from "../../lib/rpc";
import type { PortEntry } from "./store";

export async function fetchPorts(): Promise<PortEntry[]> {
  try {
    const result = await rpcCall<{ ports: PortEntry[] }>("port_monitor.get_ports");
    return result.ports;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invoke")) {
      throw new Error("Requires Tauri — run with 'npx tauri dev'");
    }
    throw err;
  }
}

export async function killProcess(pid: number): Promise<void> {
  await rpcCall<{ ok: boolean }>("port_monitor.kill_process", { pid });
}
