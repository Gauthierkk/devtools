import { create } from "zustand";
import { SYMBOL_CATEGORIES } from "./latex-symbols";

interface LatexToolState {
  latex: string;
  openCategories: Set<string>;
  setLatex: (latex: string) => void;
  toggleCategory: (id: string) => void;
  clearLatex: () => void;
}

const allOpen = new Set(SYMBOL_CATEGORIES.map((c) => c.id));

export const useLatexToolStore = create<LatexToolState>((set) => ({
  latex: "",
  openCategories: allOpen,
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
  clearLatex: () => set({ latex: "" }),
}));
