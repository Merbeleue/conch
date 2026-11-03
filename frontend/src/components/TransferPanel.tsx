import { formatBytes, transferInFlight, type TransferState } from "../lib/transfer";

interface TransferPanelProps {
  state: TransferState;
  onCancel: () => void;
  onDismiss: () => void;
}

export function TransferPanel({ state, onCancel, onDismiss }: TransferPanelProps) {
  const { phase } = state;
  const busy = transferInFlight(state);
  const completed = phase === "success";
  const percent = completed ? 100 : Math.min(100, Math.max(0, Math.round(state.percent)));
  const percentLabel = state.totalBytes > 0 || completed ? `${percent}%` : "…";

  return (
    <section
      className={`transfer-panel is-${phase}`}
      role="status"
      aria-live="polite"
      aria-label="File transfer"
    >
      <header className="transfer-head">
        <span className="transfer-badge" aria-hidden="true">
          {badgeIcon(phase)}
        </span>
        <span className="transfer-head-text">
          <span className="transfer-title">{titleFor(state)}</span>
          <span className="transfer-target" title={`${state.sourceLabel} → ${state.targetLabel}`}>
            {state.sourceLabel} → {state.targetLabel}
          </span>
        </span>
        {!busy && (
          <button
            type="button"
            className="transfer-icon-button"
            onClick={onDismiss}
            aria-label="Dismiss transfer status"
            title="Dismiss"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        )}
      </header>

      <div
        className="transfer-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} percent`}
      >
        <span className="transfer-meter-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="transfer-values">
        <span className="transfer-percent">{percentLabel}</span>
        <span className="transfer-bytes">
          {state.totalBytes > 0
            ? `${formatBytes(state.bytes)} of ${formatBytes(state.totalBytes)}`
            : busy
              ? "Preparing…"
              : ""}
        </span>
      </div>

      <p className="transfer-detail" title={detailFor(state)}>
        {detailFor(state)}
      </p>

      <footer className="transfer-actions">
        {busy ? (
          <button
            type="button"
            className="ghost"
            onClick={onCancel}
            disabled={phase === "canceling"}
          >
            {phase === "canceling" ? "Canceling…" : "Cancel"}
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </footer>
    </section>
  );
}

function titleFor(state: TransferState): string {
  const items = `${state.fileCount} ${state.fileCount === 1 ? "item" : "items"}`;
  switch (state.phase) {
    case "running":
      return state.fileCount === 1 ? "Copying file" : `Copying ${items}`;
    case "canceling":
      return "Stopping transfer";
    case "success":
      return "Transfer complete";
    case "error":
      return "Transfer failed";
    case "canceled":
      return "Transfer canceled";
  }
  return "Transfer";
}

function detailFor(state: TransferState): string {
  const items = `${state.fileCount} ${state.fileCount === 1 ? "item" : "items"}`;
  switch (state.phase) {
    case "running":
      if (state.currentName) {
        return `${Math.min(state.fileIndex, state.fileCount)} of ${state.fileCount} · ${state.currentName}`;
      }
      return `${items} queued`;
    case "canceling":
      return "Stopping after the current chunk…";
    case "success":
      return `${state.copied} of ${items} copied to ${state.targetLabel}`;
    case "error":
      return `${state.copied} of ${items} copied${state.error ? ` — ${state.error}` : ""}`;
    case "canceled":
      return `Canceled · ${state.copied} of ${items} copied`;
  }
  return "";
}

function badgeIcon(phase: TransferState["phase"]) {
  if (phase === "success") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.4 2.7 2.7L16 9.3" />
      </svg>
    );
  }
  if (phase === "error") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.6 21 19.4H3L12 3.6Z" />
        <line x1="12" y1="9.5" x2="12" y2="13.8" />
        <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (phase === "canceled") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <line x1="8.6" y1="8.6" x2="15.4" y2="15.4" />
        <line x1="15.4" y1="8.6" x2="8.6" y2="15.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 8.2h13.2" />
      <path d="m14.2 4.6 3.6 3.6-3.6 3.6" />
      <path d="M19.5 15.8H6.3" />
      <path d="m9.8 12.2-3.6 3.6 3.6 3.6" />
    </svg>
  );
}
