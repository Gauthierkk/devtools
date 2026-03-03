import { useMemo, memo } from "react";
import katex from "katex";
import { SYMBOL_CATEGORIES, type LatexSymbol } from "../latex-symbols";
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

interface SymbolPaletteProps {
  onInsert: (command: string) => void;
}

export default function SymbolPalette({ onInsert }: SymbolPaletteProps) {
  const { openCategories, toggleCategory } = useLatexToolStore();

  return (
    <div className="flex-1 overflow-y-auto">
      {SYMBOL_CATEGORIES.map((cat) => {
        const isOpen = openCategories.has(cat.id);

        return (
          <div key={cat.id} className="border-b border-border-default last:border-b-0">
            {/* Section header */}
            <button
              onClick={() => toggleCategory(cat.id)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-bg-surface-hover"
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
          </div>
        );
      })}
    </div>
  );
}
