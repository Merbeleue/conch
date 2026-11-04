import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CURSOR_STYLES,
  FONT_FAMILIES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  TERMINAL_TYPES,
  clampFontSize,
  fontStackFor,
  type AppSettings,
  type FontFamilyId,
} from "../lib/settings";
import {
  COLOR_PRESETS,
  DEFAULT_HIGHLIGHT_COLORS,
  HIGHLIGHT_RULES,
  type HighlightRuleId,
} from "../lib/highlight";
import { modKey, promptSample } from "../lib/platform";
import { AppSelect, type AppSelectOption } from "./AppSelect";
import { ColorPicker } from "./ColorPicker";
import { ThemeGrid } from "./ThemePicker";

// Built once: the list comes from a module constant, and a stable identity keeps
// the list box from re-wiring its listeners on every render.
const FONT_OPTIONS: AppSelectOption<FontFamilyId>[] = FONT_FAMILIES.map((font) => ({
  value: font.id,
  label: font.label,
  // Each row is drawn in the font it names, so the picker shows the difference
  // it is about to make rather than five identical words.
  font: font.stack,
}));

// Ids are TERM names, and TERM names are what the rows show: quoting a marketing
// label here would hide the one string the user may need to type by hand.
const TERMINAL_OPTIONS: AppSelectOption<string>[] = TERMINAL_TYPES.map((type) => ({
  value: type.id,
  label: type.label,
  hint: type.hint,
}));

interface SettingsModalProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

type SettingsSection = "appearance" | "terminal" | "highlight" | "about";

/**
 * "plain" is not a rule, it is the text between the coloured words — the same mix
 * a real log line is made of, which is what makes a preview believable.
 */
type PreviewPiece = { rule: HighlightRuleId | "plain"; text: string };

/** The words the preview shows, in the order of HIGHLIGHT_RULES. */
const PREVIEW_ROWS: PreviewPiece[][] = [
  [
    { rule: "error", text: "ERROR" },
    { rule: "plain", text: "  connect to host " },
    { rule: "network", text: "192.168.1.10" },
    { rule: "plain", text: " port 22: " },
    { rule: "error", text: "Connection refused" },
  ],
  [
    { rule: "warning", text: "warning" },
    { rule: "plain", text: ": " },
    { rule: "warning", text: "deprecated" },
    { rule: "plain", text: " flag --purge" },
  ],
  [
    { rule: "ok", text: "OK" },
    { rule: "plain", text: "  nginx is " },
    { rule: "ok", text: "active" },
    { rule: "plain", text: " (running)" },
  ],
  [
    { rule: "info", text: "INFO" },
    { rule: "plain", text: "  listening on " },
    { rule: "network", text: "0.0.0.0:8080" },
  ],
  [
    { rule: "debug", text: "DEBUG" },
    { rule: "plain", text: " " },
    { rule: "debug", text: "trace" },
    { rule: "plain", text: " arp from " },
    { rule: "network", text: "00:1a:2b:3c:4d:5e" },
  ],
];

