import { create } from "zustand";
import type { NetworkSnapshot } from "./commands";

const MAX_HISTORY = 241; // +1 buffer point for smooth scroll

export interface RatePoint {
  bytesRecvPerSec: number;
  bytesSentPerSec: number;
  packetsRecvPerSec: number;
  packetsSentPerSec: number;
}

interface NetworkStatsState {
  // Only the latest snapshot is ever displayed; keeping full history would
  // hold hundreds of interface/connection tables in memory for nothing
  latest: NetworkSnapshot | null;
  rates: RatePoint[];
  error: string | null;

  pushSnapshot: (snap: NetworkSnapshot) => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

export const useNetworkStatsStore = create<NetworkStatsState>((set) => ({
  latest: null,
  rates: [],
  error: null,

  pushSnapshot: (snap) =>
    set((state) => {
      // Compute rate from the previous snapshot
      const rates = [...state.rates];
      const last = state.latest;
      if (last) {
        const dt = snap.timestamp - last.timestamp;
        if (dt > 0) {
          rates.push({
            bytesRecvPerSec:
              (snap.totals.bytes_recv - last.totals.bytes_recv) / dt,
            bytesSentPerSec:
              (snap.totals.bytes_sent - last.totals.bytes_sent) / dt,
            packetsRecvPerSec:
              (snap.totals.packets_recv - last.totals.packets_recv) / dt,
            packetsSentPerSec:
              (snap.totals.packets_sent - last.totals.packets_sent) / dt,
          });
        }
      }

      return {
        latest: snap,
        rates: rates.slice(-MAX_HISTORY),
        error: null,
      };
    }),

  setError: (err) => set({ error: err }),
  reset: () => set({ latest: null, rates: [], error: null }),
}));
