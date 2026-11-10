import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { paneCount } from "../lib/splits";
import { themeFor, type ThemeId } from "../lib/themes";
import type {
  PaneDropHint,
  PaneNode,
  SessionTab,
  TerminalHandle,
  WorkspaceTab,
} from "../types";
import { TerminalPane, type TerminalPrefs } from "./TerminalPane";
import { translate, useI18n, type Language } from "../lib/i18n";

/** Anchor for the "Split with" picker, in viewport coordinates. */
export interface SplitAnchor {
  x: number;
  y: number;
}

interface SplitWorkspaceProps {
  workspace: WorkspaceTab;
  sessions: Map<string, SessionTab>;
  active: boolean;
  globalTheme: ThemeId;
  prefs: TerminalPrefs;
  /** Pane the drag is currently hovering, for the drop highlight. */
  dropHint: PaneDropHint | null;
  /** Session being dragged away, so its pane can fade out. */
  draggingSessionId: string | null;
  onFocusPane: (workspaceId: string, sessionId: string) => void;
  onClosePane: (workspaceId: string, sessionId: string) => void;
  onReconnectPane: (workspaceId: string, sessionId: string) => void;
  onRatioChange: (workspaceId: string, splitId: string, ratio: number) => void;
  onDragPane: (workspaceId: string, sessionId: string, event: ReactPointerEvent) => void;
  registerActions: (sessionID: string, actions: TerminalHandle | null) => void;
}

export function SplitWorkspace({ workspace, ...rest }: SplitWorkspaceProps) {
  const count = paneCount(workspace.root);
  return (
    <div className={count > 1 ? "split-root is-multi" : "split-root"}>
      <NodeView node={workspace.root} workspace={workspace} count={count} {...rest} />
    </div>
  );
}

interface NodeProps extends Omit<SplitWorkspaceProps, "workspace"> {
  node: PaneNode;
  workspace: WorkspaceTab;
  count: number;
}

function NodeView({ node, workspace, count, ...rest }: NodeProps) {
  const { language, t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);

  if (node.kind === "pane") {
    const session = rest.sessions.get(node.sessionId);
    if (!session) {
      return null;
    }
    const focused = rest.active && workspace.activePaneId === node.sessionId;
    const paneTheme = session.theme || rest.globalTheme;
    const hint = rest.dropHint?.sessionId === node.sessionId ? rest.dropHint : null;
    const classNames = [
      "pane-leaf",
      focused ? "is-active" : "",
      hint ? `is-drop-${hint.edge}` : "",
      rest.draggingSessionId === node.sessionId ? "is-drag-source" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={classNames}
        data-drop-pane={node.sessionId}
        data-drop-workspace={workspace.id}
        style={{ backgroundColor: themeFor(paneTheme).palette.termBg }}
        onPointerDownCapture={() => rest.onFocusPane(workspace.id, node.sessionId)}
      >
        {count > 1 && (
          <div
            className="pane-head"
            title={t("Drag this header to move the pane into another split")}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              if (event.target instanceof HTMLElement && event.target.closest("button")) {
                return;
              }
              rest.onDragPane(workspace.id, node.sessionId, event);
            }}
          >
            <span className="pane-head-grip" aria-hidden="true">
              <svg viewBox="0 0 10 16" fill="currentColor">
                <circle cx="3" cy="3" r="1.15" />
                <circle cx="7" cy="3" r="1.15" />
                <circle cx="3" cy="8" r="1.15" />
                <circle cx="7" cy="8" r="1.15" />
                <circle cx="3" cy="13" r="1.15" />
                <circle cx="7" cy="13" r="1.15" />
              </svg>
            </span>
            <span
              className={[
                "pane-head-dot",
                session.info.Kind === "local" ? "is-local" : "",
                session.exit ? "is-exited" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            />
            <span className="pane-head-name">{session.label}</span>
            <span className="pane-head-meta">{paneMeta(session, language)}</span>
            <span className="pane-head-actions">
              <button
                type="button"
                className="pane-action danger"
                title={t("Close pane")}
                aria-label={t("Close pane {label}", { label: session.label })}
                onClick={() => rest.onClosePane(workspace.id, node.sessionId)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </span>
          </div>
        )}

        <TerminalPane
          session={session.info}
          exit={session.exit}
          active={focused}
          themeId={paneTheme}
          prefs={rest.prefs}
          onDisconnect={() => rest.onClosePane(workspace.id, node.sessionId)}
          onReconnect={() => rest.onReconnectPane(workspace.id, node.sessionId)}
          registerActions={rest.registerActions}
        />

        {hint && (
          <div className={`pane-drop-hint is-${hint.edge}`} aria-hidden="true">
            <span />
          </div>
        )}
      </div>
    );
  }

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const direction = node.direction;
    const splitId = node.id;
    const horizontal = direction === "row";
    document.body.classList.add(horizontal ? "is-resizing-col" : "is-resizing-row");
    setResizing(true);

    const move = (moveEvent: PointerEvent) => {
      const ratio = horizontal
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height;
      rest.onRatioChange(workspace.id, splitId, ratio);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.classList.remove("is-resizing-col", "is-resizing-row");
      setResizing(false);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const dividerClass = [
    "split-divider",
    `split-divider-${node.direction}`,
    resizing ? "is-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={containerRef}
      className={`split-node split-${node.direction}`}
    >
      <div className="split-cell" style={{ flexGrow: node.ratio }}>
        <NodeView node={node.first} workspace={workspace} count={count} {...rest} />
      </div>
      <div
        className={dividerClass}
        role="separator"
        aria-orientation={node.direction === "row" ? "vertical" : "horizontal"}
        title={t("Drag to resize · double-click to even up")}
        onPointerDown={beginResize}
        onDoubleClick={() => rest.onRatioChange(workspace.id, node.id, 0.5)}
      >
        <span aria-hidden="true" />
      </div>
      <div className="split-cell" style={{ flexGrow: 1 - node.ratio }}>
        <NodeView node={node.second} workspace={workspace} count={count} {...rest} />
      </div>
    </div>
  );
}

function paneMeta(session: SessionTab, language: Language): string {
  const { info } = session;
  if (info.Kind === "local") {
    return translate(language, "{user}@local", { user: info.User });
  }
  return `${info.User}@${info.Host}:${info.Port}`;
}
