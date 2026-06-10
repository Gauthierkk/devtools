import { useCallback, useRef, memo } from "react";
import { useJsonToolStore } from "../store";
import { extractErrorPosition } from "../commands";

export default function Editor() {
  const { content, validationError, setContent, setValidationError } =
    useJsonToolStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setContent(value);

      try {
        JSON.parse(value);
        setValidationError(null);
      } catch (err) {
        const { line, column } = extractErrorPosition(err as Error, value);
        setValidationError({ message: (err as Error).message, line, column });
      }
    },
    [setContent, setValidationError],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          content.substring(0, start) + "  " + content.substring(end);
        setContent(newValue);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [content, setContent],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--editor-bg)]">
      <div className="flex h-full">
        <LineNumbers
          lineCount={countLines(content)}
          errorLine={validationError?.line ?? 0}
        />
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="h-full flex-1 resize-none bg-transparent p-3 pl-2 font-mono text-[13px] leading-5 text-[var(--text-primary)] outline-none"
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  );
}

// Count newlines without allocating an array of every line
function countLines(content: string): number {
  let count = 1;
  for (let i = content.indexOf("\n"); i !== -1; i = content.indexOf("\n", i + 1)) {
    count++;
  }
  return count;
}

// Memoized on primitives: the gutter only re-renders when the line count or
// error line changes, not on every keystroke
const LineNumbers = memo(function LineNumbers({
  lineCount,
  errorLine,
}: {
  lineCount: number;
  errorLine: number;
}) {
  return (
    <div className="flex flex-col bg-[var(--editor-gutter)] py-3 px-3 text-right font-mono text-[13px] leading-5 select-none">
      {Array.from({ length: lineCount }, (_, i) => {
        const lineNum = i + 1;
        const isError = errorLine > 0 && lineNum === errorLine;
        return (
          <span
            key={i}
            className={isError ? "text-danger font-bold" : "text-[var(--text-tertiary)]"}
            title={isError ? `Error on line ${lineNum}` : undefined}
          >
            {lineNum}
          </span>
        );
      })}
    </div>
  );
});
