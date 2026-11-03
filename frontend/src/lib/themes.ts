import type { ITheme } from "@xterm/xterm";

export type ThemeScheme = "dark" | "light";

export type ThemeId =
  | "conch"
  | "tide"
  | "grove"
  | "nebula"
  | "graphite"
  | "dawn"
  | "paper"
  | "mist";

export interface ThemePalette {
  bg: string;
  bgRgb: string;
  panel: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  borderStrong: string;
  /** Base color for translucent highlights laid over the background. */
  overlayRgb: string;
  /** Base color for shadows and recessed wells. */
  inkRgb: string;
  shadowA1: string;
  shadowA2: string;
  shadowA3: string;
  recess: string;
  recessSoft: string;
  recessStrong: string;
  accent: string;
  accentRgb: string;
  accentStrong: string;
  accentInk: string;
  accentInkRgb: string;
  danger: string;
  dangerRgb: string;
  dangerText: string;
  dangerTextStrong: string;
  dangerMuted: string;
  ok: string;
  okRgb: string;
  termBg: string;
  termFg: string;
  wellRgb: string;
  placeholder: string;
  dotRing: string;
  menuTop: string;
  menuBottom: string;
  glowA: string;
  glowB: string;
}

export interface ThemePreview {
  bg: string;
  panel: string;
  accent: string;
  glow: string;
  text: string;
  muted: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  scheme: ThemeScheme;
  palette: ThemePalette;
  preview: ThemePreview;
  terminal: ITheme;
}

const DARK_DANGER = {
  danger: "#ff8080",
  dangerRgb: "255, 128, 128",
  dangerText: "#ffb3b3",
  dangerTextStrong: "#ffd0d0",
  dangerMuted: "#db8b91",
};

const LIGHT_DANGER = {
  danger: "#c44a4a",
  dangerRgb: "196, 74, 74",
  dangerText: "#a63030",
  dangerTextStrong: "#832222",
  dangerMuted: "#b26a6a",
};

/** Shared chrome tokens for the dark family. */
const DARK_SURFACES = {
  text: "#eef1f7",
  muted: "#8d96a8",
  faint: "#5c6475",
  border: "rgba(255, 255, 255, 0.07)",
  borderStrong: "rgba(255, 255, 255, 0.13)",
  overlayRgb: "255, 255, 255",
  inkRgb: "0, 0, 0",
  shadowA1: "0.18",
  shadowA2: "0.45",
  shadowA3: "0.55",
  recess: "rgba(0, 0, 0, 0.28)",
  recessSoft: "rgba(0, 0, 0, 0.14)",
  recessStrong: "rgba(0, 0, 0, 0.35)",
};

/** Chrome tokens for a daylight theme, built from its ink tint. */
function lightSurfaces(input: {
  inkRgb: string;
  text: string;
  muted: string;
  faint: string;
  border: number;
  borderStrong: number;
}) {
  return {
    text: input.text,
    muted: input.muted,
    faint: input.faint,
    border: `rgba(${input.inkRgb}, ${input.border})`,
    borderStrong: `rgba(${input.inkRgb}, ${input.borderStrong})`,
    overlayRgb: input.inkRgb,
    inkRgb: input.inkRgb,
    shadowA1: "0.07",
    shadowA2: "0.1",
    shadowA3: "0.15",
    recess: `rgba(${input.inkRgb}, 0.055)`,
    recessSoft: `rgba(${input.inkRgb}, 0.035)`,
    recessStrong: `rgba(${input.inkRgb}, 0.09)`,
  };
}

const CONCH: ThemePalette = {
  bg: "#07090d",
  bgRgb: "7, 9, 13",
  panel: "#0d1118",
  ...DARK_SURFACES,
  accent: "#e9b98e",
  accentRgb: "233, 185, 142",
  accentStrong: "#f3cba5",
  accentInk: "#20150d",
  accentInkRgb: "32, 21, 13",
  ...DARK_DANGER,
  ok: "#7ee2b8",
  okRgb: "126, 226, 184",
  termBg: "#0b0e14",
  termFg: "#d7dbe4",
  wellRgb: "8, 10, 15",
  placeholder: "#4d5465",
  dotRing: "#0b0d12",
  menuTop: "#181c27",
  menuBottom: "#0d1017",
  glowA: "rgba(86, 120, 170, 0.1)",
  glowB: "rgba(196, 128, 82, 0.09)",
};

