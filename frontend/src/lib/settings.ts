import { isWindows } from "./platform";
import {
  DEFAULT_HIGHLIGHT,
  HIGHLIGHT_RULES,
  type HighlightRuleId,
  type HighlightSettings,
} from "./highlight";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "./themes";

const STORAGE_KEY = "conch.settings.v1";

export type FontFamilyId =
  | "sfmono"
  | "jetbrains"
  | "menlo"
  | "monaco"
  | "system"
  | "cascadia"
  | "cascadiacode"
  | "consolas"
  | "courier";
export type CursorStyle = "block" | "bar" | "underline";

export interface FontFamilyChoice {
  id: FontFamilyId;
  label: string;
  /** Full CSS stack: the named family first, then reliable mono fallbacks. */
  stack: string;
  /**
   * False when the family is not guaranteed to be installed, so the picker has
   * to measure it before offering it. A terminal font that silently falls back
   * to another one is indistinguishable from a setting that does nothing.
   */
  shipped?: boolean;
}

// Every family here is monospace; mixing in a proportional one would break
// xterm.js' cell grid. macOS lists stay as they were: all of them already
// worked, so none is hidden by measurement.
const MAC_FONT_FAMILIES: FontFamilyChoice[] = [
  {
    id: "sfmono",
    label: "SF Mono",
    stack: '"SF Mono", "JetBrains Mono", Menlo, ui-monospace, monospace',
    shipped: true,
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", "SF Mono", Menlo, ui-monospace, monospace',
    shipped: true,
  },
  {
    id: "menlo",
    label: "Menlo",
    stack: "Menlo, \"SF Mono\", ui-monospace, monospace",
    shipped: true,
  },
  {
    id: "monaco",
    label: "Monaco",
    stack: "Monaco, \"SF Mono\", ui-monospace, monospace",
    shipped: true,
  },
  {
    id: "system",
    label: "System Mono",
    stack: 'ui-monospace, "SF Mono", Menlo, monospace',
    shipped: true,
  },
];

// Windows ships Consolas and Courier New on every install. The Cascadia family
// comes with Windows 11 and with Windows Terminal, so an older or trimmed-down
// system may not have it; JetBrains Mono is only ever there by choice.
const WINDOWS_FONT_FAMILIES: FontFamilyChoice[] = [
  {
    id: "cascadia",
    label: "Cascadia Mono",
    stack: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
    shipped: false,
  },
  {
    id: "cascadiacode",
    label: "Cascadia Code",
    stack: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
    shipped: false,
  },
  {
    id: "jetbrains",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
    shipped: false,
  },
  {
    id: "consolas",
    label: "Consolas",
    stack: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    shipped: true,
  },
  {
    id: "courier",
    label: "Courier New",
    stack: '"Courier New", Consolas, monospace',
    shipped: true,
  },
];

const DEFAULT_FONT_FAMILY: FontFamilyId = isWindows ? "cascadia" : "sfmono";

/** A family Chromium always has, used as the measuring baseline. */
const FALLBACK_ONLY = isWindows ? "Consolas, monospace" : "monospace";

/**
 * True when the stack's first family is present. Measured by width: the probe
 * re-uses the stack's own tail as the baseline, so a missing family paints the
 * baseline and the two widths match. Only the first family is tested — later
 * entries in the stack are fallbacks, and a different-looking fallback would
 * read as a false positive.
 */
function isFontInstalled(stack: string): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) {
    return true;
  }
  // Long enough that two different mono fonts disagree on the total width.
  const text = "@@@@@@@@@@@@@@@@@@@@@@@@@@@#%&$WiEr|/\\<>";
  const family = stack.split(",")[0].trim();
  ctx.font = `72px ${FALLBACK_ONLY}`;
  const baseline = ctx.measureText(text).width;
  ctx.font = `72px ${family}, ${FALLBACK_ONLY}`;
  return Math.abs(ctx.measureText(text).width - baseline) > 0.5;
}

export const CURSOR_STYLES: { id: CursorStyle; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "block", label: "Block" },
  { id: "underline", label: "Underline" },
];

/**
 * The families this machine can actually draw. Optional ones are measured
 * because a dead entry in the picker reads as a broken setting: the terminal
 * silently repaints in the fallback font and nothing appears to change.
 */
export const FONT_FAMILIES: FontFamilyChoice[] = (
  isWindows ? WINDOWS_FONT_FAMILIES : MAC_FONT_FAMILIES
).filter((font) => font.shipped !== false || isFontInstalled(font.stack));

