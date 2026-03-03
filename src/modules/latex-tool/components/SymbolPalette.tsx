import { useMemo, memo } from "react";
import katex from "katex";
import { SYMBOL_CATEGORIES, type LatexSymbol } from "../latex-symbols";
import { useLatexToolStore } from "../store";

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
  const { activeCategory, setActiveCategory } = useLatexToolStore();

  const currentCategory = useMemo(
    () => SYMBOL_CATEGORIES.find((c) => c.id === activeCategory) ?? SYMBOL_CATEGORIES[0],
    [activeCategory],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Category tabs — scrollable horizontally */}
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border-default p-1.5 pb-0">
        {SYMBOL_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`shrink-0 rounded-t px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === cat.id
                ? "bg-bg-primary text-text-primary border border-b-0 border-border-default"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Symbol grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-wrap gap-0.5">
          {currentCategory.symbols.map((symbol) => (
            <SymbolButton key={symbol.command + symbol.display} symbol={symbol} onInsert={onInsert} />
          ))}
        </div>
      </div>
    </div>
  );
}
