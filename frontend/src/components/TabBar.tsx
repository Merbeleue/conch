import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PaneEdge, SplitDirection } from "../types";
import { modKey, shiftModKey } from "../lib/platform";
import { useI18n } from "../lib/i18n";

export interface TabItem {
  id: string;
  label: string;
  meta: string;
  kind: "ssh" | "local";
  exited: boolean;
  paneCount: number;
}

/** Tab the drag is hovering, with the half it will land on. */
export interface TabDropHint {
  id: string;
  edge: PaneEdge;
}

interface TabBarProps {
  tabs: TabItem[];
  activeId: string | null;
  sidebarHidden: boolean;
  dropHint: TabDropHint | null;
  draggingId: string | null;
  onToggleSidebar: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onClear: () => void;
  broadcast: boolean;
  broadcastAvailable: boolean;
  onToggleBroadcast: () => void;
  sftpAvailable: boolean;
  /** True while this tab is showing the file manager instead of its terminal. */
  sftpActive: boolean;
  sftpTarget: string;
  onToggleSftp: () => void;
  onDisconnectAll: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onSplit: (id: string, direction: SplitDirection, anchor: { x: number; y: number }) => void;
  onDragTab: (id: string, event: ReactPointerEvent) => void;
}

interface MenuState {
  id: string;
  x: number;
  y: number;
}

