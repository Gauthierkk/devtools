import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface LatexPreviewProps {
  latex: string;
}

export default function LatexPreview({ latex }: LatexPreviewProps) {
  const { html, error } = useMemo(() => {
    if (!latex.trim()) {
      return { html: null, error: null };
    }
    try {
      const rendered = katex.renderToString(latex, {
        throwOnError: true,
        displayMode: true,
        output: "html",
        trust: false,
      });
      return { html: rendered, error: null };
    } catch (e) {
      // Fall back to non-throwing render so we still show something
      try {
        const rendered = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: true,
          output: "html",
        });
        return { html: rendered, error: null };
      } catch {
        return { html: null, error: (e as Error).message };
      }
    }
  }, [latex]);

  if (!latex.trim()) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-tertiary">Preview will appear here</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2">
        <p className="text-xs font-medium text-danger">Parse error</p>
        <p className="mt-1 text-xs text-text-secondary font-mono">{error}</p>
      </div>
    );
  }

  return (
    <div
      className="latex-preview flex min-h-16 items-center justify-center overflow-x-auto rounded border border-border-default bg-bg-surface px-4 py-4"
      // KaTeX output is sanitized by the library itself
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html ?? "" }}
    />
  );
}
