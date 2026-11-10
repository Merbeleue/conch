import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { SavedHost } from "../types";
import { modKey } from "../lib/platform";
import { useI18n } from "../lib/i18n";

interface SidebarProps {
  hosts: SavedHost[];
  groups: string[];
  hidden: boolean;
  connectedIds: Set<string>;
  onNew: () => void;
  onLocal: () => void;
  onOpen: (host: SavedHost) => void;
  onConnect: (host: SavedHost) => void;
  onEdit: (host: SavedHost) => void;
  onDelete: (id: string) => void;
  onDuplicate: (host: SavedHost) => void;
  onMoveToGroup: (host: SavedHost, group: string) => void;
  onSettings: () => void;
}

interface HostMenuState {
  host: SavedHost;
  x: number;
  y: number;
}

type MenuStage = "root" | "groups" | "new-group";

const COLLAPSED_GROUPS_KEY = "conch.groups.collapsed.v1";

function groupKey(name: string): string {
  return name || "__ungrouped";
}

function loadCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((name): name is string => typeof name === "string"));
  } catch {
    return new Set();
  }
}

function storeCollapsedGroups(groups: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(Array.from(groups)));
  } catch {
    // Storage can be unavailable; collapsing still works for this session.
  }
}

function avatarTone(host: SavedHost): string {
  const seed = `${host.label}|${host.host}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `tone-${hash % 4}`;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) {
    return <>{text}</>;
  }
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className="host-match">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}

export function Sidebar({
  hosts,
  groups,
  hidden,
  connectedIds,
  onNew,
  onLocal,
  onOpen,
  onConnect,
  onEdit,
  onDelete,
  onDuplicate,
  onMoveToGroup,
  onSettings,
}: SidebarProps) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<HostMenuState | null>(null);
  const [menuStage, setMenuStage] = useState<MenuStage>("root");
  const [newGroupName, setNewGroupName] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsedGroups);
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const clickTimer = useRef<number | null>(null);
  const pendingHost = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
      }
    },
    [],
  );

  // Cmd+F jumps to the host filter from anywhere in the window.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f" || hidden) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden]);

  // Capture contextmenu before Wails/WKWebView can claim it, including while
  // the window is not fullscreen.
  useEffect(() => {
    const openMenu = (event: globalThis.MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-host-id]")
          : null;
      const id = target?.dataset.hostId;
      if (!id) {
        return;
      }
      const host = hosts.find((item) => item.id === id);
      if (!host) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearClickTimer();
      setMenuStage("root");
      setNewGroupName("");
      setMenu({ host, x: event.clientX, y: event.clientY });
    };
    window.addEventListener("contextmenu", openMenu, true);
    return () => window.removeEventListener("contextmenu", openMenu, true);
  }, [hosts]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (menuRef.current?.contains(event.target) ||
          submenuRef.current?.contains(event.target))
      ) {
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
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const clearClickTimer = () => {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    pendingHost.current = null;
  };

  // Waiting out the double-click window keeps a single click from flashing
  // the form before a double click starts connecting.
  const scheduleOpen = (host: SavedHost) => {
    const key = host.id;
    if (clickTimer.current !== null) {
      if (pendingHost.current === key) {
        return;
      }
      window.clearTimeout(clickTimer.current);
    }
    pendingHost.current = key;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      pendingHost.current = null;
      onOpen(host);
    }, 240);
  };

  const connectNow = (host: SavedHost) => {
    clearClickTimer();
    onConnect(host);
  };

  const runMenuAction = (action: (host: SavedHost) => void) => {
    if (!menu) {
      return;
    }
    const host = menu.host;
    setMenu(null);
    action(host);
  };

  const runGroupMove = (group: string) => {
    setGroupCollapsed(group.trim() || "__ungrouped", false);
    runMenuAction((host) => onMoveToGroup(host, group));
  };

  const openGroups = () => {
    setNewGroupName("");
    setMenuStage("groups");
  };

  // Hovering any other root entry should retract the group flyout.
  const closeSubmenu = () => setMenuStage("root");

  const setGroupCollapsed = (key: string, collapsed: boolean) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (collapsed) {
        next.add(key);
      } else {
        next.delete(key);
      }
      storeCollapsedGroups(next);
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      storeCollapsedGroups(next);
      return next;
    });
  };

  const submitNewGroup = (event: FormEvent) => {
    event.preventDefault();
    const name = newGroupName.trim();
    if (name) {
      runGroupMove(name);
    }
  };

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const matchedHosts = useMemo(() => {
    if (!needle) {
      return hosts;
    }
    return hosts.filter(
      (host) =>
        (host.label || "").toLowerCase().includes(needle) ||
        host.host.toLowerCase().includes(needle),
    );
  }, [hosts, needle]);

  const groupedNames = Array.from(new Set(groups)).sort((a, b) => a.localeCompare(b));
  const sections = searching
    ? []
    : groupedNames.length
      ? [
          ...groupedNames.map((name) => ({
            name,
            items: hosts.filter((host) => host.group === name),
          })),
          {
            name: "",
            items: hosts.filter((host) => !host.group),
          },
        ].filter((section) => section.items.length > 0)
      : [{ name: "", items: hosts }];
  const showGroupHeaders = !searching && groupedNames.length > 0;

  const renderHost = (host: SavedHost) => {
    const name = host.label || host.host;
    const connected = connectedIds.has(host.id);
    return (
      <li key={host.id}>
        <button
          type="button"
          className={connected ? "host is-connected" : "host"}
          data-host-id={host.id}
          title={
            connected
              ? t("{name} (connected) — click to open, double-click to connect, right-click for more", {
                  name,
                })
              : t("{name} — click to open, double-click to connect, right-click for more", { name })
          }
          onClick={() => scheduleOpen(host)}
          onDoubleClick={() => connectNow(host)}
        >
          <span className={`host-avatar ${avatarTone(host)}`} aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
            {connected && <span className="host-live" />}
          </span>
          <span className="host-text">
            <span className="host-name">
              <Highlight text={name} query={query} />
            </span>
            <span className="host-meta">
              {host.label ? (
                <>
                  {`${host.user || t("default")}@`}
                  <Highlight text={host.host} query={query} />:{host.port}
                </>
              ) : (
                `${host.user || t("default")} · ${host.port}`
              )}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const MENU_WIDTH = 196;
  const SUBMENU_WIDTH = 220;
  const menuLeft = menu
    ? Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8))
    : 0;
  const menuTop = menu ? Math.max(8, Math.min(menu.y, window.innerHeight - 250)) : 0;
  const submenuHeight = menuStage === "new-group" ? 160 : 360;
  const submenuLeft = menu
    ? menuLeft + MENU_WIDTH + 6 + SUBMENU_WIDTH > window.innerWidth - 8
      ? Math.max(8, menuLeft - SUBMENU_WIDTH - 6)
      : menuLeft + MENU_WIDTH + 6
    : 0;
  const submenuTop = menu
    ? Math.max(8, Math.min(menu.y, window.innerHeight - submenuHeight))
    : 0;

  return (
    <aside className={hidden ? "sidebar is-hidden" : "sidebar"} aria-hidden={hidden}>
      <div className="sidebar-grip" aria-hidden="true" />

      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8c0-3.4-2.4-5.9-5.8-5.9a4.9 4.9 0 0 0-4.9 4.9 2.9 2.9 0 0 0 2.9 2.9 1.8 1.8 0 0 0 1.8-1.8" />
          </svg>
        </span>
        <div className="brand-text">
          <h1>Conch</h1>
          <span className="brand-sub">{t("SSH workspace")}</span>
        </div>
      </div>

      <div className="sidebar-actions">
        <button type="button" className="new-session" onClick={onNew}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="new-session-label">{t("New connection")}</span>
        </button>
        <button
          type="button"
          className="new-session is-compact"
          onClick={onLocal}
          title={t("Open a local shell")}
          aria-label={t("Open a local shell")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <polyline points="7 9 10 12 7 15" />
            <line x1="12" y1="15" x2="17" y2="15" />
          </svg>
        </button>
      </div>

      <div className="hosts">
        <div className="hosts-head">
          <span className="hosts-head-title">{t("Connections")}</span>
          <span className="count-pill">{hosts.length}</span>
        </div>

        {hosts.length > 0 && (
          <div className="host-search">
            <svg className="host-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <line x1="16" y1="16" x2="20" y2="20" />
            </svg>
            <input
              ref={searchRef}
              className="host-search-input"
              value={query}
              placeholder={t("Search name or IP")}
              aria-label={t("Search saved hosts")}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setQuery("");
                }
              }}
            />
            {query ? (
              <button
                type="button"
                className="host-search-clear"
                aria-label={t("Clear search")}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="7" y1="7" x2="17" y2="17" />
                  <line x1="17" y1="7" x2="7" y2="17" />
                </svg>
              </button>
            ) : (
              <kbd className="host-search-key">{modKey}F</kbd>
            )}
          </div>
        )}

        <div className="hosts-scroll">
          {hosts.length === 0 ? (
            <div className="hosts-empty">
              <span className="hosts-empty-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="7" rx="2" />
                  <rect x="3" y="14" width="18" height="7" rx="2" />
                  <line x1="7" y1="7.5" x2="7.01" y2="7.5" />
                  <line x1="7" y1="17.5" x2="7.01" y2="17.5" />
                </svg>
              </span>
              <p className="hosts-empty-title">{t("No saved hosts yet")}</p>
              <p className="hosts-empty-body">
                {t("Every host you connect to is remembered here for one-click access.")}
              </p>
              <button type="button" className="hosts-empty-clear" onClick={onNew}>
                {t("New connection")}
              </button>
            </div>
          ) : searching && matchedHosts.length === 0 ? (
            <div className="hosts-empty is-search">
              <p className="hosts-empty-title">
                {t("No matches for “{query}”", { query: query.trim() })}
              </p>
              <p className="hosts-empty-body">{t("Try a different host name or IP address.")}</p>
              <button
                type="button"
                className="hosts-empty-clear"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                {t("Clear search")}
              </button>
            </div>
          ) : searching ? (
            <ul className="host-list">{matchedHosts.map(renderHost)}</ul>
          ) : (
            sections.map((section) => {
              const key = groupKey(section.name);
              const collapsed = showGroupHeaders && collapsedGroups.has(key);
              return (
                <div
                  className={collapsed ? "host-group is-collapsed" : "host-group"}
                  key={section.name || "__ungrouped"}
                >
                  {showGroupHeaders && (
                    <button
                      type="button"
                      className="host-group-label"
                      aria-expanded={!collapsed}
                      onClick={() => toggleGroup(key)}
                    >
                      <svg className="group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                      <span className="host-group-name">{section.name || t("Ungrouped")}</span>
                      <span className="host-group-rule" aria-hidden="true" />
                      <span className="host-group-count">{section.items.length}</span>
                    </button>
                  )}
                  <ul className="host-list">{section.items.map(renderHost)}</ul>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="sidebar-foot">
        <span className="foot-dot" aria-hidden="true" />
        <span>v0.3.0</span>
        <button
          type="button"
          className="foot-settings"
          title={t("Settings ({key},)", { key: modKey })}
          aria-label={t("Open settings")}
          onClick={onSettings}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="8.5" x2="7" y2="8.5" />
            <circle cx="9.6" cy="8.5" r="2.4" />
            <line x1="12.2" y1="8.5" x2="20" y2="8.5" />
            <line x1="4" y1="15.5" x2="13.4" y2="15.5" />
            <circle cx="16" cy="15.5" r="2.4" />
            <line x1="18.6" y1="15.5" x2="20" y2="15.5" />
          </svg>
        </button>
      </div>

      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="context-menu host-menu"
            role="menu"
            style={{ left: menuLeft, top: menuTop }}
            onPointerEnter={closeSubmenu}
          >
            <button
              type="button"
              role="menuitem"
              onPointerEnter={closeSubmenu}
              onFocus={closeSubmenu}
              onClick={() => runMenuAction(onConnect)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h13" />
                <polyline points="13 7 18 12 13 17" />
              </svg>
              {t("Connect")}
            </button>
            <button
              type="button"
              role="menuitem"
              onPointerEnter={closeSubmenu}
              onFocus={closeSubmenu}
              onClick={() => runMenuAction(onDuplicate)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2.5" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </svg>
              {t("Duplicate host")}
            </button>
            <button
              type="button"
              role="menuitem"
              onPointerEnter={closeSubmenu}
              onFocus={closeSubmenu}
              onClick={() => runMenuAction(onEdit)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m4 16.5-.8 3.6a.6.6 0 0 0 .7.7l3.6-.8L19 8.5a2.1 2.1 0 0 0-3-3L4 16.5Z" />
                <path d="m14.5 6.5 3 3" />
              </svg>
              {t("Edit details")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuStage === "root" ? undefined : "is-open"}
              aria-haspopup="menu"
              aria-expanded={menuStage !== "root"}
              onPointerEnter={openGroups}
              onFocus={openGroups}
              onClick={openGroups}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.4h9A1.5 1.5 0 0 1 21 9.9v8.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
              </svg>
              <span className="context-menu-grow">{t("Move to group")}</span>
              <svg className="context-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
            <div className="context-menu-sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="danger"
              onPointerEnter={closeSubmenu}
              onFocus={closeSubmenu}
              onClick={() => {
                if (!menu) {
                  return;
                }
                const id = menu.host.id;
                setMenu(null);
                onDelete(id);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M10 11v6M14 11v6" />
                <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
              {t("Delete host")}
            </button>
          </div>,
          document.body,
        )}

      {menu && menuStage !== "root" &&
        createPortal(
          <div
            ref={submenuRef}
            className="context-menu host-menu group-submenu"
            role="menu"
            aria-label={t("Move to group")}
            style={{ left: submenuLeft, top: submenuTop }}
          >
            <div className="context-menu-heading">
              <span>{t("Move to group")}</span>
            </div>

            {menuStage === "groups" && (
              <>
                <div className="context-menu-scroll">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runGroupMove("")}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.4h9A1.5 1.5 0 0 1 21 9.9v8.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
                    </svg>
                    <span className="context-menu-grow">{t("Ungrouped")}</span>
                    {!menu.host.group && <CheckMark />}
                  </button>
                  {groupedNames.map((name) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={name}
                      onClick={() => runGroupMove(name)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.4h9A1.5 1.5 0 0 1 21 9.9v8.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
                      </svg>
                      <span className="context-menu-grow">{name}</span>
                      {menu.host.group === name && <CheckMark />}
                    </button>
                  ))}
                </div>
                <div className="context-menu-sep" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNewGroupName("");
                    setMenuStage("new-group");
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t("New group…")}
                </button>
              </>
            )}

            {menuStage === "new-group" && (
              <form className="context-menu-form" onSubmit={submitNewGroup}>
                <label className="context-menu-field">
                  <span>{t("New group")}</span>
                  <input
                    value={newGroupName}
                    autoFocus
                    spellCheck={false}
                    placeholder={t("Group name")}
                    onChange={(event) => setNewGroupName(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setMenuStage("groups");
                      }
                    }}
                  />
                </label>
                <div className="context-menu-form-actions">
                  <button
                    type="button"
                    className="context-menu-cancel"
                    onClick={() => setMenuStage("groups")}
                  >
                    {t("Cancel")}
                  </button>
                  <button type="submit" className="context-menu-confirm" disabled={!newGroupName.trim()}>
                    {t("Move")}
                  </button>
                </div>
              </form>
            )}
          </div>,
          document.body,
        )}
    </aside>
  );
}

function CheckMark() {
  return (
    <svg
      className="context-menu-check"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="5 12.5 9.5 17 19 7" />
    </svg>
  );
}
