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
  snapshots: NetworkSnapshot[];
  rates: RatePoint[];
  error: string | null;

  pushSnapshot: (snap: NetworkSnapshot) => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

export const useNetworkStatsStore = create<NetworkStatsState>((set) => ({
  snapshots: [],
  rates: [],
  error: null,

  pushSnapshot: (snap) =>
    set((state) => {
      const prev = state.snapshots;
      const next = [...prev, snap].slice(-(MAX_HISTORY + 1));

      // Compute rate from last two snapshots
      const rates = [...state.rates];
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
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
        snapshots: next,
        rates: rates.slice(-MAX_HISTORY),
        error: null,
      };
    }),

  setError: (err) => set({ error: err }),
  reset: () => set({ snapshots: [], rates: [], error: null }),
}));
