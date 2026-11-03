import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { SplitCandidate, SplitDirection } from "../types";

interface SplitPickerProps {
  /** Open sessions that are not in this workspace yet. */
  candidates: SplitCandidate[];
  direction: SplitDirection;
  x: number;
  y: number;
  onPick: (sessionId: string) => void;
  onClose: () => void;
}

const WIDTH = 274;
const ROW = 40;
const CHROME = 92;

/**
 * Splits now combine sessions that are already connected, so a split needs to
 * know *which* session to pull in. One candidate is obvious; several get this
 * picker.
 */
export function SplitPicker({ candidates, direction, x, y, onPick, onClose }: SplitPickerProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) {
        return;
      }
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const height = CHROME + candidates.length * ROW;
  const left = Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));

  return createPortal(
    <div
      ref={ref}
      className="context-menu split-picker"
      role="menu"
      aria-label={`Choose a session to ${direction === "row" ? "split right" : "split down"}`}
      style={{ left, top, width: WIDTH }}
    >
      <div className="context-menu-heading">
        <span>{direction === "row" ? "Split right with" : "Split down with"}</span>
      </div>
      <div className="context-menu-scroll">
        {candidates.map((candidate) => (
          <button
            type="button"
            role="menuitem"
            key={candidate.sessionId}
            onClick={() => onPick(candidate.sessionId)}
          >
            <span
              className={[
                "picker-dot",
                candidate.kind === "local" ? "is-local" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            />
            <span className="picker-text">
              <span className="picker-name">{candidate.label}</span>
              <span className="picker-meta">{candidate.meta}</span>
            </span>
            <span className="picker-origin">{candidate.originLabel}</span>
          </button>
        ))}
      </div>
      <p className="split-picker-note">
        The session moves into this tab; its connection stays open.
      </p>
    </div>,
    document.body,
  );
}
