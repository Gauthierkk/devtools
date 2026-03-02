import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "tokyo-night";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

const themes: Theme[] = ["light", "dark", "tokyo-night"];

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        set({ theme });
      },
      cycleTheme: () => {
        const current = get().theme;
        const idx = themes.indexOf(current);
        const next = themes[(idx + 1) % themes.length];
        get().setTheme(next);
      },
    }),
    {
      name: "devtools-theme",
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute("data-theme", state.theme);
        }
      },
    },
  ),
);
