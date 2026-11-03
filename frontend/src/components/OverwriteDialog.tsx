import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { SFTPConflict } from "../../bindings/conch/models";
import { formatBytes } from "../lib/transfer";

interface OverwriteDialogProps {
  conflicts: SFTPConflict[];
  sourceLabel: string;
  targetLabel: string;
  onOverwrite: () => void;
  onSkip: () => void;
}

export function OverwriteDialog({
  conflicts,
  sourceLabel,
  targetLabel,
  onOverwrite,
  onSkip,
}: OverwriteDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip]);

  const shown = conflicts.slice(0, 5);
  const extra = conflicts.length - shown.length;
  const heading =
    conflicts.length === 1
      ? `“${conflicts[0].Name}” already exists`
      : `${conflicts.length} files already exist`;

  return createPortal(
    <div
      className="sftp-confirm-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onSkip();
        }
      }}
    >
      <section
        className="sftp-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sftp-confirm-title"
        aria-describedby="sftp-confirm-copy"
      >
        <header className="sftp-confirm-head">
          <span className="sftp-confirm-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.6 21 19.4H3L12 3.6Z" />
              <line x1="12" y1="9.5" x2="12" y2="13.8" />
              <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div className="sftp-confirm-heading">
            <h2 id="sftp-confirm-title">{heading}</h2>
            <p id="sftp-confirm-copy">
              {sourceLabel} → {targetLabel}. Overwrite replaces the existing {conflicts.length === 1 ? "file" : "files"}; skip leaves {conflicts.length === 1 ? "it" : "them"} untouched.
            </p>
          </div>
        </header>

        <ul className="sftp-confirm-list">
          {shown.map((conflict) => (
            <li key={conflict.Name}>
              <span className="sftp-confirm-name" title={conflict.Name}>
                {conflict.Name}
              </span>
              <span className="sftp-confirm-size">
                {formatBytes(conflict.Size)}
                {conflict.ExistingSize !== conflict.Size && (
                  <em>replaces {formatBytes(conflict.ExistingSize)}</em>
                )}
              </span>
            </li>
          ))}
          {extra > 0 && <li className="sftp-confirm-more">and {extra} more</li>}
        </ul>

        <footer className="sftp-confirm-actions">
          <button type="button" className="ghost" onClick={onSkip}>
            Skip existing
          </button>
          <button type="button" className="sftp-confirm-primary" onClick={onOverwrite} autoFocus>
            Overwrite
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
