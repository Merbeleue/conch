/**
 * Keyword highlighting for terminal output.
 *
 * The colouring is done by writing real ANSI escapes into the byte stream on its
 * way to xterm, so the terminal stays the single source of truth for what is on
 * screen: nothing is re-rendered, and copy/paste keeps selecting plain text (the
 * escapes are never part of the selection). The trade-off is that a colour change
 * only affects output from that moment on, never the scrollback already drawn.
 */

export type HighlightRuleId =
  | "error"
  | "warning"
  | "ok"
  | "info"
  | "debug"
  | "network";

export interface HighlightSettings {
  enabled: boolean;
  /** `#rrggbb` per rule. */
  colors: Record<HighlightRuleId, string>;
}

export interface HighlightRuleChoice {
  id: HighlightRuleId;
  label: string;
  /** What the rule matches, for the settings row. */
  hint: string;
  /** Shown in the row's swatch preview. */
  sample: string;
}

export const HIGHLIGHT_RULES: HighlightRuleChoice[] = [
  { id: "error", label: "Error", hint: "Failures, faults and denials", sample: "ERROR" },
  { id: "warning", label: "Warning", hint: "Risks and deprecated usage", sample: "WARNING" },
  { id: "ok", label: "OK", hint: "Success, readiness and completion", sample: "OK" },
  { id: "info", label: "Info", hint: "Status words that are neither good nor bad", sample: "INFO" },
  { id: "debug", label: "Debug", hint: "Diagnostic chatter", sample: "DEBUG" },
  { id: "network", label: "IP address & MAC", hint: "v4, v6 and link addresses", sample: "192.168.1.10" },
];

export const DEFAULT_HIGHLIGHT_COLORS: Record<HighlightRuleId, string> = {
  error: "#e5534b",
  warning: "#d9a441",
  ok: "#5fb85f",
  info: "#58a6ff",
  debug: "#a97fd8",
  network: "#e07fc0",
};

/** Colours the picker offers as one click. */
export const COLOR_PRESETS = [
  "#e5534b",
  "#f2615a",
  "#e9b374",
  "#d9a441",
  "#e8c14c",
  "#5fb85f",
  "#3fa66f",
  "#58a6ff",
  "#4cc4d9",
  "#7c8cf8",
  "#a97fd8",
  "#e07fc0",
  "#f78fb3",
  "#9aa4b2",
];

export const DEFAULT_HIGHLIGHT: HighlightSettings = {
  enabled: true,
  colors: { ...DEFAULT_HIGHLIGHT_COLORS },
};

const ERROR_WORDS = [
  "segmentation fault",
  "core dumped",
  "timed out",
  "traceback",
  "unauthorized",
  "unreachable",
  "permission denied",
  "connection refused",
  "exception",
  "critical",
  "failures",
  "failure",
  "failed",
  "aborted",
  "abort",
  "timeout",
  "errors",
  "error",
  "fatal",
  "panic",
  "denied",
  "refused",
  "err",
  "fail",
];

const WARNING_WORDS = [
  "deprecation",
  "deprecated",
  "warnings",
  "warning",
  "caution",
  "suspicious",
  "warn",
];

const OK_WORDS = [
  "successfully",
  "successful",
  "verification",
  "connected",
  "completed",
  "complete",
  "listening",
  "verified",
  "healthy",
  "success",
  "enabled",
  "passed",
  "running",
  "online",
  "active",
  "ready",
  "okay",
  "done",
  "ok",
];

const INFO_WORDS = [
  "information",
  "notices",
  "notice",
  "status",
  "notes",
  "debugged",
  "hint",
  "note",
  "info",
  "tip",
];

const DEBUG_WORDS = ["debugging", "verbose", "debug", "tracing", "trace", "dbg"];

/** Capture-group order, which is the alternation order below. */
const RULE_BY_GROUP: HighlightRuleId[] = [
  "error",
  "warning",
  "ok",
  "info",
  "debug",
  "network",
  "network",
  "network",
];