const TIDE: ThemePalette = {
  bg: "#060a0f",
  bgRgb: "6, 10, 15",
  panel: "#0b1219",
  ...DARK_SURFACES,
  accent: "#82c8e8",
  accentRgb: "130, 200, 232",
  accentStrong: "#a9e1f7",
  accentInk: "#04171f",
  accentInkRgb: "4, 23, 31",
  ...DARK_DANGER,
  ok: "#6fe0c8",
  okRgb: "111, 224, 200",
  termBg: "#071018",
  termFg: "#d3e3ee",
  wellRgb: "6, 13, 20",
  placeholder: "#465866",
  dotRing: "#071018",
  menuTop: "#12202c",
  menuBottom: "#0a131b",
  glowA: "rgba(64, 132, 196, 0.13)",
  glowB: "rgba(40, 168, 170, 0.08)",
};

const GROVE: ThemePalette = {
  bg: "#060a08",
  bgRgb: "6, 10, 8",
  panel: "#0c1410",
  ...DARK_SURFACES,
  accent: "#93d7a9",
  accentRgb: "147, 215, 169",
  accentStrong: "#bceccb",
  accentInk: "#07170e",
  accentInkRgb: "7, 23, 14",
  ...DARK_DANGER,
  ok: "#7ee2b8",
  okRgb: "126, 226, 184",
  termBg: "#07110d",
  termFg: "#d5e7dc",
  wellRgb: "6, 12, 9",
  placeholder: "#496052",
  dotRing: "#07110d",
  menuTop: "#121f18",
  menuBottom: "#0a120e",
  glowA: "rgba(60, 150, 110, 0.12)",
  glowB: "rgba(170, 150, 80, 0.06)",
};

const NEBULA: ThemePalette = {
  bg: "#08070e",
  bgRgb: "8, 7, 14",
  panel: "#100d18",
  ...DARK_SURFACES,
  accent: "#c4a6f2",
  accentRgb: "196, 166, 242",
  accentStrong: "#ddc7ff",
  accentInk: "#150b24",
  accentInkRgb: "21, 11, 36",
  ...DARK_DANGER,
  ok: "#7ee2c0",
  okRgb: "126, 226, 192",
  termBg: "#0b0813",
  termFg: "#ded6ec",
  wellRgb: "9, 7, 15",
  placeholder: "#5c5470",
  dotRing: "#0b0813",
  menuTop: "#1b1728",
  menuBottom: "#0f0c18",
  glowA: "rgba(120, 86, 200, 0.14)",
  glowB: "rgba(200, 90, 150, 0.07)",
};

const GRAPHITE: ThemePalette = {
  bg: "#08090b",
  bgRgb: "8, 9, 11",
  panel: "#111318",
  ...DARK_SURFACES,
  accent: "#c3cedd",
  accentRgb: "195, 206, 221",
  accentStrong: "#e2e9f3",
  accentInk: "#10151c",
  accentInkRgb: "16, 21, 28",
  ...DARK_DANGER,
  ok: "#7ee2b8",
  okRgb: "126, 226, 184",
  termBg: "#0b0d10",
  termFg: "#d8dce3",
  wellRgb: "9, 10, 12",
  placeholder: "#565c66",
  dotRing: "#0b0d10",
  menuTop: "#181a1f",
  menuBottom: "#0e0f13",
  glowA: "rgba(120, 140, 170, 0.08)",
  glowB: "rgba(150, 150, 160, 0.05)",
};

const DAWN: ThemePalette = {
  bg: "#f6eee2",
  bgRgb: "246, 238, 226",
  panel: "#fffaf2",
  ...lightSurfaces({
    inkRgb: "64, 50, 36",
    text: "#2b241c",
    muted: "#756a5c",
    faint: "#9c9081",
    border: 0.14,
    borderStrong: 0.24,
  }),
  accent: "#b45f33",
  accentRgb: "180, 95, 51",
  accentStrong: "#8f4723",
  accentInk: "#fff8f1",
  accentInkRgb: "255, 248, 241",
  ...LIGHT_DANGER,
  ok: "#2f8b66",
  okRgb: "47, 139, 102",
  termBg: "#fbf5ec",
  termFg: "#3a3229",
  wellRgb: "235, 224, 209",
  placeholder: "#ab9e8d",
  dotRing: "#f6eee2",
  menuTop: "#fffdf8",
  menuBottom: "#f6eee1",
  glowA: "rgba(216, 148, 94, 0.16)",
  glowB: "rgba(126, 158, 174, 0.1)",
};

