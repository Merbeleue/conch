import { useEffect } from "react";

interface ConfirmDialogProps {
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  /** The badge glyph; the disconnect prompt keeps the power mark, file work uses a bin. */
  icon?: "power" | "trash";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  eyebrow,
  title,
  description,
  confirmLabel,
  icon = "power",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="trust-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="trust-card confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <span className="confirm-badge" aria-hidden="true">
          {icon === "trash" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16" />
              <path d="M9 7V4h6v3" />
              <path d="M6 7l1 13h10l1-13" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v9" />
              <path d="M6.4 6.6a8 8 0 1 0 11.2 0" />
            </svg>
          )}
        </span>
        <p className="eyebrow">{eyebrow}</p>
        <h3 id="confirm-title">{title}</h3>
        <p className="trust-copy" id="confirm-description">
          {description}
        </p>
        <div className="trust-actions">
          <button type="button" className="ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="danger-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
