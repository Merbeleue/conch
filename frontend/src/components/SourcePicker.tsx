import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SFTPSource } from "../../bindings/conch/models";
import { sourceAddress, sourceKey } from "../lib/sftp";
import { useI18n } from "../lib/i18n";

interface SourcePickerProps {
  sources: SFTPSource[];
  value: SFTPSource;
  onChange: (key: string) => void;
}

interface MenuPosition {
  left: number;
  top: number;
  width: number;
  above: boolean;
}

export function SourceGlyph({ source }: { source: SFTPSource }) {
  if (source.Kind === "remote") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="7" rx="1.8" />
        <rect x="3.5" y="12.5" width="17" height="7" rx="1.8" />
        <circle cx="7.2" cy="8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="7.2" cy="16" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="11" rx="1.8" />
      <path d="M2.8 19.2h18.4" />
    </svg>
  );
}

/** App-styled replacement for the native source <select>. */
export function SourcePicker({ sources, value, onChange }: SourcePickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedKey = sourceKey(value);

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width + 76, 276), window.innerWidth - 32);
    const estimated = 58 + sources.length * 46;
    const below = rect.bottom + 8;
    const above = rect.top - 8 - estimated;
    const useAbove = below + estimated > window.innerHeight - 12 && above > 12;
    setPosition({
      left: Math.max(12, Math.min(rect.left - 2, window.innerWidth - width - 12)),
      top: useAbove ? above : below,
      width,
      above: useAbove,
    });
  };

  const openMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setActive(Math.max(0, sources.findIndex((source) => sourceKey(source) === selectedKey)));
    setOpen(true);
  };

  const choose = (source: SFTPSource) => {
    setOpen(false);
    triggerRef.current?.focus();
    onChange(sourceKey(source));
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) => (current + step + sources.length) % sources.length);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        setActive(event.key === "Home" ? 0 : sources.length - 1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const source = sources[active];
        if (source) {
          choose(source);
        }
      }
    };
    const onViewportChange = () => setOpen(false);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("blur", onViewportChange);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("blur", onViewportChange);
    };
  }, [open, sources, active, selectedKey]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`sftp-source-trigger${open ? " is-open" : ""}`}
        onClick={openMenu}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={t("Choose where this pane browses")}
      >
        <span className="sftp-source-trigger-label">{value.Label}</span>
        <svg className="sftp-source-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
        </svg>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={t("Browse files from")}
            className={`sftp-source-menu${position.above ? " is-above" : ""}`}
            style={{ left: position.left, top: position.top, width: position.width }}
          >
            <div className="sftp-source-menu-head">{t("Browse from")}</div>
            {sources.map((source, index) => {
              const key = sourceKey(source);
              const isActive = key === selectedKey;
              const address = sourceAddress(source);
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  className={[
                    "sftp-source-option",
                    isActive ? "is-current" : "",
                    index === active ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(source)}
                >
                  <span className={`sftp-source-option-icon ${source.Kind === "remote" ? "is-remote" : "is-local"}`}>
                    <SourceGlyph source={source} />
                  </span>
                  <span className="sftp-source-option-text">
                    <span className="sftp-source-option-label">{source.Label}</span>
                    <span className="sftp-source-option-meta">
                      {address || (source.Kind === "local" ? t("Local filesystem") : "")}
                    </span>
                  </span>
                  {isActive && (
                    <svg className="sftp-source-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5.5 12.5 4.2 4.2 8.8-9.4" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