/** Groups 6, 7 and 8 are all the network rule, split to tell their boundaries apart. */
const ADDRESS_KIND = ["ipv6", "ipv4", "mac"] as const;

type AddressKind = (typeof ADDRESS_KIND)[number];

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest first, so "core dumped" wins over a shorter word inside it. */
function words(list: string[]): string {
  return [...list]
    .sort((a, b) => b.length - a.length)
    .map(escapeWord)
    .join("|");
}

const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;

/**
 * The dot belongs to the repeated group as a whole. Left inside the alternation it
 * is read as part of only its last branch, and then any three-digit octet matches
 * without its dot and the address falls apart.
 */
const IPV4 = `(?:${OCTET}\\.){3}${OCTET}`;

const H4 = String.raw`[0-9a-fA-F]{1,4}`;

/**
 * Textual IPv6: the eight-group form plus every `::` compression. Deliberately no
 * CIDR suffix and no zone id, and every alternative needs either eight groups or a
 * real `::` — so a clock reading like `12:34:56` stays plain text.
 *
 * Order matters to a leftmost-first engine: a form that ends at `::` would otherwise
 * win inside a longer address and paint "fe80::" of "fe80::1", so the alternatives
 * that consume a final group come first and the trailing-compression ones last.
 */
const IPV6 = [
  `(?:${H4}:){7}${H4}`,
  `(?:${H4}:){1,6}:${H4}`,
  `(?:${H4}:){1,5}(?::${H4}){1,2}`,
  `(?:${H4}:){1,4}(?::${H4}){1,3}`,
  `(?:${H4}:){1,3}(?::${H4}){1,4}`,
  `(?:${H4}:){1,2}(?::${H4}){1,5}`,
  `${H4}:(?::${H4}){1,6}`,
  `::(?:${H4}:){0,5}${H4}`,
  `:(?::${H4}){1,7}`,
  `(?:${H4}:){1,7}:`,
  `::`,
].join("|");

const MAC = String.raw`(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}|(?:[0-9a-fA-F]{4}\.){2}[0-9a-fA-F]{4}`;

const KEYWORD_GROUPS = [ERROR_WORDS, WARNING_WORDS, OK_WORDS, INFO_WORDS, DEBUG_WORDS]
  .map((list) => String.raw`\b(${words(list)})\b`)
  .join("|");

// One alternation means one pass per line, and the group that fired says which
// colour to use. Built once: only the colours change at run time. No lookbehind
// anywhere, because the macOS 12 WKWebView this app supports rejects the syntax.
//
// The three address shapes are separate groups rather than one: an IPv6 needs a
// harder boundary than an IPv4, whose trailing colon is a port and not a longer
// address.
const PATTERN = `${KEYWORD_GROUPS}|(${IPV6})|(${IPV4})|(${MAC})`;

const MATCHER = new RegExp(PATTERN, "gi");

const LF = 0x0a;
const CR = 0x0d;
const TAB = 0x09;
const ESC = 0x1b;

const RESET = "\u001b[0m";

/**
 * An unfinished line is held this long after the last byte and then painted as it
 * stands: a shell prompt never ends with a newline, so waiting for one would leave
 * the prompt invisible.
 */
const IDLE_FLUSH_MS = 40;

/** A burst with no newline in it (a build log) is painted rather than buffered on. */
const MAX_PENDING_BYTES = 4096;

const sgrCache = new Map<string, string>();

/**
 * SGR prefix for a colour, cached because a busy stream paints the same six
 * colours thousands of times a second. Bold comes with it: a mid-tone that reads
 * on a daylight theme would otherwise be too quiet on a dark one.
 */
function sgrFor(hex: string): string {
  const cached = sgrCache.get(hex);
  if (cached !== undefined) {
    return cached;
  }
  const value = hex.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16) || 0;
  const g = Number.parseInt(value.slice(2, 4), 16) || 0;
  const b = Number.parseInt(value.slice(4, 6), 16) || 0;
  const sgr = `\u001b[1;38;2;${r};${g};${b}m`;
  sgrCache.set(hex, sgr);
  return sgr;
}

const strictDecoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

function decodeStrict(bytes: Uint8Array): string | null {
  try {
    return strictDecoder.decode(bytes);
  } catch {
    // Not valid UTF-8 on its own — a truncated multi-byte character, or output in
    // a legacy code page. Leave those bytes exactly as they arrived.
    return null;
  }
}

/**
 * True when a line can be painted at all. Anything carrying an escape sequence or
 * a control byte other than a tab is either a full-screen app (vim, htop, less) or
 * a cursor move, and inserting colours into that fights the application for the
 * screen.
 */
function isPaintable(body: Uint8Array): boolean {
  for (let i = 0; i < body.length; i += 1) {
    const byte = body[i];
    if (byte === ESC || byte === 0x7f) {
      return false;
    }
    if (byte === TAB) {
      continue;
    }
    if (byte < 0x20) {
      return false;
    }
  }
  return true;
}

/**
 * The characters around an address tell whether it is the whole address or only a
 * piece of something longer — a version number, a hash, a seven-group hex run.
 * Neighbours are checked in code rather than with a lookbehind for the same reason
 * the regex avoids one.
 */
function isStranded(kind: AddressKind, source: string, start: number, end: number): boolean {
  const before = start > 0 ? source[start - 1] : "";
  const after = end < source.length ? source[end] : "";
  if (before !== "" && /[0-9a-fA-F.]/.test(before)) {
    return true;
  }
  if (before === ":") {
    return true;
  }
  if (kind === "ipv6") {
    // A further `:` or hex digit means the match stopped short of a longer address.
    return /[0-9a-fA-F.:]/.test(after);
  }
  if (kind === "mac") {
    return /[0-9a-fA-F:.\-]/.test(after);
  }
  // IPv4 keeps `:8080` and `/24` as neighbours: a port and a prefix belong to the
  // address the user is looking for, while a bare digit means it never ended.
  return /[0-9a-fA-F.]/.test(after);
}

