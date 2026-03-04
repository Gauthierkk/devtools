import { useRef, useEffect, useCallback } from "react";
import type { MatchResult } from "../store";

const MATCH_COLORS = [
  "var(--accent)",
  "var(--syntax-string)",
  "var(--syntax-number)",
  "var(--syntax-boolean)",
  "var(--syntax-key)",
];

interface MatchHighlighterProps {
  testString: string;
  matches: MatchResult[];
  onChangeTestString: (value: string) => void;
}

export default function MatchHighlighter({
  testString,
  matches,
  onChangeTestString,
}: MatchHighlighterProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.addEventListener("scroll", syncScroll);
    return () => ta.removeEventListener("scroll", syncScroll);
  }, [syncScroll]);

  function buildHighlightedSegments() {
    if (matches.length === 0) {
      return [{ text: testString, highlight: false, colorIndex: 0 }];
    }

    const segments: {
      text: string;
      highlight: boolean;
      colorIndex: number;
    }[] = [];
    let lastEnd = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m.start > lastEnd) {
        segments.push({
          text: testString.slice(lastEnd, m.start),
          highlight: false,
          colorIndex: 0,
        });
      }
      segments.push({
        text: testString.slice(m.start, m.end),
        highlight: true,
        colorIndex: i % MATCH_COLORS.length,
      });
      lastEnd = m.end;
    }

    if (lastEnd < testString.length) {
      segments.push({
        text: testString.slice(lastEnd),
        highlight: false,
        colorIndex: 0,
      });
    }

    return segments;
  }

  const segments = buildHighlightedSegments();

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Highlight backdrop */}
      <div
        ref={backdropRef}
        className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-relaxed text-transparent"
        aria-hidden
      >
        {segments.map((seg, i) =>
          seg.highlight ? (
            <mark
              key={i}
              className="rounded-sm text-transparent"
              style={{
                backgroundColor: `color-mix(in srgb, ${MATCH_COLORS[seg.colorIndex]} 25%, transparent)`,
                boxShadow: `0 0 0 1px color-mix(in srgb, ${MATCH_COLORS[seg.colorIndex]} 50%, transparent)`,
              }}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
        {/* Extra line to match textarea sizing */}
        {"\n"}
      </div>

      {/* Actual textarea */}
      <textarea
        ref={textareaRef}
        value={testString}
        onChange={(e) => onChangeTestString(e.target.value)}
        placeholder="Enter test string..."
        spellCheck={false}
        className="relative h-full w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed text-text-primary caret-text-primary outline-none placeholder:text-text-tertiary"
      />
    </div>
  );
}