/** The first choice is the fallback when a stored id is not offered here. */
export const DEFAULT_FONT: FontFamilyChoice =
  FONT_FAMILIES.find((font) => font.id === DEFAULT_FONT_FAMILY) ?? FONT_FAMILIES[0];

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 20;
export const DEFAULT_FONT_SIZE = 13;

/**
 * What a session announces as $TERM. The value is the TERM name itself, because
 * that is what travels to the host: the server looks it up in its own terminfo
 * and decides from it whether to emit 256-colour codes, cursor jumps or nothing
 * but newlines. Ordered from richest to plainest, which is also how the picker
 * reads: step down when a host does not know the entry above.
 */
export interface TerminalTypeChoice {
  id: string;
  label: string;
  hint: string;
}

export const TERMINAL_TYPES: TerminalTypeChoice[] = [
  {
    id: "xterm-256color",
    label: "xterm-256color",
    hint: "256 colours, modern default",
  },
  {
    id: "xterm",
    label: "xterm",
    hint: "16 colours, classic",
  },
  {
    id: "linux",
    label: "linux",
    hint: "8 colours, console keys",
  },
  {
    id: "ansi",
    label: "ansi",
    hint: "Colour, no layout control",
  },
  {
    id: "vt220",
    label: "vt220",
    hint: "No colour, cursor control",
  },
  {
    id: "vt100",
    label: "vt100",
    hint: "Oldest — routers and switches",
  },
];

export const DEFAULT_TERMINAL_TYPE = TERMINAL_TYPES[0].id;

/** App-wide preferences. The stored object is kept open so new keys can join. */
export interface AppSettings {
  theme: ThemeId;
  fontFamily: FontFamilyId;
  fontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  highlight: HighlightSettings;
  /** TERM announced to every new session; see TERMINAL_TYPES. */
  terminalType: string;
  /** Right-click in a terminal pastes the clipboard instead of doing nothing. */
  rightClickPaste: boolean;
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
  return (FONT_FAMILIES.find((font) => font.id === id) ?? DEFAULT_FONT).stack;
}

function isFontFamily(value: unknown): value is FontFamilyId {
  return FONT_FAMILIES.some((font) => font.id === value);
}

function isCursorStyle(value: unknown): value is CursorStyle {
  return CURSOR_STYLES.some((style) => style.id === value);
}

/** Only the listed types are offered, so anything else in storage falls back. */
export function isTerminalType(value: unknown): value is string {
  return TERMINAL_TYPES.some((type) => type.id === value);
}

export function clampFontSize(value: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

/**
 * A stored colour, or the default for that rule. Only `#rrggbb` is accepted: a
 * half-written or named colour would reach the ANSI encoder and paint black.
 */
function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeHighlight(value: unknown): HighlightSettings {
  const stored = value && typeof value === "object" ? (value as StoredSettings) : {};
  const colors = stored.colors && typeof stored.colors === "object"
    ? (stored.colors as StoredSettings)
    : {};
  const next: Record<HighlightRuleId, string> = { ...DEFAULT_HIGHLIGHT.colors };
  for (const rule of HIGHLIGHT_RULES) {
    const storedColor = colors[rule.id];
    if (isHexColor(storedColor)) {
      next[rule.id] = storedColor.toLowerCase();
    }
  }
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_HIGHLIGHT.enabled,
    colors: next,
  };
}

export function loadSettings(): AppSettings {
  const stored = readStored();
  return {
    theme: isThemeId(stored.theme) ? stored.theme : DEFAULT_THEME,
    fontFamily: isFontFamily(stored.fontFamily) ? stored.fontFamily : DEFAULT_FONT.id,
    fontSize:
      typeof stored.fontSize === "number" && Number.isFinite(stored.fontSize)
        ? clampFontSize(stored.fontSize)
        : DEFAULT_FONT_SIZE,
    cursorStyle: isCursorStyle(stored.cursorStyle) ? stored.cursorStyle : "bar",
    cursorBlink: typeof stored.cursorBlink === "boolean" ? stored.cursorBlink : true,
    highlight: normalizeHighlight(stored.highlight),
    terminalType: isTerminalType(stored.terminalType)
      ? stored.terminalType
      : DEFAULT_TERMINAL_TYPE,
    rightClickPaste:
      typeof stored.rightClickPaste === "boolean" ? stored.rightClickPaste : false,
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
