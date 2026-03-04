import { rpcCall } from "../../lib/rpc";

export interface IoCounters {
  bytes_sent: number;
  bytes_recv: number;
  packets_sent: number;
  packets_recv: number;
  errin: number;
  errout: number;
  dropin: number;
  dropout: number;
}

export interface InterfaceInfo {
  io: IoCounters;
  is_up: boolean;
  speed: number;
  mtu: number;
  addrs: { family: string; address: string }[];
}

export interface ConnectionSummary {
  total: number;
  by_status: Record<string, number>;
}

export interface NetworkSnapshot {
  totals: IoCounters;
  interfaces: Record<string, InterfaceInfo>;
  connections: ConnectionSummary;
  timestamp: number;
}

export const fetchSnapshot = () =>
  rpcCall<NetworkSnapshot>("networking_stats.get_snapshot");
