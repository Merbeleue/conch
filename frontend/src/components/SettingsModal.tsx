import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CURSOR_STYLES,
  FONT_FAMILIES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  clampFontSize,
  fontStackFor,
  type AppSettings,
  type FontFamilyId,
} from "../lib/settings";
import { modKey, osName } from "../lib/platform";
import { ThemeGrid } from "./ThemePicker";

interface SettingsModalProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

type SettingsSection = "appearance" | "terminal" | "about";

export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>("appearance");

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
                      <small>Missing fonts fall back to the next monospace</small>
                    </div>
                    <div className="settings-select-wrap">
                      <select
                        className="settings-select"
                        value={settings.fontFamily}
                        onChange={(event) =>
                          onChange({ fontFamily: event.target.value as FontFamilyId })
                        }
                      >
                        {FONT_FAMILIES.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m7 9.5 5 5 5-5" />
                      </svg>
                    </div>
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
                  <span className="terminal-preview-prompt">you@mac:~$</span>{" "}
                  ssh you@example.com
                  <span className="terminal-preview-cursor" />
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
                <p className="settings-version">Version 0.1.0 · Open source</p>
                <p className="settings-copy">
                  A native {osName} workspace for SSH and local shells, built with
                  Wails, React, and xterm.js.
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

            <footer className="settings-foot">
              <span>Changes apply instantly.</span>
              <button type="button" className="primary small" onClick={onClose}>
                Done
              </button>
            </footer>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
