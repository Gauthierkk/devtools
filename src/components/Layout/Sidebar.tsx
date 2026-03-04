import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getModules, type ToolModule } from "../../lib/module-registry";
import { useSidebarStore } from "../../stores/sidebar-store";
import { useThemeStore, type Theme } from "../../stores/theme-store";
import Icon from "../ui/Icon";

const themeLabels: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  "tokyo-night": "Tokyo Night",
};

function SidebarButton({
  icon,
  label,
  title,
  isExpanded,
  isActive = false,
  onClick,
  draggable,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver,
  dragPosition,
}: {
  icon: ReactNode;
  label?: string;
  title?: string;
  isExpanded: boolean;
  isActive?: boolean;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  isDragOver?: boolean;
  dragPosition?: "above" | "below";
}) {
  return (
    <button
      onClick={onClick}
      title={isExpanded ? undefined : title}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={`relative flex h-9 items-center gap-2.5 rounded-md px-2 transition-colors duration-150 ${
        isExpanded ? "" : "justify-center"
      } ${
        isActive
          ? "bg-bg-surface-active text-text-primary"
          : "text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {isDragOver && dragPosition === "above" && (
        <span className="absolute top-0 right-1 left-1 h-0.5 -translate-y-0.5 rounded bg-accent" />
      )}
      {icon}
      {isExpanded && label && <span className="truncate text-sm">{label}</span>}
      {isDragOver && dragPosition === "below" && (
        <span className="absolute right-1 bottom-0 left-1 h-0.5 translate-y-0.5 rounded bg-accent" />
      )}
    </button>
  );
}

function getOrderedModules(
  modules: readonly ToolModule[],
  savedOrder: string[],
): ToolModule[] {
  if (savedOrder.length === 0) return [...modules];

  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const ordered: ToolModule[] = [];

  // Add modules in saved order
  for (const id of savedOrder) {
    const mod = moduleMap.get(id);
    if (mod) {
      ordered.push(mod);
      moduleMap.delete(id);
    }
  }

  // Append any new modules not in the saved order
  for (const mod of moduleMap.values()) {
    ordered.push(mod);
  }

  return ordered;
}

export default function Sidebar() {
  const allModules = getModules();
  const { moduleOrder, setModuleOrder } = useSidebarStore();
  const orderedModules = getOrderedModules(allModules, moduleOrder);

  const location = useLocation();
  const navigate = useNavigate();
  const { theme, cycleTheme } = useThemeStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const dragIdx = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    index: number;
    position: "above" | "below";
  } | null>(null);

  function handleDragStart(e: DragEvent, index: number) {
    dragIdx.current = index;
    e.dataTransfer.effectAllowed = "move";
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx.current === null || dragIdx.current === index) {
      setDropTarget(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "above" : "below";

    setDropTarget({ index, position });
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (dragIdx.current === null || !dropTarget) return;

    const fromIndex = dragIdx.current;
    let toIndex = dropTarget.index;

    if (dropTarget.position === "below") {
      toIndex += 1;
    }

    // Adjust for removal of source
    if (fromIndex < toIndex) {
      toIndex -= 1;
    }

    if (fromIndex !== toIndex) {
      const newOrder = orderedModules.map((m) => m.id);
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      setModuleOrder(newOrder);
    }

    dragIdx.current = null;
    setDropTarget(null);
  }

  function handleDragEnd() {
    dragIdx.current = null;
    setDropTarget(null);
  }

  return (
    <aside
      className={`flex flex-col border-r border-border-default bg-bg-surface transition-[width] duration-200 ${
        isExpanded ? "w-[180px]" : "w-[52px]"
      }`}
    >
      {/* Logo / App icon */}
      <div
        className={`flex h-[52px] shrink-0 items-center border-b border-border-default ${
          isExpanded ? "gap-2 px-4" : "justify-center"
        }`}
      >
        <span className="shrink-0 text-sm font-semibold text-text-secondary">DT</span>
        {isExpanded && (
          <span className="truncate text-sm font-medium text-text-primary">DevTools</span>
        )}
      </div>

      {/* Tool navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-1.5 pt-3 pb-2">
        {orderedModules.map((mod, index) => (
          <SidebarButton
            key={mod.id}
            icon={<Icon name={mod.icon} size={18} className="shrink-0" />}
            label={mod.name}
            title={mod.name}
            isExpanded={isExpanded}
            isActive={location.pathname === mod.route}
            onClick={() => navigate(mod.route)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            isDragOver={dropTarget?.index === index}
            dragPosition={dropTarget?.index === index ? dropTarget.position : undefined}
          />
        ))}
      </nav>

      {/* Theme toggle + expand/collapse */}
      <div className="flex flex-col gap-1 border-t border-border-default px-1.5 py-2">
        <SidebarButton
          icon={
            <Icon
              name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "palette"}
              size={18}
              className="shrink-0"
            />
          }
          label={themeLabels[theme]}
          title={`Theme: ${themeLabels[theme]}`}
          isExpanded={isExpanded}
          onClick={cycleTheme}
        />

        <SidebarButton
          icon={
            <Icon
              name="chevron-right"
              size={18}
              className={`shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            />
          }
          label="Collapse"
          title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
          isExpanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        />
      </div>
    </aside>
  );
}
