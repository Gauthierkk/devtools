import { useRef, useState, useMemo, memo, useEffect, type MouseEvent } from "react";
import katex from "katex";
import { SYMBOL_CATEGORIES, type LatexSymbol, type SymbolCategory } from "../latex-symbols";
import { useLatexToolStore } from "../store";
import Icon from "../../../components/ui/Icon";

interface SymbolButtonProps {
  symbol: LatexSymbol;
  onInsert: (command: string) => void;
}

const SymbolButton = memo(function SymbolButton({ symbol, onInsert }: SymbolButtonProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(symbol.display, {
        throwOnError: false,
        displayMode: false,
        output: "html",
      });
    } catch {
      return `<span>${symbol.display}</span>`;
    }
  }, [symbol.display]);

  return (
    <button
      onClick={() => onInsert(symbol.command)}
      title={symbol.description}
      aria-label={symbol.description}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-[11px] transition-colors hover:bg-bg-surface-hover hover:text-text-primary text-text-secondary"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

function getOrderedCategories(
  categories: readonly SymbolCategory[],
  savedOrder: string[],
): SymbolCategory[] {
  if (savedOrder.length === 0) return [...categories];

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const ordered: SymbolCategory[] = [];

  for (const id of savedOrder) {
    const cat = catMap.get(id);
    if (cat) {
      ordered.push(cat);
      catMap.delete(id);
    }
  }

  // Append any new categories not in the saved order
  for (const cat of catMap.values()) {
    ordered.push(cat);
  }

  return ordered;
}

interface SymbolPaletteProps {
  onInsert: (command: string) => void;
}

const DRAG_THRESHOLD = 4;

export default function SymbolPalette({ onInsert }: SymbolPaletteProps) {
  const { openCategories, toggleCategory, collapseAllCategories, expandAllCategories, enabledCategories, toggleEnabledCategory, categoryOrder, setCategoryOrder } =
    useLatexToolStore();
  const allOrderedCategories = getOrderedCategories(SYMBOL_CATEGORIES, categoryOrder);
  const orderedCategories = allOrderedCategories.filter((c) => enabledCategories.has(c.id));

  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFilter) return;
    function handleClick(e: globalThis.MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showFilter]);

  const dragState = useRef<{ index: number; startY: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dropTargetRef = useRef<{ index: number; position: "above" | "below" } | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    index: number;
    position: "above" | "below";
  } | null>(null);

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
        const items = document.querySelectorAll("[data-latex-category]");
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
          const newOrder = orderedCategories.map((c) => c.id);
          const [moved] = newOrder.splice(fromIndex, 1);
          newOrder.splice(toIndex, 0, moved);
          setCategoryOrder(newOrder);
        }
      } else if (dragState.current) {
        // No drag — treat as click (toggle category)
        toggleCategory(orderedCategories[dragState.current.index].id);
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

  const allCollapsed = openCategories.size === 0;
  const hasHidden = enabledCategories.size < SYMBOL_CATEGORIES.length;

  return (
    <div className="flex flex-col overflow-hidden flex-1">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border-default px-2 py-1.5">
        <button
          onClick={expandAllCategories}
          disabled={openCategories.size === orderedCategories.length}
          className="rounded px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          Expand all
        </button>
        <span className="text-text-tertiary">·</span>
        <button
          onClick={collapseAllCategories}
          disabled={allCollapsed}
          className="rounded px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          Collapse all
        </button>
        <span className="text-text-tertiary">·</span>
        <div ref={filterRef} className="relative">
          <button
            onClick={() => setShowFilter((v) => !v)}
            title="Filter categories"
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors hover:bg-bg-surface-hover ${showFilter || hasHidden ? "text-accent" : "text-text-secondary hover:text-text-primary"}`}
          >
            <Icon name="list-filter" size={12} />
            {hasHidden && (
              <span className="tabular-nums">{enabledCategories.size}/{SYMBOL_CATEGORIES.length}</span>
            )}
          </button>
          {showFilter && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border-default bg-bg-surface shadow-lg">
              <div className="max-h-64 overflow-y-auto py-1">
                {allOrderedCategories.map((cat) => {
                  const enabled = enabledCategories.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleEnabledCategory(cat.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-bg-surface-hover"
                    >
                      <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${enabled ? "border-accent bg-accent text-white" : "border-border-default"}`}>
                        {enabled && <Icon name="check" size={10} />}
                      </span>
                      <span className={enabled ? "text-text-primary" : "text-text-tertiary"}>
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
      {orderedCategories.map((cat, index) => {
        const isOpen = openCategories.has(cat.id);
        const isDragOver = dropTarget?.index === index;
        const dragPosition = isDragOver ? dropTarget.position : undefined;
        const isBeingDragged = draggingIndex === index;

        return (
          <div
            key={cat.id}
            data-latex-category
            className={`relative border-b border-border-default last:border-b-0 ${isBeingDragged ? "opacity-50" : ""}`}
          >
            {isDragOver && dragPosition === "above" && (
              <span className="absolute top-0 right-1 left-1 z-10 h-0.5 -translate-y-px rounded bg-accent" />
            )}

            {/* Section header */}
            <button
              onMouseDown={(e) => handleMouseDown(e, index)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left select-none transition-colors hover:bg-bg-surface-hover ${isBeingDragged ? "cursor-grabbing" : "cursor-grab"}`}
            >
              <Icon name="grip" size={12} className="shrink-0 text-text-tertiary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {cat.name}
              </span>
              <Icon
                name="chevron-right"
                size={12}
                className={`ml-auto shrink-0 text-text-tertiary transition-transform duration-200 ${
                  isOpen ? "rotate-90" : ""
                }`}
              />
            </button>

            {/* Symbol grid */}
            {isOpen && (
              <div className="px-2 pb-2">
                <div className="flex flex-wrap gap-0.5">
                  {cat.symbols.map((symbol) => (
                    <SymbolButton
                      key={symbol.command + symbol.display}
                      symbol={symbol}
                      onInsert={onInsert}
                    />
                  ))}
                </div>
              </div>
            )}

            {isDragOver && dragPosition === "below" && (
              <span className="absolute right-1 bottom-0 left-1 z-10 h-0.5 translate-y-px rounded bg-accent" />
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
