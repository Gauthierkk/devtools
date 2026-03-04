import { useState, useMemo } from "react";
import Icon from "../../../components/ui/Icon";
import { buildFlagString, type RegexFlags } from "../store";

interface ReplacePanelProps {
  pattern: string;
  flags: RegexFlags;
  testString: string;
  replacePattern: string;
  onChangeReplacePattern: (value: string) => void;
}

export default function ReplacePanel({
  pattern,
  flags,
  testString,
  replacePattern,
  onChangeReplacePattern,
}: ReplacePanelProps) {
  const [copied, setCopied] = useState(false);

  const replacedOutput = useMemo(() => {
    if (!pattern || !replacePattern) return null;
    try {
      const regex = new RegExp(pattern, buildFlagString(flags));
      return testString.replace(regex, replacePattern);
    } catch {
      return null;
    }
  }, [pattern, flags, testString, replacePattern]);

  const handleCopy = async () => {
    if (replacedOutput == null) return;
    await navigator.clipboard.writeText(replacedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <input
        type="text"
        value={replacePattern}
        onChange={(e) => onChangeReplacePattern(e.target.value)}
        placeholder="Replacement pattern..."
        spellCheck={false}
        className="w-full rounded-md border border-border-default bg-bg-primary px-2.5 py-1.5 font-mono text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
      />

      {replacedOutput != null && replacePattern && (
        <div className="relative rounded-md border border-border-default bg-bg-primary p-2.5">
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-text-secondary">
            {replacedOutput}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute right-1.5 top-1.5 rounded p-1 text-text-tertiary hover:bg-bg-surface-hover hover:text-text-primary"
            title="Copy result"
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
