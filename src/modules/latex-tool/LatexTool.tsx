import { useRef, useState, useCallback } from "react";
import { useLatexToolStore } from "./store";
import SymbolPalette from "./components/SymbolPalette";
import LatexPreview from "./components/LatexPreview";
import Icon from "../../components/ui/Icon";

function CopyBlock({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  }, [content]);

  return (
    <div className="flex items-center gap-2 rounded border border-border-default bg-bg-surface px-3 py-2">
      <span className="shrink-0 text-xs font-medium text-text-tertiary w-14">{label}</span>
      <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-text-primary">
        {content}
      </code>
      <button
        onClick={handleCopy}
        title="Copy to clipboard"
        className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
          copied
            ? "text-success"
            : "text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
        }`}
      >
        <Icon name={copied ? "check" : "copy"} size={13} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function LatexTool() {
  const { latex, setLatex, clearLatex } = useLatexToolStore();
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Insert symbol at cursor position, place cursor inside first {} if present
  const handleInsert = useCallback(
    (command: string) => {
      const ta = editorRef.current;
      if (!ta) return;

      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newLatex = latex.slice(0, start) + command + latex.slice(end);
      setLatex(newLatex);

      // Determine where to place cursor after insertion
      const firstBrace = command.indexOf("{}");
      const cursorOffset = firstBrace !== -1 ? start + firstBrace + 1 : start + command.length;

      // Restore focus and set cursor
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(cursorOffset, cursorOffset);
      });
    },
    [latex, setLatex],
  );

  const inlineLatex = `$${latex}$`;
  const displayLatex = `$$${latex}$$`;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Symbol palette */}
      <div className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border-default">
        <div className="flex h-[42px] shrink-0 items-center border-b border-border-default px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Symbols
          </span>
        </div>
        <SymbolPalette onInsert={handleInsert} />
      </div>

      {/* Right: Editor + Preview + Copy blocks */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-border-default px-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            LaTeX Editor
          </span>
          <button
            onClick={clearLatex}
            className="text-xs text-text-tertiary transition-colors hover:text-text-secondary"
          >
            Clear
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Input */}
          <div className="border-b border-border-default p-4">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Input
            </label>
            <textarea
              ref={editorRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="Type LaTeX or click symbols to build your expression…"
              spellCheck={false}
              rows={4}
              className="w-full resize-none rounded border border-border-default bg-bg-surface px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
          </div>

          {/* Rendered preview */}
          <div className="border-b border-border-default p-4">
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Preview
            </label>
            <LatexPreview latex={latex} />
          </div>

          {/* Copyable LaTeX blocks */}
          <div className="p-4">
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Copy
            </label>
            <div className="flex flex-col gap-2">
              <CopyBlock label="$" content={inlineLatex} />
              <CopyBlock label="$$" content={displayLatex} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
