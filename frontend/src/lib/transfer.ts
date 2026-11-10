import type { SFTPTransferEvent, SFTPTransferResult } from "../../bindings/conch/models";
import { activeLanguageCode } from "./i18n";

export type { SFTPTransferEvent, SFTPTransferResult };

export type TransferPhase = "running" | "canceling" | "success" | "error" | "canceled";

export type TransferSide = "left" | "right";

/** Everything the floating transfer card needs to render one copy batch. */
export interface TransferState {
  id: string;
  sourceLabel: string;
  targetLabel: string;
  /** Pane to refresh when the batch settles. */
  targetSide: TransferSide;
  phase: TransferPhase;
  percent: number;
  bytes: number;
  totalBytes: number;
  currentName: string;
  fileIndex: number;
  fileCount: number;
  copied: number;
  failed: number;
  error: string;
}

export function transferInFlight(state: TransferState | null): boolean {
  return state?.phase === "running" || state?.phase === "canceling";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatModified(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "";
  }
  const date = new Date(ms);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  try {
    // Follow the UI language: Chinese readers expect the local date order.
    return new Intl.DateTimeFormat(activeLanguageCode() === "zh-CN" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

/** First per-file error, shown as the reason for a failed batch. */
export function firstTransferError(result: SFTPTransferResult | null): string {
  for (const file of result?.Files ?? []) {
    if (file.Error) {
      return file.Error;
    }
  }
  return "";
}