const PAPER: ThemePalette = {
  bg: "#f3f2ee",
  bgRgb: "243, 242, 238",
  panel: "#fdfcfa",
  ...lightSurfaces({
    inkRgb: "44, 49, 54",
    text: "#23272b",
    muted: "#6b7076",
    faint: "#979ca2",
    border: 0.14,
    borderStrong: 0.24,
  }),
  accent: "#4f5a64",
  accentRgb: "79, 90, 100",
  accentStrong: "#333d46",
  accentInk: "#fbfcfd",
  accentInkRgb: "251, 252, 253",
  ...LIGHT_DANGER,
  ok: "#2f7d62",
  okRgb: "47, 125, 98",
  termBg: "#fbfaf6",
  termFg: "#2c3136",
  wellRgb: "233, 232, 226",
  placeholder: "#a5a7a6",
  dotRing: "#f3f2ee",
  menuTop: "#ffffff",
  menuBottom: "#f4f3ef",
  glowA: "rgba(140, 148, 155, 0.12)",
  glowB: "rgba(190, 180, 160, 0.1)",
};

const MIST: ThemePalette = {
  bg: "#edf2f6",
  bgRgb: "237, 242, 246",
  panel: "#fbfdff",
  ...lightSurfaces({
    inkRgb: "37, 55, 72",
    text: "#1f2a33",
    muted: "#61707c",
    faint: "#8e9aa4",
    border: 0.13,
    borderStrong: 0.22,
  }),
  accent: "#3d6f9c",
  accentRgb: "61, 111, 156",
  accentStrong: "#2a557c",
  accentInk: "#f7fbff",
  accentInkRgb: "247, 251, 255",
  ...LIGHT_DANGER,
  ok: "#2a8468",
  okRgb: "42, 132, 104",
  termBg: "#f7fafc",
  termFg: "#24313a",
  wellRgb: "226, 233, 239",
  placeholder: "#9aa6af",
  dotRing: "#edf2f6",
  menuTop: "#ffffff",
  menuBottom: "#f0f4f8",
  glowA: "rgba(104, 152, 196, 0.18)",
  glowB: "rgba(96, 166, 156, 0.1)",
};

