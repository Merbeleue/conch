import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { THEMES, themeFor, type ThemeDefinition, type ThemeId } from "../lib/themes";
import { translate, useI18n } from "../lib/i18n";

type PreviewStyle = CSSProperties & {
  "--preview-bg": string;
  "--preview-panel": string;
  "--preview-accent": string;
  "--preview-glow": string;
  "--preview-muted": string;
};

function previewStyle(theme: ThemeDefinition): PreviewStyle {
  return {
    "--preview-bg": theme.preview.bg,
    "--preview-panel": theme.preview.panel,
    "--preview-accent": theme.preview.accent,
    "--preview-glow": theme.preview.glow,
    "--preview-muted": theme.preview.muted,
  };
}

/** Small scaled-down terminal used by the host theme picker. */
function ThemeMini({ theme, compact = false }: { theme: ThemeDefinition; compact?: boolean }) {
  return (
    <span
      className={compact ? "theme-mini is-compact" : "theme-mini"}
      style={previewStyle(theme)}
      aria-hidden="true"
    >
      <span className="theme-mini-head" />
      <span className="theme-mini-accent" />
      <span className="theme-mini-line" />
      <span className="theme-mini-cursor" />
    </span>
  );
}

interface ThemeSelectProps {
  value: ThemeId | "";
  globalTheme: ThemeId;
  onChange: (value: ThemeId | "") => void;
}

interface PopoverPosition {
  left: number;
  top: number;
}

/** Visual popover used in host details, replacing the style-blind native select. */
export function ThemeSelect({ value, globalTheme, onChange }: ThemeSelectProps) {
  const { language, t } = useI18n();
  const inherited = themeFor(globalTheme);
  const shown = value ? themeFor(value) : inherited;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const place = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      const gap = 8;
      const margin = 12;
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - width - margin),
      );
      let top = rect.bottom + gap;
      if (top + height > window.innerHeight - margin) {
        top = rect.top - height - gap;
        if (top < margin) {
          top = Math.max(margin, window.innerHeight - height - margin);
        }
      }
      setPosition({ left, top });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const choose = (next: ThemeId | "") => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const darkThemes = THEMES.filter((theme) => theme.scheme === "dark");
  const lightThemes = THEMES.filter((theme) => theme.scheme === "light");
  const shownTagline = translate(language, shown.tagline);
  const inheritedTagline = translate(language, inherited.tagline);

  return (
    <div className="theme-picker">
      <button
        ref={triggerRef}
        type="button"
        className="theme-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Host theme")}
        onClick={() => setOpen((current) => !current)}
      >
        <ThemeMini theme={shown} compact />
        <span className="theme-trigger-text">
          <span className="theme-trigger-name">
            {value ? shown.name : t("Follow global · {name}", { name: inherited.name })}
          </span>
          <span className="theme-trigger-hint">
            {value ? shownTagline : t("Uses the workspace theme")}
          </span>
        </span>
        <svg
          className="theme-trigger-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="theme-popover"
            role="dialog"
            aria-label={t("Choose host theme")}
            style={{
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? "visible" : "hidden",
            }}
          >
            <div className="theme-popover-head">
              <span>{t("Host theme")}</span>
              <span className="theme-popover-global">
                {t("Global · {name}", { name: inherited.name })}
              </span>
            </div>

            <div
              className="theme-popover-list"
              role="listbox"
              aria-label={t("Host theme options")}
            >
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={value ? "theme-follow" : "theme-follow is-selected"}
                onClick={() => choose("")}
              >
                <ThemeMini theme={inherited} compact />
                <span className="theme-follow-text">
                  <strong>{t("Follow global")}</strong>
                  <span>
                    {inherited.name} — {inheritedTagline}
                  </span>
                </span>
                {!value && <CheckMark />}
              </button>

              <ThemeSection
                title={t("Dark")}
                themes={darkThemes}
                value={value}
                onChoose={choose}
              />
              <ThemeSection
                title={t("Daylight")}
                themes={lightThemes}
                value={value}
                onChoose={choose}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

interface ThemeSectionProps {
  title: string;
  themes: ThemeDefinition[];
  value: ThemeId | "";
  onChoose: (value: ThemeId) => void;
}

function ThemeSection({ title, themes, value, onChoose }: ThemeSectionProps) {
  const { language } = useI18n();
  return (
    <div className="theme-section">
      <span className="theme-section-title">{title}</span>
      <div className="theme-section-grid">
        {themes.map((theme) => {
          const selected = value === theme.id;
          const tagline = translate(language, theme.tagline);
          return (
            <button
              key={theme.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={`${theme.name} — ${tagline}`}
              title={tagline}
              className={selected ? "theme-option is-selected" : "theme-option"}
              onClick={() => onChoose(theme.id)}
            >
              <ThemeMini theme={theme} />
              <span className="theme-option-name">
                {theme.name}
                {selected && <CheckMark />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ThemeGridProps {
  value: ThemeId;
  onChange: (value: ThemeId) => void;
}

/** Rich preview cards shown in Settings. */
export function ThemeGrid({ value, onChange }: ThemeGridProps) {
  const { language, t } = useI18n();
  return (
    <div className="theme-grid" role="radiogroup" aria-label={t("Global theme")}>
      {THEMES.map((theme) => {
        const selected = value === theme.id;
        const tagline = translate(language, theme.tagline);
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${theme.name} — ${tagline}`}
            className={selected ? "theme-card is-selected" : "theme-card"}
            onClick={() => onChange(theme.id)}
          >
            <span className="theme-preview" style={previewStyle(theme)} aria-hidden="true">
              <span className="theme-preview-chrome">
                <span className="theme-preview-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-preview-title" />
                <span className="theme-preview-tag" />
              </span>
              <span className="theme-preview-body">
                <span className="theme-preview-line is-accent" />
                <span className="theme-preview-line" />
                <span className="theme-preview-line is-short" />
                <span className="theme-preview-cursor" />
              </span>
            </span>

            <span className="theme-card-text">
              <span className="theme-card-name">
                {theme.name}
                {selected && <CheckMark />}
              </span>
              <span className="theme-card-blurb">{tagline}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      className="theme-check"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="5 12.5 9.5 17 19 7" />
    </svg>
  );
}
