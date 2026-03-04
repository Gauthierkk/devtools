import { create } from "zustand";

export interface RegexFlags {
  global: boolean;
  caseInsensitive: boolean;
  multiline: boolean;
  dotAll: boolean;
}

interface RegexToolState {
  pattern: string;
  flags: RegexFlags;
  testString: string;
  replacePattern: string;

  setPattern: (pattern: string) => void;
  toggleFlag: (flag: keyof RegexFlags) => void;
  setTestString: (testString: string) => void;
  setReplacePattern: (replacePattern: string) => void;
}

export const useRegexToolStore = create<RegexToolState>()((set) => ({
  pattern: "",
  flags: {
    global: true,
    caseInsensitive: false,
    multiline: false,
    dotAll: false,
  },
  testString: "",
  replacePattern: "",

  setPattern: (pattern) => set({ pattern }),
  toggleFlag: (flag) =>
    set((state) => ({
      flags: { ...state.flags, [flag]: !state.flags[flag] },
    })),
  setTestString: (testString) => set({ testString }),
  setReplacePattern: (replacePattern) => set({ replacePattern }),
}));

export function buildFlagString(flags: RegexFlags): string {
  let s = "";
  if (flags.global) s += "g";
  if (flags.caseInsensitive) s += "i";
  if (flags.multiline) s += "m";
  if (flags.dotAll) s += "s";
  return s;
}

export interface MatchResult {
  index: number;
  match: string;
  groups: string[];
  namedGroups: Record<string, string>;
  start: number;
  end: number;
}

export function computeMatches(
  pattern: string,
  flags: RegexFlags,
  testString: string,
): { matches: MatchResult[]; error: string | null } {
  if (!pattern) return { matches: [], error: null };

  try {
    const flagStr = buildFlagString(flags);
    const regex = new RegExp(pattern, flagStr);

    const matches: MatchResult[] = [];

    if (flags.global) {
      let i = 0;
      for (const m of testString.matchAll(regex)) {
        matches.push({
          index: i++,
          match: m[0],
          groups: m.slice(1).filter((g) => g !== undefined),
          namedGroups: m.groups ? { ...m.groups } : {},
          start: m.index!,
          end: m.index! + m[0].length,
        });
      }
    } else {
      const m = regex.exec(testString);
      if (m) {
        matches.push({
          index: 0,
          match: m[0],
          groups: m.slice(1).filter((g) => g !== undefined),
          namedGroups: m.groups ? { ...m.groups } : {},
          start: m.index!,
          end: m.index! + m[0].length,
        });
      }
    }

    return { matches, error: null };
  } catch (e) {
    return { matches: [], error: (e as Error).message };
  }
}
