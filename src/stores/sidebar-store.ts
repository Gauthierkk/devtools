import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  moduleOrder: string[];
  setModuleOrder: (order: string[]) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      moduleOrder: [],
      setModuleOrder: (order) => set({ moduleOrder: order }),
    }),
    { name: "devtools-sidebar" },
  ),
);
