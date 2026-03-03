import { create } from "zustand";
import { SYMBOL_CATEGORIES } from "./latex-symbols";

interface LatexToolState {
  latex: string;
  activeCategory: string;
  setLatex: (latex: string) => void;
  setActiveCategory: (id: string) => void;
  clearLatex: () => void;
}

export const useLatexToolStore = create<LatexToolState>((set) => ({
  latex: "",
  activeCategory: SYMBOL_CATEGORIES[0].id,
  setLatex: (latex) => set({ latex }),
  setActiveCategory: (id) => set({ activeCategory: id }),
  clearLatex: () => set({ latex: "" }),
}));
