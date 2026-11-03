import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface RowMenuTarget {
  side: "left" | "right";
  names: string[];
  x: number;
  y: number;
}

interface SftpRowMenuProps {
  target: RowMenuTarget;
  isRemote: boolean;
  onRename: () => void;
  onChmod: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const WIDTH = 208;
const HEIGHT = 132;

export function SftpRowMenu({
  target,
  isRemote,
  onRename,
  onChmod,
  onDelete,
  onClose,
}: SftpRowMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ x: target.x, y: target.y });
  const multi = target.names.length > 1;
  const label = multi ? `${target.names.length} items` : target.names[0];

  useLayoutEffect(() => {
    const pad = 12;
    const x = Math.max(pad, Math.min(target.x, window.innerWidth - WIDTH - pad));
    const y = Math.max(pad, Math.min(target.y, window.innerHeight - HEIGHT - pad));
    setBox({ x, y });
  }, [target.x, target.y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="sftp-row-menu"
      style={{ left: box.x, top: box.y }}
      role="menu"
      aria-label={`Actions for ${label}`}
    >
      <p className="sftp-row-menu-head" title={target.names.join(", ")}>
        {label}
      </p>
      <button
        type="button"
        role="menuitem"
        className="sftp-row-menu-item"
        onClick={onRename}
        disabled={multi}
        title={multi ? "Rename one item at a time" : "Rename this item"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17Z" />
          <path d="M14.6 6.6l2.8 2.8" />
        </svg>
        <span>Rename</span>
        <kbd>↩</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        className="sftp-row-menu-item"
        onClick={onChmod}
        title={`Change permissions${isRemote ? " on the remote host" : ""}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8.6" cy="8.6" r="3.4" />
          <path d="M11.2 11.2 19 19" />
          <path d="M15.8 14l1.6-1.6" />
        </svg>
        <span>Permissions…</span>
      </button>
      <div className="sftp-row-menu-sep" aria-hidden="true" />
      <button
        type="button"
        role="menuitem"
        className="sftp-row-menu-item is-danger"
        onClick={onDelete}
        title={isRemote ? "Delete permanently on the remote host" : "Move to Trash"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.8 7.4h14.4" />
          <path d="M9.4 7.4V5.2h5.2v2.2" />
          <path d="M6.6 7.4l.9 11.4h9l.9-11.4" />
          <path d="M10.4 10.6v5.2M13.6 10.6v5.2" />
        </svg>
        <span>{isRemote ? "Delete" : "Move to Trash"}</span>
        <kbd>⌫</kbd>
      </button>
    </div>,
    document.body,
  );
}
