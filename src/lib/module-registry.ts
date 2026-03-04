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

// Register LaTeX Tool
registerModule({
  id: "latex-tool",
  name: "LaTeX",
  icon: "sigma",
  route: "/latex",
  component: lazy(() => import("../modules/latex-tool/LatexTool")),
});

// Register Speed Test
registerModule({
  id: "speed-test",
  name: "Speed Test",
  icon: "gauge",
  route: "/speed-test",
  component: lazy(() => import("../modules/speed-test/SpeedTest")),
});

// Register Networking Stats
registerModule({
  id: "networking-stats",
  name: "Network",
  icon: "activity",
  route: "/network-stats",
  component: lazy(
    () => import("../modules/networking-stats/NetworkingStats"),
  ),
  
// Register Regex Tool
registerModule({
  id: "regex-tool",
  name: "Regex",
  icon: "regex",
  route: "/regex",
  component: lazy(() => import("../modules/regex-tool/RegexTool")),
});
