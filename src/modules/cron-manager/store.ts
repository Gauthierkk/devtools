import { create } from "zustand";

export interface CronJob {
  id: string;
  name: string;
  cronExpression: string;
  command: string;
  isEnabled: boolean;
  source: "devtools" | "external";
}

export interface RunState {
  jobId: string;
  jobName: string;
  jobCommand: string;
  runId: string;
  output: string;
  done: boolean;
  exitCode: number | null;
}

interface CronManagerState {
  jobs: CronJob[];
  error: string | null;
  loading: boolean;
  editingJob: CronJob | null;
  isAdding: boolean;
  runState: RunState | null;

  setJobs: (jobs: CronJob[]) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setEditingJob: (job: CronJob | null) => void;
  setIsAdding: (adding: boolean) => void;
  setRunState: (run: RunState | null) => void;
  updateRunOutput: (output: string, done: boolean, exitCode: number | null) => void;
  reset: () => void;
}

export const useCronManagerStore = create<CronManagerState>()((set) => ({
  jobs: [],
  error: null,
  loading: false,
  editingJob: null,
  isAdding: false,
  runState: null,

  setJobs: (jobs) => set({ jobs, error: null }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
  setEditingJob: (job) => set({ editingJob: job, isAdding: false }),
  setIsAdding: (adding) => set({ isAdding: adding, editingJob: null }),
  setRunState: (run) => set({ runState: run }),
  updateRunOutput: (output, done, exitCode) =>
    set((s) => ({
      runState: s.runState ? { ...s.runState, output, done, exitCode } : null,
    })),
  reset: () =>
    set({ jobs: [], error: null, loading: false, editingJob: null, isAdding: false, runState: null }),
}));
