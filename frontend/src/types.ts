import type { ThemeId } from "./lib/themes";

export interface SessionInfo {
  ID: string;
  Kind: "ssh" | "local";
  Host: string;
  User: string;
  Port: number;
  Label?: string;
}

export interface ConnectRequest {
  /** Client-generated identifier so an in-flight attempt can be cancelled. */
  RequestID: string;
  Host: string;
  Port: number;
  User: string;
  AuthMethod: "agent" | "key" | "password";
  Password: string;
  KeyPath: string;
  Passphrase: string;
  Cols: number;
  Rows: number;
  TrustNewHostKey: boolean;
  RememberPassword: boolean;
  /**
   * Frontend-only: keep the key passphrase with the saved host, the same way a
   * password can be kept. Without it a passphrase-protected key can only be
   * used from the form, never from the sidebar.
   */
  RememberPassphrase: boolean;
  Label: string;
  /** Frontend-only: saved-host group name. */
  Group: string;
  /** Frontend-only: per-host theme, empty to follow the global theme. */
  Theme: ThemeId | "";
}

export interface SavedHost {
  /** Stable identity, so edits update one entry instead of creating another. */
  id: string;
  host: string;
  port: number;
  user: string;
  authMethod: ConnectRequest["AuthMethod"];
  keyPath: string;
  label: string;
  group: string;
  password: string;
  /** Passphrase for `keyPath`; empty means the key is unencrypted or unknown. */
  passphrase: string;
  /** Empty means the host follows the global theme. */
  theme: ThemeId | "";
  lastUsed: number;
}

export interface ExitInfo {
  SessionID: string;
  Reason: string;
  Error: string;
}

export interface TerminalHandle {
  clear: () => void;
  focus: () => void;
}

export interface SessionTab {
  info: SessionInfo;
  /** null for local shells, which are reopened instead of re-dialed. */
  request: ConnectRequest | null;
  label: string;
  /** Resolved per-session theme; empty follows the global setting. */
  theme: ThemeId | "";
  exit: ExitInfo | null;
}

export type SplitDirection = "row" | "column";

/** Which edge of a pane or tab a dragged session is being dropped on. */
export type PaneEdge = "left" | "right" | "top" | "bottom";

/** Resolved landing spot for a dragged session. */
export interface DropTarget {
  /** Whether the drop happened on a pane or on a tab in the strip. */
  kind: "pane" | "tab";
  workspaceId: string;
  /** The existing pane the dragged session lands beside. */
  sessionId: string;
  edge: PaneEdge;
}

/** Live highlight while a drag hovers a pane. */
export interface PaneDropHint {
  sessionId: string;
  edge: PaneEdge;
}

/** A tab is a recursive split layout; leaves are live sessions. */
export type PaneNode =
  | { kind: "pane"; sessionId: string }
  | {
      kind: "split";
      id: string;
      direction: SplitDirection;
      /** Share of the space taken by the first pane, 0–1. */
      ratio: number;
      first: PaneNode;
      second: PaneNode;
    };

export interface WorkspaceTab {
  id: string;
  label: string;
  /**
   * True once the user names the workspace by hand. Until then the label
   * follows its panes: one host name, or "host A + host B" once split.
   */
  customLabel: boolean;
  root: PaneNode;
  /** Session shown as the focused pane in this tab. */
  activePaneId: string;
}

/** A session offered by the "Split with" picker. */
export interface SplitCandidate {
  sessionId: string;
  label: string;
  meta: string;
  kind: "ssh" | "local";
  /** Tab the session currently lives in. */
  originLabel: string;
}

export interface PanePlacement {
  workspaceId: string;
  sessionId: string;
}

/** Where a newly opened session should land. */
export interface OpenSessionOptions {
  label?: string;
  showProgress?: boolean;
  /** Saved host whose entry should be updated when the connection succeeds. */
  savedHostId?: string | null;
  /** Replace this pane's session after a reconnect. */
  replacePane?: PanePlacement;
  /** New tabs appear just after this workspace. */
  afterWorkspaceId?: string;
}
