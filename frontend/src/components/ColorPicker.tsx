import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../lib/i18n";

interface ColorPickerProps {
  /** Current colour as `#rrggbb`. */
  value: string;
  /** The default for this rule, offered as a one-click reset. */
  fallback: string;
  label: string;
  head: string;
  presets: string[];
  onChange: (hex: string) => void;
}

interface Position {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
}

const PANEL_PX = 214;
const GAP_PX = 6;
const EDGE_PX = 12;

/** `#rgb` and bare `rrggbb` are the same intent; only six-digit lower case is stored. */
function normalizeHex(input: string): string | null {
  const text = input.trim().replace(/^#/, "").toLowerCase();
  const expanded =
    text.length === 3
      ? text
          .split("")
          .map((c) => c + c)
          .join("")
      : text;
  return /^[0-9a-f]{6}$/.test(expanded) ? `#${expanded}` : null;
}

/**
 * The app's own colour picker, in the same surface language as the list box: a
 * native `<input type="color">` opens a system panel that ignores the theme, and a
 * grid of swatches plus a hex field covers what a terminal colour setting needs.
 */
export function ColorPicker({
  value,
  fallback,
  label,
  head,
  presets,
  onChange,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const { t } = useI18n();
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width + 96, PANEL_PX);
    const spaceBelow = window.innerHeight - rect.bottom - GAP_PX - EDGE_PX;
    const spaceAbove = rect.top - GAP_PX - EDGE_PX;
    const above = spaceBelow < 220 && spaceAbove > spaceBelow;
    setPosition({
      left: Math.max(EDGE_PX, Math.min(rect.right - width, window.innerWidth - width - EDGE_PX)),
      width,
      top: above ? undefined : rect.bottom + GAP_PX,
      bottom: above ? window.innerHeight - rect.top + GAP_PX : undefined,
    });
  };

  const commit = (hex: string) => {
    if (hex !== value) {
      onChange(hex);
    }
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setDraft(value);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(value);
    const frame = requestAnimationFrame(() => fieldRef.current?.focus());
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", place, true);
    window.addEventListener("blur", close);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("blur", close);
    };
  }, [open, value]);

  const typed = normalizeHex(draft);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={["color-swatch", open ? "is-open" : ""].filter(Boolean).join(" ")}
        style={{ backgroundColor: value }}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t("{label}, currently {value}", { label, value })}
        title={value}
      />

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={head}
            className={["color-panel", position.bottom !== undefined ? "is-above" : ""]
              .filter(Boolean)
              .join(" ")}
            style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width }}
          >
            <div className="color-panel-head">{head}</div>

            <div className="color-grid" role="listbox" aria-label={t("{head} presets", { head })}>
              {presets.map((preset) => {
                const selected = preset.toLowerCase() === value.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={["color-dot", selected ? "is-current" : ""].filter(Boolean).join(" ")}
                    style={{ backgroundColor: preset }}
                    aria-label={preset}
                    title={preset}
                    onClick={() => {
                      commit(preset);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  />
                );
              })}
            </div>

            <div className="color-hex">
              <span className="color-hex-chip" style={{ backgroundColor: typed ?? value }} />
              <input
                ref={fieldRef}
                className="color-hex-field"
                value={draft}
                spellCheck={false}
                autoComplete="off"
                aria-label={t("{head} colour, six digit hex", { head })}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraft(next);
                  const hex = normalizeHex(next);
                  if (hex) {
                    commit(hex);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  const hex = normalizeHex(draft);
                  if (hex) {
                    commit(hex);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }
                }}
                onBlur={() => {
                  // Half-typed values are a mistake, not a colour: fall back to
                  // what is stored rather than leaving the field lying about it.
                  if (!normalizeHex(draft)) {
                    setDraft(value);
                  }
                }}
              />
              <button
                type="button"
                className="color-reset"
                disabled={value.toLowerCase() === fallback.toLowerCase()}
                onClick={() => {
                  commit(fallback);
                  setDraft(fallback);
                }}
              >
                {t("Reset")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
