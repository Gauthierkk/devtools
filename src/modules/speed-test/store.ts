import { create } from "zustand";
import type { ServerInfo } from "./commands";

export type TestStatus = "idle" | "running" | "done" | "error";

export interface TestResult {
  total_bytes: number;
  duration_s: number;
  streams: number;
}

export interface PingDetails {
  serverName: string;
  serverLocation: string;
  min_ms: number;
  max_ms: number;
  jitter_ms: number;
  samples: number;
  all_ms: number[];
}

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
  isOnline: boolean;

  // Server selection
  servers: ServerInfo[];
  selectedServerId: string | null;

  // Test result details (replaces per-chunk arrays)
  downloadResult: TestResult | null;
  uploadResult: TestResult | null;
  pingDetails: PingDetails | null;

  updateMetric: (key: MetricKey, patch: Partial<TestMetric>) => void;
  setIsRunning: (v: boolean) => void;
  setIsOnline: (v: boolean) => void;
  setServers: (servers: ServerInfo[]) => void;
  setSelectedServerId: (id: string | null) => void;
  setDownloadResult: (result: TestResult | null) => void;
  setUploadResult: (result: TestResult | null) => void;
  setPingDetails: (details: PingDetails | null) => void;
  reset: () => void;
}

export const useSpeedTestStore = create<SpeedTestState>((set) => ({
  ping: idle,
  download: idle,
  upload: idle,
  isRunning: false,
  isOnline: true,
  servers: [],
  selectedServerId: null,
  downloadResult: null,
  uploadResult: null,
  pingDetails: null,

  updateMetric: (key, patch) =>
    set((s) => ({ [key]: { ...s[key], ...patch } })),

  setIsRunning: (v) => set({ isRunning: v }),

  setIsOnline: (v) => set({ isOnline: v }),

  setServers: (servers) => set({ servers }),

  setSelectedServerId: (id) => set({ selectedServerId: id }),

  setDownloadResult: (result) => set({ downloadResult: result }),

  setUploadResult: (result) => set({ uploadResult: result }),

  setPingDetails: (details) => set({ pingDetails: details }),

  reset: () =>
    set({
      ping: idle,
      download: idle,
      upload: idle,
      isRunning: false,
      downloadResult: null,
      uploadResult: null,
      pingDetails: null,
    }),
}));
