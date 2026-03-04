import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
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
  onMouseDown,
  reorderable,
  isDragging,
  isDragOver,
  dragPosition,
}: {
  icon: ReactNode;
  label?: string;
  title?: string;
  isExpanded: boolean;
  isActive?: boolean;
  onClick: () => void;
  onMouseDown?: (e: MouseEvent) => void;
  reorderable?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  dragPosition?: "above" | "below";
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={isExpanded ? undefined : title}
      onClick={reorderable ? undefined : onClick}
      onMouseDown={onMouseDown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative flex h-9 select-none items-center gap-2.5 rounded-md px-2 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent ${
        isExpanded ? "" : "justify-center"
      } ${
        isActive
          ? "bg-bg-surface-active text-text-primary"
          : "text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
      } ${reorderable ? "cursor-grab" : ""} ${isDragging ? "opacity-50 cursor-grabbing" : ""}`}
    >
      {isDragOver && dragPosition === "above" && (
        <span className="absolute top-0 right-1 left-1 h-0.5 -translate-y-0.5 rounded bg-accent" />
      )}
      {icon}
      {isExpanded && label && <span className="truncate text-sm">{label}</span>}
      {isExpanded && reorderable && (
        <Icon name="grip" size={12} className="ml-auto shrink-0 text-text-tertiary" />
      )}
      {isDragOver && dragPosition === "below" && (
        <span className="absolute right-1 bottom-0 left-1 h-0.5 translate-y-0.5 rounded bg-accent" />
      )}
    </div>
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

  // --- Custom drag state ---
  const dragState = useRef<{ index: number; startY: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dropTargetRef = useRef<{ index: number; position: "above" | "below" } | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    index: number;
    position: "above" | "below";
  } | null>(null);

  const DRAG_THRESHOLD = 4;

  // Cmd+1..9 hotkeys to switch modules
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= orderedModules.length) {
        e.preventDefault();
        navigate(orderedModules[num - 1].route);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [orderedModules, navigate]);

  function handleMouseDown(e: MouseEvent, index: number) {
    if (e.button !== 0) return;

    dragState.current = { index, startY: e.clientY };

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      if (!dragState.current) return;

      const deltaY = Math.abs(moveEvent.clientY - dragState.current.startY);

      if (!isDraggingRef.current && deltaY > DRAG_THRESHOLD) {
        isDraggingRef.current = true;
        setDraggingIndex(dragState.current.index);
      }

      if (isDraggingRef.current) {
        const items = document.querySelectorAll("[data-sidebar-item]");
        let newTarget: { index: number; position: "above" | "below" } | null = null;

        for (let i = 0; i < items.length; i++) {
          const rect = items[i].getBoundingClientRect();
          if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) {
            if (i !== dragState.current!.index) {
              const midY = rect.top + rect.height / 2;
              newTarget = { index: i, position: moveEvent.clientY < midY ? "above" : "below" };
            }
            break;
          }
        }

        dropTargetRef.current = newTarget;
        setDropTarget(newTarget);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      const currentTarget = dropTargetRef.current;

      if (isDraggingRef.current && dragState.current && currentTarget) {
        const fromIndex = dragState.current.index;
        let toIndex = currentTarget.index;

        if (currentTarget.position === "below") {
          toIndex += 1;
        }
        if (fromIndex < toIndex) {
          toIndex -= 1;
        }

        if (fromIndex !== toIndex) {
          const newOrder = orderedModules.map((m) => m.id);
          const [moved] = newOrder.splice(fromIndex, 1);
          newOrder.splice(toIndex, 0, moved);
          setModuleOrder(newOrder);
        }
      } else if (dragState.current) {
        // No drag — treat as click
        const mod = orderedModules[dragState.current.index];
        if (mod) navigate(mod.route);
      }

      dragState.current = null;
      isDraggingRef.current = false;
      dropTargetRef.current = null;
      setDraggingIndex(null);
      setDropTarget(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <aside
      className={`flex flex-col border-r border-border-default bg-bg-surface transition-[width] duration-200 ${
        isExpanded ? "w-auto" : "w-[52px]"
      }`}
    >
      {/* Logo / App icon + expand/collapse */}
      <div
        className={`flex h-[52px] shrink-0 items-center border-b border-border-default ${
          isExpanded ? "justify-between px-4" : "justify-center"
        }`}
      >
        {isExpanded ? (
          <>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm font-semibold text-text-secondary">DT</span>
              <span className="truncate text-sm font-medium text-text-primary">DevTools</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              title="Collapse sidebar"
              className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
            >
              <Icon name="chevron-right" size={14} className="rotate-180" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsExpanded(true)}
            title="Expand sidebar"
            className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
          >
            <Icon name="chevron-right" size={14} />
          </button>
        )}
      </div>

      {/* Tool navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-1.5 pt-3 pb-2">
        {orderedModules.map((mod, index) => (
          <div key={mod.id} data-sidebar-item>
            <SidebarButton
              icon={<Icon name={mod.icon} size={18} className="shrink-0" />}
              label={mod.name}
              title={mod.name}
              isExpanded={isExpanded}
              isActive={location.pathname === mod.route}
              onClick={() => navigate(mod.route)}
              reorderable
              onMouseDown={(e) => handleMouseDown(e, index)}
              isDragging={draggingIndex === index}
              isDragOver={dropTarget?.index === index}
              dragPosition={dropTarget?.index === index ? dropTarget.position : undefined}
            />
          </div>
        ))}
      </nav>

      {/* Theme toggle */}
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
      </div>
    </aside>
  );
}
