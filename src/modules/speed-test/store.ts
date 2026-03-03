import { create } from "zustand";

export type TestStatus = "idle" | "running" | "done" | "error";

export interface TestMetric {
  status: TestStatus;
  value: number | null;
  subtitle: string | null;
  error: string | null;
}

const idle: TestMetric = { status: "idle", value: null, subtitle: null, error: null };

type MetricKey = "ping" | "download" | "upload";

interface SpeedTestState {
  ping: TestMetric;
  download: TestMetric;
  upload: TestMetric;
  isRunning: boolean;

  updateMetric: (key: MetricKey, patch: Partial<TestMetric>) => void;
  setIsRunning: (v: boolean) => void;
  reset: () => void;
}

export const useSpeedTestStore = create<SpeedTestState>((set) => ({
  ping: idle,
  download: idle,
  upload: idle,
  isRunning: false,

  updateMetric: (key, patch) =>
    set((s) => ({ [key]: { ...s[key], ...patch } })),

  setIsRunning: (v) => set({ isRunning: v }),

  reset: () =>
    set({
      ping: idle,
      download: idle,
      upload: idle,
      isRunning: false,
    }),
}));
