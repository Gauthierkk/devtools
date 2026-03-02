import { useState, useMemo, useCallback, memo, type ReactNode } from "react";
import { useJsonToolStore } from "../store";
import Icon from "../../../components/ui/Icon";

// ---------------------------------------------------------------------------
// Line map: maps "dot.separated.path" → 1-indexed line in the formatted JSON
// ---------------------------------------------------------------------------
function buildLineMap(content: string): Map<string, number> {
  const result = new Map<string, number>();
  try {
    const parsed = JSON.parse(content);
    const formatted = JSON.stringify(parsed, null, 2);
    const lines = formatted.split("\n");
    // stack entries: [key, depth]
    const stack: Array<[string, number]> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const depth = Math.floor((line.match(/^(\s*)/)?.[1].length ?? 0) / 2);
      const trimmed = line.trim();

      // Only match lines that have a "key": pattern
      const m = trimmed.match(/^"((?:[^"\\]|\\.)*)"\s*:/);
      if (!m) continue;

      const key = m[1];

      // Pop stack entries at the same depth or deeper (we've left that scope)
      while (stack.length > 0 && stack[stack.length - 1][1] >= depth) {
        stack.pop();
      }

      const path = [...stack.map(([k]) => k), key].join(".");
      result.set(path, i + 1);

      // If the value opens a container, push so children inherit this path
      const rest = trimmed.slice(m[0].length).trim().replace(/,$/, "").trim();
      if (rest === "{" || rest === "[") {
        stack.push([key, depth]);
      }
    }
  } catch {
    // Invalid JSON — return empty map
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function getTypeLabel(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") return "dict";
  if (typeof value === "string") return "str";
  if (typeof value === "number") return "num";
  if (typeof value === "boolean") return "bool";
  return typeof value;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function LineNumCell({ num }: { num: number | undefined }) {
  return (
    <div className="w-9 shrink-0 self-stretch flex items-center justify-end px-2 bg-[var(--editor-gutter)] font-mono text-[13px] text-[var(--text-tertiary)] select-none border-r border-[var(--border)]">
      {num ?? ""}
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  str: "var(--syntax-string)",
  num: "var(--syntax-number)",
  bool: "var(--syntax-boolean)",
  null: "var(--syntax-null)",
  dict: "var(--syntax-key)",
  list: "var(--syntax-bracket)",
};

function TypeCell({ label }: { label: string | null }) {
  // Extract base type from labels like "list[3]"
  const baseType = label?.replace(/\[.*\]$/, "") ?? "";
  const color = TYPE_COLORS[baseType] ?? "var(--text-tertiary)";
  return (
    <div className="w-[52px] shrink-0 self-stretch flex items-center px-2 bg-[var(--bg-primary)] border-r border-[var(--border)]">
      {label && (
        <span
          style={{ color }}
          className="font-mono text-[11px] opacity-80 leading-none"
        >
          {label}
        </span>
      )}
    </div>
  );
}

function ContentCell({
  depth,
  children,
}: {
  depth: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{ paddingLeft: depth * 14 + 6 }}
      className="flex flex-1 items-center min-w-0 pr-2 gap-1"
    >
      {children}
    </div>
  );
}

function ValueDisplay({ value, type }: { value: unknown; type: string }) {
  switch (type) {
    case "string":
      return (
        <span className="text-[var(--syntax-string)] truncate">
          &quot;{String(value)}&quot;
        </span>
      );
    case "number":
      return (
        <span className="text-[var(--syntax-number)]">{String(value)}</span>
      );
    case "boolean":
      return (
        <span className="text-[var(--syntax-boolean)]">{String(value)}</span>
      );
    case "null":
      return <span className="text-[var(--syntax-null)]">null</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

// ---------------------------------------------------------------------------
// TreeNode — renders as React fragments so left columns stay flush
// ---------------------------------------------------------------------------
interface TreeNodeProps {
  value: unknown;
  keyName: string | number | null;
  depth: number;
  isRoot?: boolean;
  isLast?: boolean;
  path: string;
  lineMap: Map<string, number>;
  showLineNumbers: boolean;
  isArrayItem: boolean;
}

const TreeNode = memo(function TreeNode({
  value,
  keyName,
  depth,
  isRoot = false,
  isLast = true,
  path,
  lineMap,
  showLineNumbers,
  isArrayItem,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);

  const type = getType(value);
  const isExpandable = type === "object" || type === "array";
  const typeLabel = getTypeLabel(value);
  const lineNum = path ? lineMap.get(path) : undefined;

  const handleCopy = useCallback(() => {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text);
  }, [value]);

  const entries = useMemo(
    () =>
      isExpandable
        ? type === "array"
          ? (value as unknown[]).map((v, i) => ({
              key: String(i),
              val: v,
              childPath: path ? `${path}.${i}` : String(i),
            }))
          : Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
              key: k,
              val: v,
              childPath: path ? `${path}.${k}` : k,
            }))
        : [],
    [isExpandable, type, value, path],
  );

  const bracket = type === "array" ? ["[", "]"] : ["{", "}"];

  return (
    <>
      {/* This node's row */}
      <div className="group flex items-stretch min-h-[20px] hover:bg-[var(--bg-surface-hover)] transition-colors duration-75">
        {showLineNumbers && <LineNumCell num={lineNum} />}
        {/* Show type for object keys only; array items (0, 1, 2…) get an empty cell */}
        <TypeCell label={isArrayItem ? null : typeLabel} />
        <ContentCell depth={depth}>
          {/* Expand/collapse toggle */}
          {isExpandable ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <Icon
                name={expanded ? "chevron-down" : "chevron-right"}
                size={12}
              />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {/* Key */}
          {!isRoot && keyName !== null && (
            <>
              <span className="text-[var(--syntax-key)] shrink-0">
                {typeof keyName === "number" ? keyName : `"${keyName}"`}
              </span>
              <span className="text-[var(--text-tertiary)] shrink-0 mr-0.5">
                :
              </span>
            </>
          )}

          {/* Value */}
          {isExpandable ? (
            <>
              <span className="text-[var(--syntax-bracket)] shrink-0">
                {bracket[0]}
              </span>
              {!expanded && (
                <>
                  <span className="text-[var(--text-tertiary)] mx-1">
                    ...
                  </span>
                  <span className="text-[var(--syntax-bracket)] shrink-0">
                    {bracket[1]}
                  </span>
                  <span className="ml-1.5 text-[10px] text-[var(--text-tertiary)]">
                    {entries.length} {entries.length === 1 ? "item" : "items"}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <ValueDisplay value={value} type={type} />
              {!isLast && (
                <span className="text-[var(--text-tertiary)] shrink-0">,</span>
              )}
            </>
          )}

          {/* Copy button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity duration-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0"
            title="Copy"
          >
            <Icon name="copy" size={12} />
          </button>
        </ContentCell>
      </div>

      {/* Children */}
      {isExpandable && expanded && (
        <>
          {entries.map(({ key, val, childPath }, i) => (
            <TreeNode
              key={key}
              keyName={key}
              value={val}
              depth={depth + 1}
              isRoot={false}
              isLast={i === entries.length - 1}
              path={childPath}
              lineMap={lineMap}
              showLineNumbers={showLineNumbers}
              isArrayItem={type === "array"}
            />
          ))}

          {/* Closing bracket row */}
          <div className="flex items-stretch min-h-[20px]">
            {showLineNumbers && <LineNumCell num={undefined} />}
            <TypeCell label={null} />
            <ContentCell depth={depth}>
              <span className="w-4 shrink-0" />
              <span className="text-[var(--syntax-bracket)]">{bracket[1]}</span>
              {!isLast && (
                <span className="text-[var(--text-tertiary)]">,</span>
              )}
            </ContentCell>
          </div>
        </>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export default function TreeView({
  showLineNumbers = false,
}: {
  showLineNumbers?: boolean;
}) {
  const { content } = useJsonToolStore();

  const { parsed, lineMap } = useMemo(() => {
    try {
      const data = JSON.parse(content);
      return { parsed: data, lineMap: buildLineMap(content) };
    } catch {
      return { parsed: null, lineMap: new Map<string, number>() };
    }
  }, [content]);

  if (parsed === null) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center">
          <Icon
            name="alert-circle"
            size={24}
            className="mx-auto mb-2 text-danger"
          />
          <p className="text-sm text-[var(--text-secondary)]">
            Cannot render tree view
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Fix JSON errors to see the tree
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto font-mono text-[13px] leading-5 flex flex-col">
      <TreeNode
        value={parsed}
        keyName={null}
        depth={0}
        isRoot
        isLast
        path=""
        lineMap={lineMap}
        showLineNumbers={showLineNumbers}
        isArrayItem={false}
      />
      {/* Filler extends column backgrounds to the bottom of the container */}
      <div className="flex flex-1">
        {showLineNumbers && (
          <div className="w-9 shrink-0 bg-[var(--editor-gutter)] border-r border-[var(--border)]" />
        )}
        <div className="w-[52px] shrink-0 bg-[var(--bg-primary)] border-r border-[var(--border)]" />
        <div className="flex-1" />
      </div>
    </div>
  );
}
