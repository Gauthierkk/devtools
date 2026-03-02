import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getModules } from "../../lib/module-registry";
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
}: {
  icon: ReactNode;
  label?: string;
  title?: string;
  isExpanded: boolean;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={isExpanded ? undefined : title}
      className={`flex h-9 items-center gap-2.5 rounded-md px-2 transition-colors duration-150 ${
        isExpanded ? "" : "justify-center"
      } ${
        isActive
          ? "bg-bg-surface-active text-text-primary"
          : "text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
      }`}
    >
      {icon}
      {isExpanded && label && <span className="truncate text-sm">{label}</span>}
    </button>
  );
}

export default function Sidebar() {
  const modules = getModules();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, cycleTheme } = useThemeStore();
  const [isExpanded, setIsExpanded] = useState(false);

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
        {modules.map((mod) => (
          <SidebarButton
            key={mod.id}
            icon={<Icon name={mod.icon} size={18} className="shrink-0" />}
            label={mod.name}
            title={mod.name}
            isExpanded={isExpanded}
            isActive={location.pathname === mod.route}
            onClick={() => navigate(mod.route)}
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
