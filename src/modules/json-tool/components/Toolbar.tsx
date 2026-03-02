import { useState, useRef, useEffect } from "react";
import { useJsonToolStore, type ViewMode } from "../store";
import { openJsonFile, saveJsonFile, formatJson, validateJson } from "../commands";
import Icon from "../../../components/ui/Icon";

const viewOptions: { mode: ViewMode; icon: string; label: string }[] = [
  { mode: "editor", icon: "code", label: "Editor" },
  { mode: "tree", icon: "tree", label: "Tree" },
  { mode: "split", icon: "columns-2", label: "Split" },
];

export default function Toolbar() {
  const {
    content,
    filePath,
    isDirty,
    viewMode,
    validationError,
    setContent,
    setFilePath,
    setViewMode,
    setValidationError,
    markClean,
  } = useJsonToolStore();

  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [lastTransform, setLastTransform] = useState<"format" | "minify">("format");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setViewDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [viewDropdownOpen]);

  const handleOpen = async () => {
    try {
      const result = await openJsonFile();
      if (result) {
        setContent(result.content);
        setFilePath(result.path);
        markClean();
        setValidationError(null);
      }
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  };

  const handleSave = async () => {
    try {
      const path = await saveJsonFile(content, filePath);
      if (path) {
        setFilePath(path);
        markClean();
      }
    } catch (e) {
      console.error("Failed to save file:", e);
    }
  };

  const handleFormat = () => {
    try {
      const formatted = formatJson(content);
      setContent(formatted);
      setValidationError(null);
      setLastTransform("format");
    } catch (e) {
      setValidationError({ message: (e as Error).message, line: 0, column: 0 });
    }
  };

  const handleMinify = () => {
    try {
      const minified = formatJson(content, 0);
      setContent(minified);
      setValidationError(null);
      setLastTransform("minify");
    } catch (e) {
      setValidationError({ message: (e as Error).message, line: 0, column: 0 });
    }
  };

  const handleValidate = () => {
    const result = validateJson(content);
    if (result.valid) {
      setValidationError(null);
    } else {
      setValidationError({
        message: result.error ?? "Invalid JSON",
        line: result.line ?? 0,
        column: result.column ?? 0,
      });
    }
  };

  const currentView = viewOptions.find((o) => o.mode === viewMode)!;

  return (
    <div className="flex h-11 items-center gap-0.5 border-b border-border-default bg-bg-surface px-3">
      {/* File actions */}
      <ToolbarButton icon="folder-open" label="Open" shortcut="Cmd+O" onClick={handleOpen} />
      <ToolbarButton icon="save" label="Save" shortcut="Cmd+S" onClick={handleSave} />

      <Separator />

      {/* Validate — sits in front of transform actions */}
      <ToolbarButton icon="check" label="Validate" onClick={handleValidate} />

      <Separator />

      {/* Format / Minify segmented toggle — clicking either side applies it */}
      <div className="flex items-center rounded-md bg-bg-primary p-0.5">
        <button
          onClick={handleFormat}
          className={`flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors duration-150 ${
            lastTransform === "format"
              ? "bg-bg-surface text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <Icon name="wand" size={14} />
          <span>Format</span>
        </button>
        <button
          onClick={handleMinify}
          className={`flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors duration-150 ${
            lastTransform === "minify"
              ? "bg-bg-surface text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <Icon name="minimize" size={14} />
          <span>Minify</span>
        </button>
      </div>

      <Separator />

      {/* View mode dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary transition-colors duration-150 hover:bg-bg-surface-hover hover:text-text-primary"
        >
          <Icon name={currentView.icon} size={14} />
          <span>{currentView.label}</span>
          <Icon name="chevron-down" size={12} />
        </button>
        {viewDropdownOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[110px] overflow-hidden rounded-md border border-border-default bg-bg-surface shadow-lg">
            {viewOptions.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => {
                  setViewMode(opt.mode);
                  setViewDropdownOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-bg-surface-hover ${
                  viewMode === opt.mode
                    ? "bg-bg-surface-active text-text-primary"
                    : "text-text-secondary"
                }`}
              >
                <Icon name={opt.icon} size={14} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status */}
      <div className="flex items-center gap-3 pr-2">
        {filePath && (
          <span className="max-w-[300px] truncate text-xs text-text-tertiary" title={filePath}>
            {filePath.split("/").pop()}
            {isDirty && " (modified)"}
          </span>
        )}

        {validationError && (
          <span className="flex items-center gap-1 text-xs text-danger">
            <Icon name="alert-circle" size={14} />
            Invalid JSON
          </span>
        )}

        {!validationError && content.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-success">
            <Icon name="check" size={14} />
            Valid
          </span>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary transition-colors duration-150 hover:bg-bg-surface-hover hover:text-text-primary"
    >
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );
}

function Separator() {
  return <div className="mx-2 h-4 w-px bg-border-default" />;
}
