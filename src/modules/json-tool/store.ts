import { create } from "zustand";

export type ViewMode = "editor" | "tree" | "split";

interface ValidationError {
  message: string;
  line: number;
  column: number;
}

interface JsonToolState {
  content: string;
  filePath: string | null;
  isDirty: boolean;
  viewMode: ViewMode;
  validationError: ValidationError | null;

  setContent: (content: string) => void;
  setFilePath: (path: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setValidationError: (error: ValidationError | null) => void;
  markClean: () => void;
}

const SAMPLE_JSON = JSON.stringify(
  {
    name: "DevTools",
    version: "0.1.0",
    features: ["JSON viewer", "Theme support", "Modular architecture"],
    config: {
      theme: "dark",
      editor: {
        fontSize: 14,
        tabSize: 2,
        wordWrap: true,
      },
    },
    stats: {
      modules: 1,
      themes: 3,
      linesOfCode: null,
      active: true,
    },
  },
  null,
  2,
);

export const useJsonToolStore = create<JsonToolState>()((set) => ({
  content: SAMPLE_JSON,
  filePath: null,
  isDirty: false,
  viewMode: "split",
  validationError: null,

  setContent: (content) => set({ content, isDirty: true }),
  setFilePath: (filePath) => set({ filePath }),
  setViewMode: (viewMode) => set({ viewMode }),
  setValidationError: (validationError) => set({ validationError }),
  markClean: () => set({ isDirty: false }),
}));
