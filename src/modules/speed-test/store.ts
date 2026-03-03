import { create } from "zustand";

export type TestStatus = "idle" | "running" | "done" | "error";

export interface TestMetric {
  status: TestStatus;
  value: number | null;
  subtitle: string | null; // e.g. "min 12ms · max 31ms"
  error: string | null;
}

const idle: TestMetric = { status: "idle", value: null, subtitle: null, error: null };

type MetricKey = "ping" | "download" | "diskWrite" | "diskRead";

interface SpeedTestState {
  ping: TestMetric;
  download: TestMetric;
  diskWrite: TestMetric;
  diskRead: TestMetric;
  isRunning: boolean;
  diskTempPath: string | null;

  updateMetric: (key: MetricKey, patch: Partial<TestMetric>) => void;
  setIsRunning: (v: boolean) => void;
  setDiskTempPath: (p: string | null) => void;
  reset: () => void;
}

export const useSpeedTestStore = create<SpeedTestState>((set) => ({
  ping: idle,
  download: idle,
  diskWrite: idle,
  diskRead: idle,
  isRunning: false,
  diskTempPath: null,

  updateMetric: (key, patch) =>
    set((s) => ({ [key]: { ...s[key], ...patch } })),

  setIsRunning: (v) => set({ isRunning: v }),
  setDiskTempPath: (p) => set({ diskTempPath: p }),

  reset: () =>
    set({
      ping: idle,
      download: idle,
      diskWrite: idle,
      diskRead: idle,
      isRunning: false,
      diskTempPath: null,
    }),
}));
