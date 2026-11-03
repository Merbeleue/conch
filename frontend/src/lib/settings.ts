import { DEFAULT_THEME, isThemeId, type ThemeId } from "./themes";

const STORAGE_KEY = "conch.settings.v1";

export type FontFamilyId = "sfmono" | "jetbrains" | "menlo" | "monaco" | "system";
export type CursorStyle = "block" | "bar" | "underline";

export interface FontFamilyChoice {
  id: FontFamilyId;
  label: string;
  /** Full CSS stack: the named family first, then reliable mono fallbacks. */
  stack: string;
}

export const FONT_FAMILIES: FontFamilyChoice[] = [
  {
    id: "sfmono",
    label: "SF Mono",
    stack: '"SF Mono", "JetBrains Mono", Menlo, ui-monospace, monospace',
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", "SF Mono", Menlo, ui-monospace, monospace',
  },
  {
    id: "menlo",
    label: "Menlo",
    stack: 'Menlo, "SF Mono", ui-monospace, monospace',
  },
  {
    id: "monaco",
    label: "Monaco",
    stack: 'Monaco, "SF Mono", ui-monospace, monospace',
  },
  {
    id: "system",
    label: "System Mono",
    stack: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
];

export const CURSOR_STYLES: { id: CursorStyle; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "block", label: "Block" },
  { id: "underline", label: "Underline" },
];

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 20;
export const DEFAULT_FONT_SIZE = 13;

/** App-wide preferences. The stored object is kept open so new keys can join. */
export interface AppSettings {
  theme: ThemeId;
  fontFamily: FontFamilyId;
  fontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
}

type StoredSettings = Record<string, unknown>;

function readStored(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredSettings) : {};
  } catch {
    return {};
  }
}

export function fontStackFor(id: FontFamilyId): string {
  return (FONT_FAMILIES.find((font) => font.id === id) ?? FONT_FAMILIES[0]).stack;
}

function isFontFamily(value: unknown): value is FontFamilyId {
  return FONT_FAMILIES.some((font) => font.id === value);
}

function isCursorStyle(value: unknown): value is CursorStyle {
  return CURSOR_STYLES.some((style) => style.id === value);
}

export function clampFontSize(value: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

export function loadSettings(): AppSettings {
  const stored = readStored();
  return {
    theme: isThemeId(stored.theme) ? stored.theme : DEFAULT_THEME,
    fontFamily: isFontFamily(stored.fontFamily) ? stored.fontFamily : "sfmono",
    fontSize:
      typeof stored.fontSize === "number" && Number.isFinite(stored.fontSize)
        ? clampFontSize(stored.fontSize)
        : DEFAULT_FONT_SIZE,
    cursorStyle: isCursorStyle(stored.cursorStyle) ? stored.cursorStyle : "bar",
    cursorBlink: typeof stored.cursorBlink === "boolean" ? stored.cursorBlink : true,
  };
}

/** Merges a patch into the stored object and returns the normalized settings. */
export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const stored: StoredSettings = { ...readStored(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can be unavailable; the choice still applies to this session.
  }
  return loadSettings();
}
