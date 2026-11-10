import { useEffect } from "react";
import { useI18n } from "../lib/i18n";

export interface ConnectionVisual {
  token: number;
  phase: "connecting" | "done";
  kind: "ssh" | "local";
  label: string;
  host: string;
  user: string;
  port: number;
}

interface ConnectingOverlayProps {
  visual: ConnectionVisual;
  onCancel: () => void;
}

export function ConnectingOverlay({ visual, onCancel }: ConnectingOverlayProps) {
  const { t } = useI18n();
  const done = visual.phase === "done";
  const title = visual.label || visual.host || t("Local shell");
  const target =
    visual.kind === "local"
      ? t("Your login shell on this Mac")
      : visual.user
        ? `${visual.user}@${visual.host}:${visual.port}`
        : `${visual.host}:${visual.port}`;

  useEffect(() => {
    if (done) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, onCancel]);

  return (
    <div
      className={done ? "connect-overlay is-done" : "connect-overlay"}
      role="status"
      aria-live="polite"
    >
      <div className="connect-stage">
        <div className="connect-orb" aria-hidden="true">
          <span className="orb-ring orb-ring-a" />
          <span className="orb-ring orb-ring-b" />
          <span className="orb-particle orb-particle-a" />
          <span className="orb-particle orb-particle-b" />
          <span className="orb-core">
            <svg
              className="orb-shell"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8c0-3.4-2.4-5.9-5.8-5.9a4.9 4.9 0 0 0-4.9 4.9 2.9 2.9 0 0 0 2.9 2.9 1.8 1.8 0 0 0 1.8-1.8" />
            </svg>
            <svg
              className="orb-check"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>

        <p className="eyebrow">
          {done ? t("Session ready") : visual.kind === "local" ? t("Starting shell") : t("Connecting")}
        </p>
        <h2>{title}</h2>
        <p className="connect-target">{target}</p>

        <div className="connect-track" aria-hidden="true">
          <span />
        </div>
        <p className="connect-note">
          {done
            ? t("Opening terminal")
            : visual.kind === "local"
              ? t("Spawning your login shell")
              : t("Negotiating a secure channel")}
        </p>

        {!done && (
          <button type="button" className="connect-cancel" onClick={onCancel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
            {t("Cancel connection")}
          </button>
        )}
      </div>
    </div>
  );
}