export function TabBar({
  tabs,
  activeId,
  sidebarHidden,
  dropHint,
  draggingId,
  onToggleSidebar,
  onSelect,
  onClose,
  onNew,
  onClear,
  broadcast,
  broadcastAvailable,
  onToggleBroadcast,
  sftpAvailable,
  sftpActive,
  sftpTarget,
  onToggleSftp,
  onDisconnectAll,
  onDuplicate,
  onRename,
  onSplit,
  onDragTab,
}: TabBarProps) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renamingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };
    const close = () => setMenu(null);

    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  // Capture the native contextmenu event before Wails and WKWebView see it.
  // The runtime can otherwise hand the click to the webview's own menu.
  useEffect(() => {
    const openMenu = (event: globalThis.MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-tab-id]")
          : null;
      const id = target?.dataset.tabId;
      if (!id) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setMenu({ id, x: event.clientX, y: event.clientY });
    };
    window.addEventListener("contextmenu", openMenu, true);
    return () => window.removeEventListener("contextmenu", openMenu, true);
  }, []);

  const startRename = (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) {
      return;
    }
    renamingRef.current = id;
    setRenamingId(id);
    setRenameDraft(tab.label);
    setMenu(null);
  };

  const finishRename = (save: boolean) => {
    const id = renamingRef.current;
    if (!id) {
      return;
    }
    renamingRef.current = null;
    const value = renameDraft.trim();
    if (save && value) {
      onRename(id, value);
      if (id === activeId) {
        onSelect(id);
      }
    }
    setRenamingId(null);
  };

  const menuLeft = menu ? Math.max(8, Math.min(menu.x, window.innerWidth - 208)) : 0;
  const menuTop = menu ? Math.max(8, Math.min(menu.y, window.innerHeight - 238)) : 0;
  const menuMultiPane =
    (menu ? tabs.find((item) => item.id === menu.id)?.paneCount ?? 1 : 1) > 1;

  return (
    <div className="tabbar">
      <button
        type="button"
        className={sidebarHidden ? "sidebar-toggle is-collapsed" : "sidebar-toggle"}
        onClick={onToggleSidebar}
        title={sidebarHidden ? t("Show saved hosts") : t("Hide saved hosts")}
        aria-label={sidebarHidden ? t("Show sidebar") : t("Hide sidebar")}
        aria-pressed={!sidebarHidden}
      >
        <span className="sidebar-toggle-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8c0-3.4-2.4-5.9-5.8-5.9a4.9 4.9 0 0 0-4.9 4.9 2.9 2.9 0 0 0 2.9 2.9 1.8 1.8 0 0 0 1.8-1.8" />
          </svg>
        </span>
        {sidebarHidden && <span className="sidebar-toggle-label">{t("Hosts")}</span>}
      </button>

      <div className="tab-strip" role="tablist" aria-label={t("Open sessions")}>
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const renaming = renamingId === tab.id;
          const drop = dropHint?.id === tab.id ? dropHint : null;
          const multiPane = tab.paneCount > 1;
          const className = [
            "term-tab",
            active ? "is-active" : "",
            tab.kind === "local" ? "is-local" : "",
            tab.exited ? "is-exited" : "",
            multiPane ? "is-workspace" : "",
            drop ? `is-drop-${drop.edge}` : "",
            draggingId === tab.id ? "is-drag-source" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              className={className}
              data-tab-id={tab.id}
              title={
                multiPane
                  ? t("{label} — {count} panes. Drag onto a pane to rearrange", {
                      label: tab.label,
                      count: tab.paneCount,
                    })
                  : `${tab.meta}${tab.exited ? t(" — connection ended") : ""}${t(
                      " — drag onto a pane to split",
                    )}`
              }
              onClick={() => onSelect(tab.id)}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                if (event.target instanceof HTMLElement && event.target.closest("button,input")) {
                  return;
                }
                onDragTab(tab.id, event);
              }}
              onKeyDown={(event) => {
                if (event.target instanceof HTMLInputElement) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(tab.id);
                }
              }}
            >
              <span className="term-tab-dot" aria-hidden="true" />
              <span className="term-tab-text">
                {renaming ? (
                  <input
                    className="term-tab-rename"
                    value={renameDraft}
                    aria-label={multiPane ? t("Workspace name") : t("Tab name")}
                    autoFocus
                    spellCheck={false}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        finishRename(true);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        finishRename(false);
                      }
                    }}
                    onBlur={() => finishRename(false)}
                  />
                ) : (
                  <span className="term-tab-name">
                    {multiPane && (
                      <svg
                        className="term-tab-workspace-mark"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <rect x="3.5" y="5" width="17" height="14" rx="2" />
                        <line x1="11" y1="5" x2="11" y2="19" />
                        <line x1="11" y1="12" x2="20.5" y2="12" />
                      </svg>
                    )}
                    {tab.label}
                  </span>
                )}
                {!multiPane && <span className="term-tab-meta">{tab.meta}</span>}
              </span>
              {tab.paneCount > 1 && (
                <span
                  className="term-tab-panes"
                  title={t("{count} panes", { count: tab.paneCount })}
                  aria-label={t("{count} panes", { count: tab.paneCount })}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <rect x="4" y="5" width="16" height="14" rx="2" />
                    <line x1="12" y1="5" x2="12" y2="19" />
                  </svg>
                  {tab.paneCount}
                </span>
              )}
              <button
                type="button"
                className="term-tab-close"
                aria-label={t("Close {label}", { label: tab.label })}
                title={t("Close tab")}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="tab-new"
        onClick={onNew}
        title={t("New connection")}
        aria-label={t("New connection")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <div className="tabbar-actions">
        <button
          type="button"
          className={sftpActive ? "ghost sftp-trigger is-active" : "ghost sftp-trigger"}
          onClick={onToggleSftp}
          disabled={!sftpAvailable}
          aria-pressed={sftpActive}
          title={
            !sftpAvailable
              ? sftpTarget
                ? t("The SFTP manager needs a live SSH session")
                : t("Connect to a server to browse files")
              : sftpActive
                ? t("Hide the SFTP manager and show this tab's terminal")
                : t("Open the SFTP file manager for {target}", { target: sftpTarget })
          }
        >
          <span className="sftp-trigger-glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.4 7.1A1.6 1.6 0 0 1 5 5.5h3.8l1.8 2h8.4a1.6 1.6 0 0 1 1.6 1.6v2" />
              <path d="M3.4 9.1v7.4A1.6 1.6 0 0 0 5 18.1h9.4" />
              <path d="M13.6 13.9h6.6" />
              <path d="m17.2 11 3 2.9-3 2.9" />
            </svg>
          </span>
          <span className="sftp-trigger-text">SFTP</span>
        </button>
        <button
          type="button"
          className={broadcast ? "ghost broadcast-toggle is-active" : "ghost broadcast-toggle"}
          onClick={onToggleBroadcast}
          disabled={!broadcastAvailable}
          aria-pressed={broadcast}
          title={
            broadcast
              ? t("Keystrokes are going to every open session")
              : broadcastAvailable
                ? t("Send keystrokes to every open session")
                : t("Connect at least two sessions to broadcast input")
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
            <path d="M7.9 7.9a5.8 5.8 0 0 0 0 8.2M16.1 7.9a5.8 5.8 0 0 1 0 8.2" />
            <path d="M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4" />
          </svg>
          {broadcast ? t("Broadcasting") : t("Broadcast")}
          {broadcast && <span className="broadcast-pulse" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={onClear}
          disabled={!activeId}
          title={t("Clear this terminal")}
        >
          {t("Clear")}
        </button>
        <button
          type="button"
          className="ghost danger disconnect-all"
          onClick={onDisconnectAll}
          title={t("Disconnect all sessions")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v9" />
            <path d="M6.4 6.6a8 8 0 1 0 11.2 0" />
          </svg>
          {t("Disconnect all")}
        </button>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          role="menu"
          style={{ left: menuLeft, top: menuTop }}
        >
          {/* A workspace already holds several sessions, so splitting and
              duplicating are only offered for single-session tabs. */}
          {!menuMultiPane && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = menu.id;
                  const anchor = { x: menuLeft, y: menuTop + 34 };
                  setMenu(null);
                  onSplit(id, "row", anchor);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="4.5" width="16" height="15" rx="2.2" />
                  <line x1="12" y1="4.5" x2="12" y2="19.5" />
                </svg>
                {t("Split right")}
                <span className="context-menu-hint">{modKey}D</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = menu.id;
                  const anchor = { x: menuLeft, y: menuTop + 34 };
                  setMenu(null);
                  onSplit(id, "column", anchor);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="4.5" width="16" height="15" rx="2.2" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                </svg>
                {t("Split down")}
                <span className="context-menu-hint">{shiftModKey}D</span>
              </button>
              <div className="context-menu-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = menu.id;
                  setMenu(null);
                  onDuplicate(id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" />
                </svg>
                {t("Duplicate connection")}
              </button>
              <div className="context-menu-sep" role="separator" />
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => startRename(menu.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m4 16.5-.8 3.6a.6.6 0 0 0 .7.7l3.6-.8L19 8.5a2.1 2.1 0 0 0-3-3L4 16.5Z" />
              <path d="m14.5 6.5 3 3" />
            </svg>
            {menuMultiPane ? t("Rename workspace") : t("Rename tab")}
          </button>
          <div className="context-menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              const id = menu.id;
              setMenu(null);
              onClose(id);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
            {t("Close tab")}
          </button>
        </div>
      )}
    </div>
  );
}
