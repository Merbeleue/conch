import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

interface GroupComboboxProps {
  groups: string[];
  value: string;
  onChange: (value: string) => void;
}

interface GroupOption {
  value: string;
  label: string;
  kind: "none" | "group";
}

export function GroupCombobox({ groups, value, onChange }: GroupComboboxProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss, true);
    return () => window.removeEventListener("pointerdown", dismiss, true);
  }, [open]);

  const query = filter.trim().toLowerCase();
  const options = useMemo(() => {
    const list: GroupOption[] = [];
    // Focusing the field should reveal every group, not just ones matching the
    // current value; filtering starts once the user types.
    if (!query) {
      list.push({ value: "", label: t("No group"), kind: "none" });
    }
    for (const name of groups) {
      if (!query || name.toLowerCase().includes(query)) {
        list.push({ value: name, label: name, kind: "group" });
      }
    }
    return list;
  }, [groups, query, t]);

  const chosen = value.trim();
  const exact = chosen !== "" && groups.some((name) => name.toLowerCase() === chosen.toLowerCase());
  const creating = chosen !== "" && !exact;
  const safeHighlight = Math.min(highlight, Math.max(0, options.length - 1));

  const choose = (option: GroupOption) => {
    onChange(option.value);
    setFilter("");
    setHighlight(0);
    setOpen(false);
  };

  const revealAll = () => {
    setFilter("");
    setOpen(true);
    setHighlight(0);
  };

  return (
    <div
      ref={rootRef}
      className={open ? "group-combo is-open" : "group-combo"}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <input
        ref={inputRef}
        className="group-combo-input"
        role="combobox"
        aria-label={t("Group")}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options.length > 0 ? `${listId}-${safeHighlight}` : undefined}
        value={value}
        placeholder={t("e.g. Production")}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
          setFilter(event.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={revealAll}
        onClick={() => {
          if (!open) {
            revealAll();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              revealAll();
            } else if (options.length > 0) {
              setHighlight((safeHighlight + 1) % options.length);
            }
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              revealAll();
              setHighlight(Math.max(0, options.length - 1));
            } else if (options.length > 0) {
              setHighlight((safeHighlight - 1 + options.length) % options.length);
            }
          } else if (event.key === "Enter") {
            if (open && options.length > 0) {
              event.preventDefault();
              choose(options[safeHighlight]);
            }
          } else if (event.key === "Escape") {
            if (open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          } else if (event.key === "Tab") {
            setOpen(false);
          }
        }}
      />

      <svg
        className="group-combo-chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          inputRef.current?.focus();
          revealAll();
        }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>

      {open && (
        <div className="group-combo-menu" role="listbox" id={listId} aria-label={t("Groups")}>
          {options.map((option, index) => {
            const selected = option.value === chosen;
            return (
              <button
                key={option.kind === "none" ? "__none" : option.value}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                className={index === safeHighlight ? "is-highlighted" : undefined}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.kind === "none" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.4h9A1.5 1.5 0 0 1 21 9.9v8.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
                  </svg>
                )}
                <span className="group-combo-label">{option.label}</span>
                {selected && (
                  <svg className="group-combo-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="5 12.5 9.5 17 19 7" />
                  </svg>
                )}
              </button>
            );
          })}

          {creating && (
            <div className="group-combo-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <line x1="12" y1="6" x2="12" y2="18" />
                <line x1="6" y1="12" x2="18" y2="12" />
              </svg>
              <span>
                {t("New group {name} will be created on save.", { name: chosen })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