function paint(
  text: string,
  colors: HighlightSettings["colors"],
  lineIsFinal: boolean,
): string {
  return text.replace(
    MATCHER,
    (
      match: string,
      g1: string | undefined,
      g2: string | undefined,
      g3: string | undefined,
      g4: string | undefined,
      g5: string | undefined,
      g6: string | undefined,
      g7: string | undefined,
      g8: string | undefined,
      offset: number,
      source: string,
    ) => {
      const group = [g1, g2, g3, g4, g5, g6, g7, g8].findIndex((value) => value !== undefined);
      const rule = RULE_BY_GROUP[group];
      if (rule === undefined) {
        return match;
      }
      const end = offset + match.length;
      if (group >= 5 && isStranded(ADDRESS_KIND[group - 5], source, offset, end)) {
        return match;
      }
      // A match reaching the end of a line nothing has confirmed the end of may
      // still grow — "ERR" before "OR:", "10.0.0" before ".1". Painting the rest of
      // it later beats painting a wrong half of it now.
      if (!lineIsFinal && end >= source.length) {
        return match;
      }
      return `${sgrFor(colors[rule])}${match}${RESET}`;
    },
  );
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) {
    return parts[0];
  }
  let size = 0;
  for (const part of parts) {
    size += part.length;
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

/**
 * Turns a byte stream into a colourised byte stream, one line at a time. Output
 * that arrives mid-line is held until the line ends or the stream pauses, so a
 * keyword split across two packets is still recognised.
 */
export class LinePainter {
  private pending = new Uint8Array(0);
  private timer: number | null = null;

  constructor(private write: (bytes: Uint8Array) => void) {}

  feed(chunk: Uint8Array): void {
    // Highlighting off is a straight passthrough, but a line held from when it was
    // on still has to reach the terminal untouched.
    if (!current.enabled) {
      this.clearTimer();
      if (this.pending.length > 0) {
        this.write(concat([this.pending, chunk]));
        this.pending = new Uint8Array(0);
      } else {
        this.write(chunk);
      }
      return;
    }

    const data = this.pending.length === 0 ? chunk : concat([this.pending, chunk]);
    this.pending = new Uint8Array(0);
    this.clearTimer();

    const out: Uint8Array[] = [];
    let start = 0;
    for (let nl = data.indexOf(LF, start); nl !== -1; nl = data.indexOf(LF, start)) {
      out.push(this.paintLine(data.subarray(start, nl + 1), true));
      start = nl + 1;
    }
    if (out.length > 0) {
      this.write(concat(out));
    }
    if (start < data.length) {
      this.pending = data.slice(start);
      if (this.pending.length > MAX_PENDING_BYTES) {
        this.flush();
      } else {
        this.armFlush();
      }
    }
  }

  /** Paint and release whatever line is only half received. */
  flush(): void {
    this.clearTimer();
    if (this.pending.length === 0) {
      return;
    }
    const held = this.pending;
    this.pending = new Uint8Array(0);
    this.write(this.paintLine(held, false));
  }

  /** Hand over the half-received line with no colouring at all. */
  drain(): void {
    this.clearTimer();
    if (this.pending.length === 0) {
      return;
    }
    const held = this.pending;
    this.pending = new Uint8Array(0);
    this.write(held);
  }

  dispose(): void {
    this.clearTimer();
    this.pending = new Uint8Array(0);
  }

  private armFlush(): void {
    this.clearTimer();
    if (this.pending.length === 0) {
      return;
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, IDLE_FLUSH_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Paint one line, terminators included and kept raw. A trailing CR or LF belongs
   * to the line ending rather than to the text: progress bars end their lines with
   * a CR, and it must not read as a control byte that disqualifies the whole line.
   */
  private paintLine(line: Uint8Array, lineIsFinal: boolean): Uint8Array {
    let body = line;
    let tail = 0;
    while (tail < body.length && (body[body.length - 1 - tail] === LF || body[body.length - 1 - tail] === CR)) {
      tail += 1;
    }
    if (tail === body.length) {
      return line;
    }
    const text = body.subarray(0, body.length - tail);
    if (!isPaintable(text)) {
      return line;
    }
    const decoded = decodeStrict(text);
    if (decoded === null) {
      return line;
    }
    const painted = paint(decoded, current.colors, lineIsFinal);
    if (painted === decoded) {
      return line;
    }
    return concat([encoder.encode(painted), line.subarray(line.length - tail)]);
  }
}

/**
 * The colours in force. Held at module level because the byte stream reads them on
 * every chunk without being threaded through every component, and because a change
 * has to reach the terminals that are already running.
 */
let current: HighlightSettings = DEFAULT_HIGHLIGHT;

const painters = new Map<string, LinePainter>();

export function getHighlightSettings(): HighlightSettings {
  return current;
}

/**
 * Applies new colours to every live session. Half-received lines are flushed so
 * what is already on screen adopts the change instead of waiting for a newline,
 * and switching off hands the buffer over uncoloured.
 */
export function setHighlightSettings(next: HighlightSettings): void {
  const wasEnabled = current.enabled;
  current = next;
  for (const painter of painters.values()) {
    if (!next.enabled) {
      painter.drain();
    } else if (wasEnabled) {
      painter.flush();
    }
  }
}

/**
 * One painter per session, kept here rather than on the pane: a pane is remounted
 * whenever the layout changes, while the stream behind it never stops.
 */
export function painterFor(
  sessionID: string,
  write: (bytes: Uint8Array) => void,
): LinePainter {
  let painter = painters.get(sessionID);
  if (!painter) {
    painter = new LinePainter(write);
    painters.set(sessionID, painter);
  }
  return painter;
}

export function dropPainter(sessionID: string): void {
  const painter = painters.get(sessionID);
  if (!painter) {
    return;
  }
  painters.delete(sessionID);
  painter.dispose();
}
