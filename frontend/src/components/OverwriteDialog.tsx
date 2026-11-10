import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { SFTPConflict } from "../../bindings/conch/models";
import { formatBytes } from "../lib/transfer";
import { useI18n } from "../lib/i18n";

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
  const { t } = useI18n();

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
      ? t("“{name}” already exists", { name: conflicts[0].Name })
      : t("{count} files already exist", { count: conflicts.length });

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
              {conflicts.length === 1
                ? t(
                    "{source} → {target}. Overwrite replaces the existing file; skip leaves it untouched.",
                    { source: sourceLabel, target: targetLabel },
                  )
                : t(
                    "{source} → {target}. Overwrite replaces the existing files; skip leaves them untouched.",
                    { source: sourceLabel, target: targetLabel },
                  )}
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
                  <em>{t("replaces {size}", { size: formatBytes(conflict.ExistingSize) })}</em>
                )}
              </span>
            </li>
          ))}
          {extra > 0 && (
            <li className="sftp-confirm-more">{t("and {count} more", { count: extra })}</li>
          )}
        </ul>

        <footer className="sftp-confirm-actions">
          <button type="button" className="ghost" onClick={onSkip}>
            {t("Skip existing")}
          </button>
          <button type="button" className="sftp-confirm-primary" onClick={onOverwrite} autoFocus>
            {t("Overwrite")}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
