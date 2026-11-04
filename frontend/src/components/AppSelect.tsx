import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface AppSelectOption<T extends string> {
  value: T;
  label: string;
  /** Secondary line, e.g. a path or a short description. */
  hint?: string;
  /**
   * CSS font stack the option is drawn in. A font picker should show its own
   * names in the fonts they stand for, otherwise every row looks the same.
   */
  font?: string;
}

interface AppSelectProps<T extends string> {
  value: T;
  options: AppSelectOption<T>[];
  onChange: (value: T) => void;
  /** Read out by assistive tech, and used as the menu's accessible name. */
  label: string;
  /** Small uppercase title above the list. */
  head?: string;
  /** Extra class on the trigger, for width and alignment inside a row. */
  className?: string;
}

interface MenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  above: boolean;
  /** Set when the menu hangs below the trigger. */
  top?: number;
  /** Set when it grows upward: anchoring the bottom keeps it glued to the trigger. */
  bottom?: number;
}

/**
 * Generous per-row height for the fit test — over-estimating only means the menu
 * scrolls instead of running off the window.
 */
const ROW_PX = 40;
const GAP_PX = 6;
const EDGE_PX = 12;
const MAX_MENU_PX = 340;

/**
 * The app's own list box. A native <select> is the one control the theme cannot
 * reach: its pop-up is drawn by the OS, so on a dark theme the closed field and
 * the open list can disagree about who is in charge of the ink. This is the same
 * surface language as the context menus — portal, theme variables, keyboard
 * driven, and it closes on anything outside it.
 */
export function AppSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  head,
  className,
}: AppSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const indexOfValue = () => {
    const index = options.findIndex((option) => option.value === value);
    return index < 0 ? 0 : index;
  };

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 232);
    const wanted = Math.min(14 + (head ? 24 : 0) + options.length * ROW_PX, MAX_MENU_PX);
    const spaceBelow = window.innerHeight - rect.bottom - GAP_PX - EDGE_PX;
    const spaceAbove = rect.top - GAP_PX - EDGE_PX;
    const above = wanted > spaceBelow && spaceAbove > spaceBelow;
    const room = Math.max(120, above ? spaceAbove : spaceBelow);
    setPosition({
      left: Math.max(EDGE_PX, Math.min(rect.left, window.innerWidth - width - EDGE_PX)),
      width,
      maxHeight: room,
      above,
      top: above ? undefined : rect.bottom + GAP_PX,
      bottom: above ? window.innerHeight - rect.top + GAP_PX : undefined,
    });
  };

  const choose = (next: T) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (next !== value) {
      onChange(next);
    }
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setActive(indexOfValue());
    setOpen(true);
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
        setActive((current) => (current + step + options.length) % options.length);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        setActive(event.key === "Home" ? 0 : options.length - 1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const option = options[active];
        if (option) {
          choose(option.value);
        }
      }
    };
    const onViewportChange = () => setOpen(false);
    // The settings pane scrolls behind the menu; following it beats closing the
    // list the moment the layout moves.
    const onScroll = () => place();
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", onViewportChange);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", onViewportChange);
    };
  }, [open, options, active, value]);

  // Keep the highlighted row visible in a list that scrolls.
  useEffect(() => {
    if (!open) {
      return;
    }
    const row = menuRef.current?.querySelector<HTMLElement>(
      '[data-row-index="' + active + '"]',
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const current = options.find((option) => option.value === value);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={["app-select-trigger", className, open ? "is-open" : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
      >
        <span
          className="app-select-trigger-label"
          style={current?.font ? { fontFamily: current.font } : undefined}
        >
          {current?.label ?? label}
        </span>
        <svg
          className="app-select-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
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
            aria-label={head || label}
            aria-activedescendant={`${listId}-${active}`}
            className={["app-select-menu", position.above ? "is-above" : ""]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: position.left,
              top: position.top,
              bottom: position.bottom,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            {head && <div className="app-select-menu-head">{head}</div>}
            {options.map((option, index) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  id={`${listId}-${index}`}
                  data-row-index={index}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  className={["app-select-option", selected ? "is-current" : "", index === active ? "is-active" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  style={option.font ? { fontFamily: option.font } : undefined}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option.value)}
                >
                  <span className="app-select-option-text">
                    <span className="app-select-option-label">{option.label}</span>
                    {option.hint && (
                      <span className="app-select-option-hint">{option.hint}</span>
                    )}
                  </span>
                  {selected && (
                    <svg
                      className="app-select-check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
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
