import { useMemo } from "react";
import {
  useRegexToolStore,
  computeMatches,
  type RegexFlags,
} from "./store";
import MatchHighlighter from "./components/MatchHighlighter";
import MatchList from "./components/MatchList";
import ReplacePanel from "./components/ReplacePanel";

const FLAG_LABELS: { key: keyof RegexFlags; label: string; title: string }[] = [
  { key: "global", label: "g", title: "Global" },
  { key: "caseInsensitive", label: "i", title: "Case insensitive" },
  { key: "multiline", label: "m", title: "Multiline" },
  { key: "dotAll", label: "s", title: "Dot matches newline" },
];

export default function RegexTool() {
  const {
    pattern,
    flags,
    testString,
    replacePattern,
    setPattern,
    toggleFlag,
    setTestString,
    setReplacePattern,
  } = useRegexToolStore();

  const { matches, error } = useMemo(
    () => computeMatches(pattern, flags, testString),
    [pattern, flags, testString],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-border-default px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Regex
        </span>

        <div className="mx-2 h-4 w-px bg-border-default" />

        {/* Flags */}
        <div className="flex items-center gap-1">
          {FLAG_LABELS.map(({ key, label, title }) => (
            <button
              key={key}
              onClick={() => toggleFlag(key)}
              title={title}
              className={`flex h-6 w-6 items-center justify-center rounded text-xs font-semibold transition-colors duration-75 ${
                flags[key]
                  ? "bg-accent text-accent-text"
                  : "text-text-tertiary hover:bg-bg-surface-hover hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Match count / error */}
        <div className="ml-auto flex items-center gap-2">
          {error ? (
            <span className="text-xs text-danger">{error}</span>
          ) : (
            pattern && (
              <span className="text-xs text-text-tertiary">
                {matches.length} match{matches.length !== 1 ? "es" : ""}
              </span>
            )
          )}
        </div>
      </div>

      {/* Pattern input */}
      <div className="flex shrink-0 items-center border-b border-border-default">
        <span className="pl-4 font-mono text-sm text-text-tertiary">/</span>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="pattern"
          spellCheck={false}
          className="flex-1 bg-transparent px-1 py-2.5 font-mono text-sm text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <span className="pr-4 font-mono text-sm text-text-tertiary">/</span>
      </div>

      {/* Main content: test string + results panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Test string with highlights */}
        <div className="flex flex-1 border-r border-border-default">
          <MatchHighlighter
            testString={testString}
            matches={matches}
            onChangeTestString={setTestString}
          />
        </div>

        {/* Right panel: matches + replace */}
        <div className="flex w-80 shrink-0 flex-col overflow-hidden">
          {/* Match list */}
          <div className="flex-1 overflow-auto border-b border-border-default">
            <div className="sticky top-0 z-10 border-b border-border-default bg-bg-surface px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                Matches
              </span>
            </div>
            <MatchList matches={matches} />
          </div>

          {/* Replace panel */}
          <div className="shrink-0">
            <div className="border-b border-border-default bg-bg-surface px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                Replace
              </span>
            </div>
            <ReplacePanel
              pattern={pattern}
              flags={flags}
              testString={testString}
              replacePattern={replacePattern}
              onChangeReplacePattern={setReplacePattern}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
