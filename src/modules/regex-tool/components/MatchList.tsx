import { useState } from "react";
import Icon from "../../../components/ui/Icon";
import type { MatchResult } from "../store";

interface MatchListProps {
  matches: MatchResult[];
}

export default function MatchList({ matches }: MatchListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (matches.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-text-tertiary">
        No matches
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-default">
      {matches.map((m) => {
        const hasGroups =
          m.groups.length > 0 || Object.keys(m.namedGroups).length > 0;
        const isExpanded = expandedIndex === m.index;

        return (
          <div key={m.index} className="px-3 py-2">
            <button
              className="flex w-full items-center gap-2 text-left"
              onClick={() =>
                setExpandedIndex(isExpanded ? null : m.index)
              }
            >
              {hasGroups && (
                <Icon
                  name={isExpanded ? "chevron-down" : "chevron-right"}
                  size={12}
                  className="shrink-0 text-text-tertiary"
                />
              )}
              <span className="text-xs text-text-tertiary">
                {m.index + 1}.
              </span>
              <span className="flex-1 truncate font-mono text-xs text-text-primary">
                {m.match}
              </span>
              <span className="text-[10px] text-text-tertiary">
                {m.start}:{m.end}
              </span>
            </button>

            {isExpanded && hasGroups && (
              <div className="ml-5 mt-1.5 space-y-1">
                {m.groups.map((g, gi) => (
                  <div key={gi} className="flex items-baseline gap-2">
                    <span className="text-[10px] text-text-tertiary">
                      ${gi + 1}
                    </span>
                    <span className="font-mono text-xs text-text-secondary">
                      {g}
                    </span>
                  </div>
                ))}
                {Object.entries(m.namedGroups).map(([name, val]) => (
                  <div key={name} className="flex items-baseline gap-2">
                    <span className="text-[10px] text-text-tertiary">
                      {name}
                    </span>
                    <span className="font-mono text-xs text-text-secondary">
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