function previewOf(palette: ThemePalette): ThemePreview {
  return {
    bg: palette.bg,
    panel: palette.menuTop,
    accent: palette.accent,
    glow: `rgba(${palette.accentRgb}, 0.26)`,
    text: palette.text,
    muted: palette.muted,
  };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "conch",
    name: "Conch",
    tagline: "Warm amber on deep sea navy",
    scheme: "dark",
    palette: CONCH,
    preview: previewOf(CONCH),
    terminal: {
      background: CONCH.termBg,
      foreground: CONCH.termFg,
      cursor: CONCH.accent,
      cursorAccent: CONCH.termBg,
      selectionBackground: `rgba(${CONCH.accentRgb}, 0.24)`,
      black: "#1b1f2a",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#dcdfe4",
      brightBlack: "#5c6370",
      brightRed: "#ef7b85",
      brightGreen: "#a9d189",
      brightYellow: "#f0cf8b",
      brightBlue: "#7cc0f5",
      brightMagenta: "#d896e8",
      brightCyan: "#6fcbd6",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "tide",
    name: "Tide",
    tagline: "Cool cyan drawn from open water",
    scheme: "dark",
    palette: TIDE,
    preview: previewOf(TIDE),
    terminal: {
      background: TIDE.termBg,
      foreground: TIDE.termFg,
      cursor: TIDE.accent,
      cursorAccent: TIDE.termBg,
      selectionBackground: `rgba(${TIDE.accentRgb}, 0.24)`,
      black: "#16232e",
      red: "#ef7a82",
      green: "#7bd8a6",
      yellow: "#e7c07d",
      blue: "#79b8f3",
      magenta: "#b79cf0",
      cyan: "#64d6d6",
      white: "#d5e2ec",
      brightBlack: "#4f6878",
      brightRed: "#ff96a0",
      brightGreen: "#96e8bb",
      brightYellow: "#f5d49a",
      brightBlue: "#9dcdf8",
      brightMagenta: "#cdb6ff",
      brightCyan: "#86e6e6",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "grove",
    name: "Grove",
    tagline: "Soft mint on deep forest shade",
    scheme: "dark",
    palette: GROVE,
    preview: previewOf(GROVE),
    terminal: {
      background: GROVE.termBg,
      foreground: GROVE.termFg,
      cursor: GROVE.accent,
      cursorAccent: GROVE.termBg,
      selectionBackground: `rgba(${GROVE.accentRgb}, 0.24)`,
      black: "#17251f",
      red: "#e57b7e",
      green: "#8fd6a0",
      yellow: "#ddc27f",
      blue: "#7ab8dc",
      magenta: "#c496d8",
      cyan: "#66c9b4",
      white: "#d6e4db",
      brightBlack: "#536b5f",
      brightRed: "#f09497",
      brightGreen: "#ace9ba",
      brightYellow: "#eed69a",
      brightBlue: "#99cdea",
      brightMagenta: "#d9b2e8",
      brightCyan: "#85dfca",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "nebula",
    name: "Nebula",
    tagline: "Violet dusk with a lilac glow",
    scheme: "dark",
    palette: NEBULA,
    preview: previewOf(NEBULA),
    terminal: {
      background: NEBULA.termBg,
      foreground: NEBULA.termFg,
      cursor: NEBULA.accent,
      cursorAccent: NEBULA.termBg,
      selectionBackground: `rgba(${NEBULA.accentRgb}, 0.26)`,
      black: "#211b2d",
      red: "#ee7c8a",
      green: "#8ad6a8",
      yellow: "#e6c181",
      blue: "#85b4ee",
      magenta: "#c79cf2",
      cyan: "#6ccbd8",
      white: "#ded8e8",
      brightBlack: "#605772",
      brightRed: "#ff97a2",
      brightGreen: "#a6e8bd",
      brightYellow: "#f2d49b",
      brightBlue: "#a4c8f7",
      brightMagenta: "#dcbaff",
      brightCyan: "#8adde6",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "graphite",
    name: "Graphite",
    tagline: "Quiet silver for low-light focus",
    scheme: "dark",
    palette: GRAPHITE,
    preview: previewOf(GRAPHITE),
    terminal: {
      background: GRAPHITE.termBg,
      foreground: GRAPHITE.termFg,
      cursor: GRAPHITE.accent,
      cursorAccent: GRAPHITE.termBg,
      selectionBackground: `rgba(${GRAPHITE.accentRgb}, 0.24)`,
      black: "#1e2228",
      red: "#e1737c",
      green: "#8fc99a",
      yellow: "#dcc17f",
      blue: "#86abd0",
      magenta: "#b69bcb",
      cyan: "#74c2c6",
      white: "#d8dce3",
      brightBlack: "#5b636e",
      brightRed: "#f08b93",
      brightGreen: "#a9ddb2",
      brightYellow: "#ecd49a",
      brightBlue: "#a3c2e0",
      brightMagenta: "#ceb4e0",
      brightCyan: "#8dd8db",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "dawn",
    name: "Dawn",
    tagline: "Warm daylight with terracotta ink",
    scheme: "light",
    palette: DAWN,
    preview: previewOf(DAWN),
    terminal: {
      background: DAWN.termBg,
      foreground: DAWN.termFg,
      cursor: DAWN.accent,
      cursorAccent: DAWN.termBg,
      selectionBackground: `rgba(${DAWN.accentRgb}, 0.2)`,
      black: "#3a3229",
      red: "#b3453a",
      green: "#4f7a3c",
      yellow: "#8f6c17",
      blue: "#356a91",
      magenta: "#8a4b83",
      cyan: "#2d7373",
      white: "#efe6d9",
      brightBlack: "#8a7e70",
      brightRed: "#c65a4d",
      brightGreen: "#5f8f4a",
      brightYellow: "#a37e22",
      brightBlue: "#447da6",
      brightMagenta: "#9d5c96",
      brightCyan: "#3a8787",
      brightWhite: "#fffdf8",
    },
  },
  {
    id: "paper",
    name: "Paper",
    tagline: "Quiet paper white with graphite ink",
    scheme: "light",
    palette: PAPER,
    preview: previewOf(PAPER),
    terminal: {
      background: PAPER.termBg,
      foreground: PAPER.termFg,
      cursor: PAPER.accent,
      cursorAccent: PAPER.termBg,
      selectionBackground: `rgba(${PAPER.accentRgb}, 0.18)`,
      black: "#2c3136",
      red: "#b23a3a",
      green: "#4b7a3f",
      yellow: "#8a6a1f",
      blue: "#3a6693",
      magenta: "#7e4a7c",
      cyan: "#2f7377",
      white: "#eceae4",
      brightBlack: "#7f858a",
      brightRed: "#c45454",
      brightGreen: "#5e9050",
      brightYellow: "#a18138",
      brightBlue: "#4d7aa8",
      brightMagenta: "#956091",
      brightCyan: "#40878b",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "mist",
    name: "Mist",
    tagline: "Cool morning haze with slate blue",
    scheme: "light",
    palette: MIST,
    preview: previewOf(MIST),
    terminal: {
      background: MIST.termBg,
      foreground: MIST.termFg,
      cursor: MIST.accent,
      cursorAccent: MIST.termBg,
      selectionBackground: `rgba(${MIST.accentRgb}, 0.2)`,
      black: "#24313a",
      red: "#b04a4a",
      green: "#3f7a5f",
      yellow: "#8a6c26",
      blue: "#336a9e",
      magenta: "#7a4f8e",
      cyan: "#2a7480",
      white: "#e8eef2",
      brightBlack: "#73828d",
      brightRed: "#c25c5c",
      brightGreen: "#4f8f72",
      brightYellow: "#9c7c33",
      brightBlue: "#4783b8",
      brightMagenta: "#8f639f",
      brightCyan: "#3b8795",
      brightWhite: "#ffffff",
    },
  },
];

export const DEFAULT_THEME: ThemeId = "conch";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((theme) => theme.id === value);
}

/** Resolves a stored theme id; empty or unknown values fall back to the default. */
export function themeFor(id: ThemeId | "" | null | undefined): ThemeDefinition {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

const CSS_VAR_SOURCES: Array<[string, keyof ThemePalette]> = [
  ["--bg", "bg"],
  ["--bg-rgb", "bgRgb"],
  ["--panel", "panel"],
  ["--text", "text"],
  ["--muted", "muted"],
  ["--faint", "faint"],
  ["--border", "border"],
  ["--border-strong", "borderStrong"],
  ["--overlay-rgb", "overlayRgb"],
  ["--ink-rgb", "inkRgb"],
  ["--shadow-a1", "shadowA1"],
  ["--shadow-a2", "shadowA2"],
  ["--shadow-a3", "shadowA3"],
  ["--recess", "recess"],
  ["--recess-soft", "recessSoft"],
  ["--recess-strong", "recessStrong"],
  ["--accent", "accent"],
  ["--accent-rgb", "accentRgb"],
  ["--accent-strong", "accentStrong"],
  ["--accent-ink", "accentInk"],
  ["--accent-ink-rgb", "accentInkRgb"],
  ["--danger", "danger"],
  ["--danger-rgb", "dangerRgb"],
  ["--danger-text", "dangerText"],
  ["--danger-text-strong", "dangerTextStrong"],
  ["--danger-muted", "dangerMuted"],
  ["--ok", "ok"],
  ["--ok-rgb", "okRgb"],
  ["--term-bg", "termBg"],
  ["--term-fg", "termFg"],
  ["--well-rgb", "wellRgb"],
  ["--placeholder", "placeholder"],
  ["--dot-ring", "dotRing"],
  ["--menu-top", "menuTop"],
  ["--menu-bottom", "menuBottom"],
  ["--glow-a", "glowA"],
  ["--glow-b", "glowB"],
];

/** Pushes a palette onto the document so every surface and control follows it. */
export function applyTheme(id: ThemeId): void {
  const theme = themeFor(id);
  const { palette } = theme;
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.scheme = theme.scheme;
  root.style.colorScheme = theme.scheme;
  for (const [name, key] of CSS_VAR_SOURCES) {
    root.style.setProperty(name, palette[key]);
  }
  root.style.setProperty("--accent-soft", `rgba(${palette.accentRgb}, 0.12)`);
}