export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>("appearance");

  const highlight = settings.highlight;

  const setHighlightEnabled = (enabled: boolean) => {
    onChange({ highlight: { ...highlight, enabled } });
  };

  const setHighlightColor = (rule: HighlightRuleId, hex: string) => {
    onChange({ highlight: { ...highlight, colors: { ...highlight.colors, [rule]: hex } } });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="settings-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="settings-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-head">
          <div>
            <p className="eyebrow">Preferences</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            type="button"
            className="settings-close"
            aria-label="Close settings"
            onClick={onClose}
            autoFocus
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            <button
              type="button"
              className={section === "appearance" ? "is-active" : undefined}
              aria-current={section === "appearance" ? "page" : undefined}
              onClick={() => setSection("appearance")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5c0-1.1-.9-2-2-2h-1.6a1.9 1.9 0 0 1-1.9-1.9V6.4a2.9 2.9 0 0 0-2.9-2.9Z" />
                <circle cx="7.4" cy="11.2" r="1" fill="currentColor" stroke="none" />
                <circle cx="9.7" cy="7.6" r="1" fill="currentColor" stroke="none" />
                <circle cx="14.2" cy="7.2" r="1" fill="currentColor" stroke="none" />
                <circle cx="7.2" cy="15.3" r="1" fill="currentColor" stroke="none" />
              </svg>
              Appearance
            </button>
            <button
              type="button"
              className={section === "terminal" ? "is-active" : undefined}
              aria-current={section === "terminal" ? "page" : undefined}
              onClick={() => setSection("terminal")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                <path d="m7 9 2.6 2.6L7 14.2" />
                <line x1="12.5" y1="14.4" x2="16.5" y2="14.4" />
              </svg>
              Terminal
            </button>
            <button
              type="button"
              className={section === "highlight" ? "is-active" : undefined}
              aria-current={section === "highlight" ? "page" : undefined}
              onClick={() => setSection("highlight")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7.4 15.6 10.6 7h2.8l3.2 8.6" />
                <line x1="8.8" y1="12.6" x2="15.2" y2="12.6" />
                <line x1="4.6" y1="19.4" x2="11.4" y2="19.4" strokeWidth="2.6" />
                <line x1="14" y1="19.4" x2="19.4" y2="19.4" strokeWidth="2.6" opacity="0.55" />
              </svg>
              Highlighting
            </button>
            <button
              type="button"
              className={section === "about" ? "is-active" : undefined}
              aria-current={section === "about" ? "page" : undefined}
              onClick={() => setSection("about")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <line x1="12" y1="11" x2="12" y2="16.5" />
                <line x1="12" y1="7.6" x2="12" y2="7.7" />
              </svg>
              About
            </button>
          </nav>

          <section className="settings-panel">
            {section === "appearance" && (
              <>
                <h3>Appearance</h3>
                <p className="settings-copy">
                  Choose the look for the whole workspace. A host can keep its own
                  theme in its connection details, and it takes over while that
                  session is active.
                </p>
                <ThemeGrid
                  value={settings.theme}
                  onChange={(theme) => onChange({ theme })}
                />
              </>
            )}

            {section === "terminal" && (
              <>
                <h3>Terminal</h3>
                <p className="settings-copy">
                  Typography and cursor for every open pane, including split
                  workspaces and local shells. Changes apply the moment you make
                  them.
                </p>

                <div className="settings-form">
                  <div className="settings-row">
                    <div className="settings-row-label">
                      <span>Font family</span>
                      <small>Only families installed on this machine are listed</small>
                    </div>
                    <AppSelect
                      className="settings-select"
                      label="Terminal font family"
                      head="Terminal font"
                      value={settings.fontFamily}
                      options={FONT_OPTIONS}
                      onChange={(fontFamily) => onChange({ fontFamily })}
                    />
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-label">
                      <span>Font size</span>
                      <small>
                        {MIN_FONT_SIZE}–{MAX_FONT_SIZE} px across the workspace
                      </small>
                    </div>
                    <div className="font-size-control">
                      <button
                        type="button"
                        className="size-step"
                        aria-label="Decrease font size"
                        disabled={settings.fontSize <= MIN_FONT_SIZE}
                        onClick={() =>
                          onChange({ fontSize: clampFontSize(settings.fontSize - 1) })
                        }
                      >
                        −
                      </button>
                      <input
                        type="range"
                        min={MIN_FONT_SIZE}
                        max={MAX_FONT_SIZE}
                        step={1}
                        value={settings.fontSize}
                        aria-label="Font size"
                        onChange={(event) =>
                          onChange({ fontSize: clampFontSize(Number(event.target.value)) })
                        }
                      />
                      <button
                        type="button"
                        className="size-step"
                        aria-label="Increase font size"
                        disabled={settings.fontSize >= MAX_FONT_SIZE}
                        onClick={() =>
                          onChange({ fontSize: clampFontSize(settings.fontSize + 1) })
                        }
                      >
                        +
                      </button>
                      <span className="font-size-value">{settings.fontSize}px</span>
                    </div>
                  </div>
                </div>

                <div
                  className="terminal-preview"
                  style={{
                    fontFamily: fontStackFor(settings.fontFamily),
                    fontSize: `${settings.fontSize}px`,
                  }}
                  aria-hidden="true"
                >
                  <span className="terminal-preview-line">
                    <span className="terminal-preview-prompt">{promptSample}</span>{" "}
                    ssh you@example.com
                    <span className="terminal-preview-cursor" />
                  </span>
                  <span className="terminal-preview-sample">
                    Sphinx of black quartz, judge my vow 0123456789
                  </span>
                </div>

                <div className="settings-block">
                  <span className="settings-block-title">Emulation</span>
                  <div className="settings-row">
                    <div className="settings-row-label">
                      <span>Terminal type</span>
                      <small>
                        Announced as $TERM when a session opens
                      </small>
                    </div>
                    <AppSelect
                      className="settings-select"
                      label="Terminal emulation type"
                      head="Terminal type"
                      value={settings.terminalType}
                      options={TERMINAL_OPTIONS}
                      onChange={(terminalType) => onChange({ terminalType })}
                    />
                  </div>
                  <p className="settings-note">
                    The host looks this name up in its own terminfo to decide how
                    much it may draw — step down when a server answers colour or
                    cursor codes with stray characters. Old switches and routers
                    usually know vt100 and nothing newer, and a simpler type
                    cannot add colour a host does not offer. Sessions already open
                    keep the type they were given.
                  </p>
                </div>

                <div className="settings-block">
                  <span className="settings-block-title">Cursor</span>
                  <div className="cursor-options" role="radiogroup" aria-label="Cursor style">
                    {CURSOR_STYLES.map((style) => {
                      const selected = settings.cursorStyle === style.id;
                      return (
                        <button
                          key={style.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={selected ? "cursor-option is-active" : "cursor-option"}
                          onClick={() => onChange({ cursorStyle: style.id })}
                        >
                          <span className="cursor-glyph" aria-hidden="true">
                            <span className={`cursor-shape is-${style.id}`} />
                          </span>
                          {style.label}
                        </button>
                      );
                    })}
                  </div>

                  <label className="settings-switch">
                    <span className="settings-switch-copy">
                      <strong>Blinking cursor</strong>
                      <small>Pulse the caret while the terminal sits idle</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.cursorBlink}
                      onChange={(event) =>
                        onChange({ cursorBlink: event.target.checked })
                      }
                    />
                    <span className="switch-track" aria-hidden="true">
                      <span />
                    </span>
                  </label>
                </div>

                <div className="settings-block">
                  <span className="settings-block-title">Mouse</span>
                  <label className="settings-switch">
                    <span className="settings-switch-copy">
                      <strong>Right-click to paste</strong>
                      <small>Selecting text copies it, right-click pastes it</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.rightClickPaste}
                      onChange={(event) =>
                        onChange({ rightClickPaste: event.target.checked })
                      }
                    />
                    <span className="switch-track" aria-hidden="true">
                      <span />
                    </span>
                  </label>
                </div>
              </>
            )}

            {section === "highlight" && (
              <>
                <h3>Highlighting</h3>
                <p className="settings-copy">
                  Colour the words worth scanning for in every terminal — SSH
                  sessions, splits and local shells alike. Anything that draws its
                  own screen, like vim or htop, is left exactly as it is.
                </p>

                <label className="settings-switch">
                  <span className="settings-switch-copy">
                    <strong>Keyword highlighting</strong>
                    <small>New output is coloured as it arrives</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={highlight.enabled}
                    onChange={(event) => setHighlightEnabled(event.target.checked)}
                  />
                  <span className="switch-track" aria-hidden="true">
                    <span />
                  </span>
                </label>

                <div className="settings-form highlight-rules">
                  {HIGHLIGHT_RULES.map((rule) => (
                    <div
                      className={highlight.enabled ? "highlight-row" : "highlight-row is-off"}
                      key={rule.id}
                    >
                      <div className="settings-row-label">
                        <span>{rule.label}</span>
                        <small>{rule.hint}</small>
                      </div>
                      <span
                        className="highlight-sample"
                        style={{ color: highlight.colors[rule.id] }}
                      >
                        {rule.sample}
                      </span>
                      <ColorPicker
                        label={`${rule.label} colour`}
                        head={rule.label}
                        value={highlight.colors[rule.id]}
                        fallback={DEFAULT_HIGHLIGHT_COLORS[rule.id]}
                        presets={COLOR_PRESETS}
                        onChange={(hex) => setHighlightColor(rule.id, hex)}
                      />
                    </div>
                  ))}

                  <button
                    type="button"
                    className="highlight-reset"
                    onClick={() =>
                      onChange({ highlight: { ...highlight, colors: { ...DEFAULT_HIGHLIGHT_COLORS } } })
                    }
                  >
                    Restore default colours
                  </button>
                </div>

                <div
                  className={
                    highlight.enabled ? "highlight-preview" : "highlight-preview is-off"
                  }
                  style={{
                    fontFamily: fontStackFor(settings.fontFamily),
                    fontSize: `${Math.min(settings.fontSize, 13)}px`,
                  }}
                  aria-hidden="true"
                >
                  {PREVIEW_ROWS.map((row) => (
                    <span className="highlight-preview-line" key={row[0].text}>
                      {row.map((piece) => (
                        <span
                          key={piece.text}
                          style={
                            piece.rule === "plain"
                              ? undefined
                              : { color: highlight.colors[piece.rule], fontWeight: 700 }
                          }
                        >
                          {piece.text}
                        </span>
                      ))}
                    </span>
                  ))}
                </div>

                <p className="settings-note">
                  Colours reach the text as it arrives, so a change applies to new
                  output rather than to the scrollback already drawn.
                </p>
              </>
            )}

            {section === "about" && (
              <div className="settings-about">
                <span className="settings-about-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8c0-3.4-2.4-5.9-5.8-5.9a4.9 4.9 0 0 0-4.9 4.9 2.9 2.9 0 0 0 2.9 2.9 1.8 1.8 0 0 0 1.8-1.8" />
                  </svg>
                </span>
                <h3>Conch</h3>
                <p className="settings-version">Version 0.2.0</p>
                <p className="settings-copy">
                  A native SSH and local terminal for macOS and Windows.
                </p>
                <div className="settings-keys">
                  <div>
                    <span>Search saved hosts</span>
                    <kbd>{modKey}F</kbd>
                  </div>
                  <div>
                    <span>Open settings</span>
                    <kbd>{modKey},</kbd>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="settings-foot">
          <span>Changes apply instantly.</span>
          <button type="button" className="primary small" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
