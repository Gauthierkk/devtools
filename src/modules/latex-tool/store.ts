import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SYMBOL_CATEGORIES } from "./latex-symbols";

interface LatexToolState {
  latex: string;
  openCategories: Set<string>;
  categoryOrder: string[];
  setLatex: (latex: string) => void;
  toggleCategory: (id: string) => void;
  collapseAllCategories: () => void;
  expandAllCategories: () => void;
  enabledCategories: Set<string>;
  toggleEnabledCategory: (id: string) => void;
  setCategoryOrder: (order: string[]) => void;
  clearLatex: () => void;
}

const allOpen = new Set(SYMBOL_CATEGORIES.map((c) => c.id));

export const useLatexToolStore = create<LatexToolState>()(
  persist(
    (set) => ({
      latex: "",
      openCategories: allOpen,
      categoryOrder: [],
      setLatex: (latex) => set({ latex }),
      toggleCategory: (id) =>
        set((state) => {
          const next = new Set(state.openCategories);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { openCategories: next };
        }),
      collapseAllCategories: () => set({ openCategories: new Set() }),
      expandAllCategories: () => set({ openCategories: new Set(SYMBOL_CATEGORIES.map((c) => c.id)) }),
      enabledCategories: new Set(SYMBOL_CATEGORIES.map((c) => c.id)),
      toggleEnabledCategory: (id) =>
        set((state) => {
          const next = new Set(state.enabledCategories);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return { enabledCategories: next };
        }),
      setCategoryOrder: (order) => set({ categoryOrder: order }),
      clearLatex: () => set({ latex: "" }),
    }),
    {
      name: "devtools-latex-tool",
      partialize: (state) => ({ categoryOrder: state.categoryOrder }),
    },
  ),
);
