import { useRef, useState, useMemo, memo, type DragEvent } from "react";
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

export default function SymbolPalette({ onInsert }: SymbolPaletteProps) {
  const { openCategories, toggleCategory, categoryOrder, setCategoryOrder } =
    useLatexToolStore();
  const orderedCategories = getOrderedCategories(SYMBOL_CATEGORIES, categoryOrder);

  const dragIdx = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    index: number;
    position: "above" | "below";
  } | null>(null);

  function handleDragStart(e: DragEvent, index: number) {
    dragIdx.current = index;
    e.dataTransfer.effectAllowed = "move";
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

    if (fromIndex < toIndex) {
      toIndex -= 1;
    }

    if (fromIndex !== toIndex) {
      const newOrder = orderedCategories.map((c) => c.id);
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      setCategoryOrder(newOrder);
    }

    dragIdx.current = null;
    setDropTarget(null);
  }

  function handleDragEnd() {
    dragIdx.current = null;
    setDropTarget(null);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {orderedCategories.map((cat, index) => {
        const isOpen = openCategories.has(cat.id);
        const isDragOver = dropTarget?.index === index;
        const dragPosition = isDragOver ? dropTarget.position : undefined;

        return (
          <div
            key={cat.id}
            className="relative border-b border-border-default last:border-b-0"
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          >
            {isDragOver && dragPosition === "above" && (
              <span className="absolute top-0 right-1 left-1 z-10 h-0.5 -translate-y-px rounded bg-accent" />
            )}

            {/* Section header */}
            <button
              onClick={() => toggleCategory(cat.id)}
              className="flex w-full cursor-grab items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-bg-surface-hover active:cursor-grabbing"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {cat.name}
              </span>
              <Icon
                name="chevron-right"
                size={12}
                className={`shrink-0 text-text-tertiary transition-transform duration-200 ${
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
  );
}
