import { lazy, type LazyExoticComponent, type ComponentType } from "react";

export interface ToolModule {
  id: string;
  name: string;
  icon: string;
  route: string;
  component: LazyExoticComponent<ComponentType>;
}

const modules: ToolModule[] = [];

export function registerModule(mod: ToolModule) {
  if (!modules.find((m) => m.id === mod.id)) {
    modules.push(mod);
  }
}

export function getModules(): readonly ToolModule[] {
  return modules;
}

// Register JSON Tool
registerModule({
  id: "json-tool",
  name: "JSON",
  icon: "braces",
  route: "/json",
  component: lazy(() => import("../modules/json-tool/JsonTool")),
});

// Register Port Monitor
registerModule({
  id: "port-monitor",
  name: "Ports",
  icon: "network",
  route: "/ports",
  component: lazy(() => import("../modules/port-monitor/PortMonitor")),
});
