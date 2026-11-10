import { useEffect } from "react";
import type { ConnectRequest, OpenSessionOptions } from "../types";
import { useI18n } from "../lib/i18n";

export interface PendingTrust {
  address: string;
  fingerprint: string;
  request: ConnectRequest;
  origin: "form" | "tab";
  options?: OpenSessionOptions;
}

interface TrustHostDialogProps {
  trust: PendingTrust;
  onTrust: () => void;
  onCancel: () => void;
}

export function TrustHostDialog({ trust, onTrust, onCancel }: TrustHostDialogProps) {
  const { t } = useI18n();
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
      <div className="trust-card" role="dialog" aria-modal="true" aria-labelledby="trust-title">
        <span className="trust-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 5 6v5.5c0 4.3 2.9 7.6 7 9.5 4.1-1.9 7-5.2 7-9.5V6l-7-3Z" />
            <path d="M9.5 12.2 11.5 14l3.5-3.4" />
          </svg>
        </span>
        <p className="eyebrow">{t("Unverified host")}</p>
        <h3 id="trust-title">{t("Trust this host key?")}</h3>
        <p className="trust-copy">
          {t(
            "The authenticity of {address} can't be established yet. Verify this fingerprint on the server before trusting it.",
            { address: trust.address },
          )}
        </p>
        <code className="trust-fingerprint">{trust.fingerprint}</code>
        <p className="trust-note">
          {t("Trusting saves the key to")} <code>~/.ssh/known_hosts</code>
          {t(", so later connections are verified automatically.")}
        </p>
        <div className="trust-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button type="button" className="primary small" onClick={onTrust}>
            {t("Trust & connect")}
          </button>
        </div>
      </div>
    </div>
  );
}
