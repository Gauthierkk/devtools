import { create } from "zustand";

export interface PortEntry {
  pid: number;
  process: string;
  protocol: string;
  address: string;
  port: number;
}

interface PortMonitorState {
  ports: PortEntry[];
  error: string | null;

  setPorts: (ports: PortEntry[]) => void;
  setError: (error: string | null) => void;
}

export const usePortMonitorStore = create<PortMonitorState>()((set) => ({
  ports: [],
  error: null,

  setPorts: (ports) => set({ ports, error: null }),
  setError: (error) => set({ error }),
}));
