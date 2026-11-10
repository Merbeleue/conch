import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  parseOctal,
  permToOctal,
  permToSet,
  permToSymbolic,
  setToPerm,
  type PermSet,
} from "../lib/sftp";
import { useI18n, type MessageKey } from "../lib/i18n";

interface ChmodDialogProps {
  names: string[];
  isDir: boolean;
  perm: number;
  sourceLabel: string;
  busy: boolean;
  error: string;
  onApply: (perm: number) => void;
  onClose: () => void;
}

const GROUPS: { key: keyof PermSet; label: MessageKey; hint: MessageKey }[] = [
  { key: "owner", label: "Owner", hint: "the account that owns the file" },
  { key: "group", label: "chmod|Group", hint: "users in the file's group" },
  { key: "other", label: "Others", hint: "everyone else on the host" },
];

const FLAGS: { key: "read" | "write" | "exec"; label: MessageKey; letter: string }[] = [
  { key: "read", label: "Read", letter: "r" },
  { key: "write", label: "Write", letter: "w" },
  { key: "exec", label: "Execute", letter: "x" },
];

export function ChmodDialog({
  names,
  isDir,
  perm,
  sourceLabel,
  busy,
  error,
  onApply,
  onClose,
}: ChmodDialogProps) {
  const [bits, setBits] = useState<PermSet>(() => permToSet(perm));
  const [octal, setOctal] = useState(() => permToOctal(perm));
  const { t } = useI18n();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const current = setToPerm(bits);
  const heading =
    names.length === 1
      ? t("“{name}”", { name: names[0] })
      : t("{count} selected items", { count: names.length });

  const syncOctal = (next: PermSet) => {
    setBits(next);
    setOctal(permToOctal(setToPerm(next)));
  };

  const toggle = (group: keyof PermSet, flag: "read" | "write" | "exec") => {
    syncOctal({ ...bits, [group]: { ...bits[group], [flag]: !bits[group][flag] } });
  };

  const onOctalChange = (value: string) => {
    setOctal(value);
    const parsed = parseOctal(value);
    if (parsed !== null) {
      setBits(permToSet(parsed));
    }
  };

  const submit = () => {
    const parsed = parseOctal(octal);
    if (parsed === null) {
      // Keep whatever the checkboxes say; the field simply has not been finished.
      onApply(current);
      return;
    }
    onApply(parsed);
  };

  return createPortal(
    <div
      className="sftp-confirm-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="sftp-confirm sftp-chmod"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sftp-chmod-title"
      >
        <header className="sftp-confirm-head">
          <span className="sftp-confirm-badge is-key" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8.6" cy="8.6" r="3.6" />
              <path d="M11.2 11.2 19.4 19.4" />
              <path d="M15.6 14.2l1.8-1.8" />
              <path d="M17.8 16.4l1.8-1.8" />
            </svg>
          </span>
          <div className="sftp-confirm-heading">
            <h2 id="sftp-chmod-title">{t("Permissions")}</h2>
            <p className="sftp-chmod-sub">
              {heading} · {sourceLabel}
            </p>
          </div>
        </header>

        <div className="sftp-chmod-preview">
          <input
            className="sftp-chmod-octal"
            value={octal}
            spellCheck={false}
            inputMode="numeric"
            maxLength={4}
            aria-label={t("Octal permissions")}
            onChange={(event) => onOctalChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <code className="sftp-chmod-symbolic">{permToSymbolic(current, isDir)}</code>
        </div>

        <div className="sftp-chmod-grid">
          <span className="sftp-chmod-corner" aria-hidden="true" />
          {FLAGS.map((flag) => (
            <span key={flag.key} className="sftp-chmod-flag">
              {t(flag.label)}
              <em>{flag.letter}</em>
            </span>
          ))}
          {GROUPS.map((group) => (
            <div key={group.key} className="sftp-chmod-row" title={t(group.hint)}>
              <span className="sftp-chmod-group">{t(group.label)}</span>
              {FLAGS.map((flag) => (
                <label key={flag.key} className="sftp-chmod-cell">
                  <input
                    type="checkbox"
                    checked={bits[group.key][flag.key]}
                    onChange={() => toggle(group.key, flag.key)}
                  />
                  <span aria-hidden="true">{flag.letter}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        {names.length > 1 && (
          <p className="sftp-chmod-note">
            {t("Applies to all {count} selected items.", { count: names.length })}
          </p>
        )}
        {error && (
          <p className="sftp-chmod-error" role="alert">
            {error}
          </p>
        )}

        <footer className="sftp-confirm-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="sftp-confirm-primary"
            onClick={submit}
            disabled={busy}
            autoFocus
          >
            {busy ? t("Applying…") : t("Apply")}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
