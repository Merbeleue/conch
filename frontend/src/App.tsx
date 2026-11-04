import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Events } from "@wailsio/runtime";
import { SFTPService, SSHService } from "../bindings/conch";
import { ConnectForm } from "./components/ConnectForm";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ConnectingOverlay, type ConnectionVisual } from "./components/ConnectingOverlay";
import { Sidebar } from "./components/Sidebar";
import { SettingsModal } from "./components/SettingsModal";
import { SftpView } from "./components/SftpView";
import { SplitWorkspace, type SplitAnchor } from "./components/SplitWorkspace";
import { SplitPicker } from "./components/SplitPicker";
import { TabBar, type TabDropHint, type TabItem } from "./components/TabBar";
import { releaseTerminal } from "./components/TerminalPane";
import { TrustHostDialog, type PendingTrust } from "./components/TrustHostDialog";
import {
  deleteHost,
  duplicateHost,
  loadHosts,
  moveHost,
  rememberHost,
  saveHost,
} from "./lib/hosts";
import { setInputBroadcast } from "./lib/inputBroadcast";
import { setHighlightSettings } from "./lib/highlight";
import { loadSettings, updateSettings, type AppSettings } from "./lib/settings";
import { startOutputStream } from "./lib/sessionStream";
import {
  collectSessionIds,
  containsSession,
  edgeForPointer,
  edgeToSplit,
  firstPaneId,
  insertBeside,
  pane,
  paneCount,
  removePane,
  replaceSession,
  updateRatio,
} from "./lib/splits";
import { applyTheme, type ThemeId } from "./lib/themes";
import type {
  ConnectRequest,
  DropTarget,
  ExitInfo,
  OpenSessionOptions,
  PaneDropHint,
  SavedHost,
  SessionTab,
  SplitCandidate,
  SplitDirection,
  TerminalHandle,
  WorkspaceTab,
} from "./types";

interface ActiveConnect {
  requestId: string;
  visualToken: number;
}

/** The "Split with" chooser, waiting for the user to pick a session. */
interface SplitPickerState {
  workspaceId: string;
  targetSessionId: string;
  direction: SplitDirection;
  x: number;
  y: number;
}

export default function App() {
  const [hosts, setHosts] = useState<SavedHost[]>(() => loadHosts());
  const [initial, setInitial] = useState<SavedHost | null>(() => hosts[0] ?? null);
  const [editingId, setEditingId] = useState<string | null>(() => hosts[0]?.id ?? null);
  const [formSeed, setFormSeed] = useState(0);
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceTab[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [pendingTrust, setPendingTrust] = useState<PendingTrust | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectVisual, setConnectVisual] = useState<ConnectionVisual | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  // SFTP is a view inside a tab, not a separate window: the tab strip stays
  // visible so you can hop back to a terminal. Maps workspace id -> session id
  // so each tab keeps its own file manager (and its browsing state) open.
  const [sftpViews, setSftpViews] = useState<Record<string, string>>({});
  const [confirmDisconnectAll, setConfirmDisconnectAll] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Keystrokes fan out to every live session while this is on. It is
  // deliberately session-scoped: a fresh launch always starts silent.
  const [broadcast, setBroadcast] = useState(false);
  // Splits combine sessions that already exist, so a split with more than one
  // candidate asks which session to pull in.
  const [splitPicker, setSplitPicker] = useState<SplitPickerState | null>(null);
  const [paneHint, setPaneHint] = useState<PaneDropHint | null>(null);
  const [tabHint, setTabHint] = useState<TabDropHint | null>(null);
  const [dragGhost, setDragGhost] = useState<{ title: string; meta: string } | null>(null);
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);

  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const ghostPos = useRef({ x: 0, y: 0 });

  const groups = useMemo(
    () =>
      Array.from(new Set(hosts.map((host) => host.group).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [hosts],
  );

  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.info.ID, session])),
    [sessions],
  );

  // Reads for drag callbacks and pending state updates need the live map, not
  // the one captured when the handler was created.
  const sessionByIdRef = useRef(sessionById);
  useEffect(() => {
    sessionByIdRef.current = sessionById;
  }, [sessionById]);

  // Terminal typography is global and independent of the window theme.
  const terminalPrefs = useMemo(
    () => ({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      rightClickPaste: settings.rightClickPaste,
    }),
    [
      settings.fontFamily,
      settings.fontSize,
      settings.cursorStyle,
      settings.cursorBlink,
      settings.rightClickPaste,
    ],
  );

  const liveSessionIds = useMemo(
    () => sessions.filter((session) => !session.exit).map((session) => session.info.ID),
    [sessions],
  );

  const workspaceBySession = useMemo(() => {
    const map = new Map<string, string>();
    for (const workspace of workspaces) {
      for (const id of collectSessionIds(workspace.root)) {
        map.set(id, workspace.id);
      }
    }
    return map;
  }, [workspaces]);

  const connectedHostIds = useMemo(
    () =>
      new Set(
        hosts.filter((host) => hostHasOpenSession(host, sessions)).map((host) => host.id),
      ),
    [hosts, sessions],
  );

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  const activeSession = useMemo(() => {
    if (!activeWorkspace) {
      return null;
    }
    return (
      sessionById.get(activeWorkspace.activePaneId) ??
      sessionById.get(firstPaneId(activeWorkspace.root)) ??
      null
    );
  }, [activeWorkspace, sessionById]);

  // SFTP opens for the focused pane of the active tab. Local shells and ended
  // sessions have no remote filesystem to browse.
  const sftpSession =
    activeSession && activeSession.info.Kind === "ssh" && !activeSession.exit
      ? activeSession
      : null;

  const tabItems = useMemo<TabItem[]>(
    () =>
      workspaces.map((workspace) => {
        const ids = collectSessionIds(workspace.root);
        const primary =
          sessionById.get(workspace.activePaneId) ?? sessionById.get(ids[0] ?? "");
        return {
          id: workspace.id,
          label: workspace.label,
          meta: workspaceMeta(ids, (id) => sessionById.get(id)),
          kind: primary?.info.Kind ?? "ssh",
          exited: Boolean(primary?.exit),
          paneCount: ids.length,
        };
      }),
    [workspaces, sessionById],
  );

  // A host's own theme takes over while its session is selected. Opening
  // Settings previews the global theme so changes are visible immediately.
  const windowTheme: ThemeId = settingsOpen
    ? settings.theme
    : activeSession?.theme || settings.theme;

  useEffect(() => {
    applyTheme(windowTheme);
  }, [windowTheme]);

  // Keyword colours live in the stream module so the byte path can read them
  // without every pane being threaded through it. Pushing them here is what makes
  // a picker change land on the running sessions immediately.
  useEffect(() => {
    setHighlightSettings(settings.highlight);
  }, [settings.highlight]);

  // Broadcast only makes sense with more than one live session; closing back
  // down to a single pane turns it off so typing never feels surprising.
  useEffect(() => {
    const active = broadcast && liveSessionIds.length > 1;
    setInputBroadcast(active, liveSessionIds);
    if (broadcast && liveSessionIds.length < 2) {
      setBroadcast(false);
    }
  }, [broadcast, liveSessionIds]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeWorkspaceIdRef = useRef<string | null>(null);
  const terminalActions = useRef(new Map<string, TerminalHandle>());
  const connectVisualToken = useRef(0);
  const connectVisualStartedAt = useRef(0);
  const connectHoldTimer = useRef<number | null>(null);
  const connectDoneTimer = useRef<number | null>(null);
  const activeConnect = useRef<ActiveConnect | null>(null);
  const cancelledConnects = useRef(new Set<string>());

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  // The sidebar is only a focus-mode casualty while sessions exist; with no
  // tabs there is nothing else to show, so bring it back.
  useEffect(() => {
    if (workspaces.length === 0) {
      setSidebarHidden(false);
    }
  }, [workspaces.length]);

  useEffect(() => {
    startOutputStream();
    return Events.On("ssh:exit", (event) => {
      const info = event.data as unknown as ExitInfo;
      setSessions((current) =>
        current.map((session) =>
          session.info.ID === info.SessionID ? { ...session, exit: info } : session,
        ),
      );
    });
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const registerActions = useCallback(
    (sessionID: string, actions: TerminalHandle | null) => {
      if (actions) {
        terminalActions.current.set(sessionID, actions);
      } else {
        terminalActions.current.delete(sessionID);
      }
    },
    [],
  );

  const clearVisualTimers = useCallback(() => {
    if (connectHoldTimer.current !== null) {
      window.clearTimeout(connectHoldTimer.current);
      connectHoldTimer.current = null;
    }
    if (connectDoneTimer.current !== null) {
      window.clearTimeout(connectDoneTimer.current);
      connectDoneTimer.current = null;
    }
  }, []);

  const startConnectVisual = useCallback(
    (visual: Omit<ConnectionVisual, "token" | "phase">) => {
      clearVisualTimers();
      const token = connectVisualToken.current + 1;
      connectVisualToken.current = token;
      connectVisualStartedAt.current = performance.now();
      setConnectVisual({ ...visual, token, phase: "connecting" });
      return token;
    },
    [clearVisualTimers],
  );

  const abortConnectVisual = useCallback(
    (token: number) => {
      if (token !== connectVisualToken.current) {
        return;
      }
      clearVisualTimers();
      setConnectVisual(null);
    },
    [clearVisualTimers],
  );

  const finishConnectVisual = useCallback(
    (token: number, holdMs: number) => {
      if (token !== connectVisualToken.current) {
        return;
      }
      const wait = Math.max(0, holdMs - (performance.now() - connectVisualStartedAt.current));
      connectHoldTimer.current = window.setTimeout(() => {
        connectHoldTimer.current = null;
        if (token !== connectVisualToken.current) {
          return;
        }
        setConnectVisual((current) =>
          current && current.token === token ? { ...current, phase: "done" } : current,
        );
        connectDoneTimer.current = window.setTimeout(() => {
          connectDoneTimer.current = null;
          if (token !== connectVisualToken.current) {
            return;
          }
          setConnectVisual((current) =>
            current && current.token === token ? null : current,
          );
        }, 900);
      }, wait);
    },
    [],
  );

  useEffect(() => () => clearVisualTimers(), [clearVisualTimers]);

  const cancelConnect = useCallback(() => {
    const active = activeConnect.current;
    if (!active) {
      return;
    }
    activeConnect.current = null;
    cancelledConnects.current.add(active.requestId);
    // Local shells have no pending request; the call is a harmless no-op.
    void SSHService.CancelConnect(active.requestId).catch(() => undefined);
    abortConnectVisual(active.visualToken);
    setPendingTrust(null);
    setError(null);
    setConnecting(false);
    setNotice("Connection cancelled.");
  }, [abortConnectVisual]);

  const handleSaveHost = useCallback(
    (request: ConnectRequest) => {
      const saved = saveHost(request, editingId);
      setHosts(saved.hosts);
      setInitial(saved.saved);
      setEditingId(saved.saved.id);
      // Keep already-open sessions in step with a newly chosen host theme.
      setSessions((current) =>
        current.map((session) =>
          session.request && hostTabMatches(saved.saved, session)
            ? { ...session, theme: saved.saved.theme }
            : session,
        ),
      );
      setError(null);
      setNotice(`Saved ${saved.saved.label || saved.saved.host}.`);
    },
    [editingId],
  );

  const handleSettingsChange = (patch: Partial<AppSettings>) => {
    setSettings(updateSettings(patch));
  };

  const handleToggleBroadcast = () => {
    if (liveSessionIds.length < 2) {
      setNotice("Connect at least two sessions to broadcast input.");
      return;
    }
    const next = !broadcast;
    setBroadcast(next);
    setNotice(
      next
        ? `Broadcasting keystrokes to ${liveSessionIds.length} sessions.`
        : "Broadcast off — input goes to the focused pane.",
    );
  };

  const handleMoveToGroup = (host: SavedHost, group: string) => {
    const name = group.trim();
    setHosts(moveHost(host.id, name));
    if (editingId === host.id) {
      setInitial({ ...host, group: name });
      setFormSeed((seed) => seed + 1);
    }
    setNotice(
      name
        ? `Moved ${host.label || host.host} to ${name}.`
        : `Removed ${host.label || host.host} from its group.`,
    );
  };

  const openSshTab = useCallback(
    async (request: ConnectRequest, options: OpenSessionOptions = {}) => {
      const showProgress = options.showProgress === true;
      if (showProgress) {
        setConnecting(true);
        setError(null);
      }

      const requestId = newRequestID();
      // Keep the caller's trust decision: the retry after the trust dialog
      // sets TrustNewHostKey so the key can actually be saved. The emulation
      // type is the one chosen now, so a reconnect picks up a changed setting
      // instead of the value the tab was first opened with.
      const outgoing: ConnectRequest = {
        ...request,
        RequestID: requestId,
        Term: settings.terminalType,
      };
      const visualToken = startConnectVisual({
        kind: "ssh",
        label: (options.label ?? request.Label).trim() || request.Host,
        host: request.Host,
        user: request.User,
        port: request.Port,
      });
      activeConnect.current = { requestId, visualToken };

      try {
        const info = await SSHService.Connect(outgoing);
        if (cancelledConnects.current.has(requestId)) {
          if (info) {
            void SSHService.Disconnect(info.ID).catch(() => undefined);
          }
          return;
        }
        if (!info) {
          throw new Error("The SSH service returned no session.");
        }

        const label = (options.label ?? request.Label).trim() || info.Host;
        const session: SessionTab = {
          info: {
            ID: info.ID,
            Kind: "ssh",
            Host: info.Host,
            User: info.User,
            Port: info.Port,
          },
          // Trust is granted per connection attempt, never carried into a
          // duplicate or a later reconnect.
          request: { ...outgoing, TrustNewHostKey: false },
          label,
          theme: outgoing.Theme || "",
          exit: null,
        };

        placeSession(session, options);
        focusSessionSoon(session.info.ID);

        // Reuse the saved entry that was being edited, so changing a host's
        // address updates it in place instead of appending a duplicate.
        const persisted = rememberHost(outgoing, options.savedHostId);
        setHosts(persisted.hosts);
        setInitial(persisted.saved);
        setEditingId(persisted.saved.id);
        setError(null);
        setSidebarHidden(true);
        finishConnectVisual(visualToken, 1100);
      } catch (err) {
        if (cancelledConnects.current.has(requestId)) {
          return;
        }
        abortConnectVisual(visualToken);
        const trust = parseTrustError(err);
        if (trust) {
          setPendingTrust({
            ...trust,
            request: outgoing,
            origin: showProgress ? "form" : "tab",
            options,
          });
          if (showProgress) {
            setError(null);
          }
        } else {
          const message = errorMessage(err);
          if (showProgress || activeWorkspaceIdRef.current === null) {
            setError(message);
          } else {
            setNotice(message);
          }
        }
      } finally {
        if (activeConnect.current?.requestId === requestId) {
          activeConnect.current = null;
        }
        cancelledConnects.current.delete(requestId);
        if (showProgress) {
          setConnecting(false);
        }
      }
    },
    [startConnectVisual, finishConnectVisual, abortConnectVisual, settings.terminalType],
  );

  const openLocalTab = useCallback(
    async (options: OpenSessionOptions = {}) => {
      const showProgress = options.showProgress === true;
      if (showProgress) {
        setConnecting(true);
        setError(null);
      }

      const requestId = newRequestID();
      const visualToken = startConnectVisual({
        kind: "local",
        label: (options.label ?? "Local shell").trim() || "Local shell",
        host: "",
        user: "",
        port: 0,
      });
      activeConnect.current = { requestId, visualToken };

      try {
        const info = await SSHService.OpenLocal(settings.terminalType);
        if (cancelledConnects.current.has(requestId)) {
          if (info) {
            void SSHService.Disconnect(info.ID).catch(() => undefined);
          }
          return;
        }
        if (!info) {
          throw new Error("The terminal service returned no session.");
        }

        const label = (options.label ?? "Local shell").trim() || "Local shell";
        const session: SessionTab = {
          info: {
            ID: info.ID,
            Kind: "local",
            Host: info.Host,
            User: info.User,
            Port: info.Port,
          },
          request: null,
          label,
          theme: "",
          exit: null,
        };

        placeSession(session, options);
        focusSessionSoon(session.info.ID);
        setError(null);
        setSidebarHidden(true);
        finishConnectVisual(visualToken, 900);
      } catch (err) {
        if (cancelledConnects.current.has(requestId)) {
          return;
        }
        abortConnectVisual(visualToken);
        const message = errorMessage(err);
        if (showProgress || activeWorkspaceIdRef.current === null) {
          setError(message);
        } else {
          setNotice(message);
        }
      } finally {
        if (activeConnect.current?.requestId === requestId) {
          activeConnect.current = null;
        }
        cancelledConnects.current.delete(requestId);
        if (showProgress) {
          setConnecting(false);
        }
      }
    },
    [startConnectVisual, finishConnectVisual, abortConnectVisual, settings.terminalType],
  );

  /** Adds a finished session to a new tab, an existing split, or a replacement pane. */
  const placeSession = useCallback((session: SessionTab, options: OpenSessionOptions) => {
    setSessions((current) => {
      if (options.replacePane) {
        return [
          ...current.filter((item) => item.info.ID !== options.replacePane!.sessionId),
          session,
        ];
      }
      return [...current, session];
    });

    if (options.replacePane) {
      const placement = options.replacePane;
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === placement.workspaceId
            ? {
                ...workspace,
                root: replaceSession(workspace.root, placement.sessionId, session.info.ID),
                activePaneId:
                  workspace.activePaneId === placement.sessionId
                    ? session.info.ID
                    : workspace.activePaneId,
              }
            : workspace,
        ),
      );
      setActiveWorkspaceId(placement.workspaceId);
      return;
    }

    const workspace: WorkspaceTab = {
      id: newWorkspaceID(),
      label: session.label,
      customLabel: false,
      root: pane(session.info.ID),
      activePaneId: session.info.ID,
    };
    setWorkspaces((current) =>
      insertWorkspace(current, workspace, options.afterWorkspaceId),
    );
    setActiveWorkspaceId(workspace.id);
  }, []);

  const focusSessionSoon = useCallback((sessionId: string) => {
    requestAnimationFrame(() => terminalActions.current.get(sessionId)?.focus());
  }, []);

  const selectWorkspace = useCallback(
    (id: string) => {
      setActiveWorkspaceId(id);
      const workspace = workspaces.find((item) => item.id === id);
      if (workspace) {
        focusSessionSoon(workspace.activePaneId);
      }
    },
    [workspaces, focusSessionSoon],
  );

  const focusPane = useCallback(
    (workspaceId: string, sessionId: string) => {
      setActiveWorkspaceId(workspaceId);
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === workspaceId && workspace.activePaneId !== sessionId
            ? { ...workspace, activePaneId: sessionId }
            : workspace,
        ),
      );
      focusSessionSoon(sessionId);
    },
    [focusSessionSoon],
  );

  const changeRatio = useCallback(
    (workspaceId: string, splitId: string, ratio: number) => {
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === workspaceId
            ? { ...workspace, root: updateRatio(workspace.root, splitId, ratio) }
            : workspace,
        ),
      );
    },
    [],
  );

  const closeWorkspace = useCallback((id: string) => {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) {
      return;
    }

    const ids = collectSessionIds(workspace.root);
    for (const sessionId of ids) {
      terminalActions.current.delete(sessionId);
      releaseTerminal(sessionId);
      void SSHService.Disconnect(sessionId).catch(() => undefined);
    }
    setSessions((current) =>
      current.filter((session) => !ids.includes(session.info.ID)),
    );

    const remaining = workspaces.filter((item) => item.id !== id);
    setWorkspaces(remaining);
    if (activeWorkspaceIdRef.current === id) {
      const index = workspaces.findIndex((item) => item.id === id);
      const next = remaining[Math.min(index, remaining.length - 1)];
      setActiveWorkspaceId(next ? next.id : null);
    }
  }, [workspaces]);

  const closePane = useCallback(
    (workspaceId: string, sessionId: string) => {
      const workspace = workspaces.find((item) => item.id === workspaceId);
      if (!workspace) {
        return;
      }

      terminalActions.current.delete(sessionId);
      releaseTerminal(sessionId);
      void SSHService.Disconnect(sessionId).catch(() => undefined);
      setSessions((current) =>
        current.filter((session) => session.info.ID !== sessionId),
      );

      if (paneCount(workspace.root) === 1) {
        closeWorkspace(workspaceId);
        return;
      }

      const root = removePane(workspace.root, sessionId);
      if (!root) {
        closeWorkspace(workspaceId);
        return;
      }
      const resolve = (id: string) => sessionByIdRef.current.get(id);
      setWorkspaces((current) =>
        current.map((item) =>
          item.id === workspaceId
            ? withWorkspaceLabel(
                {
                  ...item,
                  root,
                  activePaneId:
                    item.activePaneId === sessionId ? firstPaneId(root) : item.activePaneId,
                },
                resolve,
              )
            : item,
        ),
      );
      if (activeWorkspaceIdRef.current === workspaceId) {
        focusSessionSoon(firstPaneId(root));
      }
    },
    [workspaces, closeWorkspace, focusSessionSoon],
  );

  /**
   * Moves an already-connected session into a split of another (or the same)
   * workspace. Nothing is dialled or disconnected: the pane itself travels, and
   * the tab it came from closes once it is empty.
   */
  const dockSession = useCallback((sessionId: string, target: DropTarget) => {
    const resolve = (id: string) => sessionByIdRef.current.get(id);
    if (!resolve(sessionId)) {
      return;
    }
    const { direction, before } = edgeToSplit(target.edge);

    setWorkspaces((current) => {
      const source = current.find((workspace) =>
        containsSession(workspace.root, sessionId),
      );
      if (!source) {
        return current;
      }

      const next: WorkspaceTab[] = [];
      for (const workspace of current) {
        if (workspace.id !== source.id) {
          next.push(workspace);
          continue;
        }
        const root = removePane(workspace.root, sessionId);
        if (!root) {
          // Its last pane just moved: the tab goes with it.
          continue;
        }
        next.push(
          withWorkspaceLabel(
            {
              ...workspace,
              root,
              activePaneId:
                workspace.activePaneId === sessionId ? firstPaneId(root) : workspace.activePaneId,
            },
            resolve,
          ),
        );
      }

      const index = next.findIndex((workspace) => workspace.id === target.workspaceId);
      if (index < 0 || !containsSession(next[index].root, target.sessionId)) {
        return current;
      }
      next[index] = withWorkspaceLabel(
        {
          ...next[index],
          root: insertBeside(
            next[index].root,
            target.sessionId,
            sessionId,
            direction,
            before,
          ),
          activePaneId: sessionId,
        },
        resolve,
      );
      return next;
    });

    setActiveWorkspaceId(target.workspaceId);
    focusSessionSoon(sessionId);
  }, [focusSessionSoon]);

  /** Sessions from other tabs that a split could pull in. */
  const splitCandidates = useCallback(
    (workspaceId: string): SplitCandidate[] => {
      const candidates: SplitCandidate[] = [];
      for (const workspace of workspaces) {
        if (workspace.id === workspaceId) {
          continue;
        }
        for (const sessionId of collectSessionIds(workspace.root)) {
          const session = sessionById.get(sessionId);
          if (!session || session.exit) {
            continue;
          }
          candidates.push({
            sessionId,
            label: session.label,
            meta: tabMeta(session),
            kind: session.info.Kind,
            originLabel: workspace.label,
          });
        }
      }
      return candidates;
    },
    [workspaces, sessionById],
  );

  const combineWith = useCallback(
    (options: {
      workspaceId: string;
      targetSessionId: string;
      direction: SplitDirection;
      anchor?: SplitAnchor;
    }) => {
      const candidates = splitCandidates(options.workspaceId);
      if (candidates.length === 0) {
        setNotice(
          "Nothing to split with yet — connect another host, then split to pull it into this tab.",
        );
        return;
      }
      if (candidates.length === 1) {
        // One open session: obviously that one.
        dockSession(candidates[0].sessionId, {
          kind: "pane",
          workspaceId: options.workspaceId,
          sessionId: options.targetSessionId,
          edge: options.direction === "row" ? "right" : "bottom",
        });
        return;
      }
      setSplitPicker({
        workspaceId: options.workspaceId,
        targetSessionId: options.targetSessionId,
        direction: options.direction,
        x: options.anchor?.x ?? Math.max(120, window.innerWidth - 300),
        y: options.anchor?.y ?? 58,
      });
    },
    [splitCandidates, dockSession],
  );

  const requestSplit = useCallback(
    (workspaceId: string, direction: SplitDirection, anchor?: SplitAnchor) => {
      const workspace = workspaces.find((item) => item.id === workspaceId);
      if (!workspace) {
        return;
      }
      combineWith({
        workspaceId,
        targetSessionId: workspace.activePaneId || firstPaneId(workspace.root),
        direction,
        anchor,
      });
    },
    [workspaces, combineWith],
  );

  /** Where a dragged session would land for this pointer position. */
  const resolveDropTarget = useCallback(
    (
      x: number,
      y: number,
      sourceSessionId: string,
      snapshot: WorkspaceTab[],
    ): DropTarget | null => {
      const element = document.elementFromPoint(x, y);
      if (!(element instanceof Element)) {
        return null;
      }

      const paneEl = element.closest<HTMLElement>("[data-drop-pane]");
      const paneSessionId = paneEl?.dataset.dropPane;
      const paneWorkspaceId = paneEl?.dataset.dropWorkspace;
      if (paneEl && paneSessionId && paneWorkspaceId) {
        if (paneSessionId === sourceSessionId) {
          return null;
        }
        const workspace = snapshot.find((item) => item.id === paneWorkspaceId);
        if (!workspace || !containsSession(workspace.root, paneSessionId)) {
          return null;
        }
        return {
          kind: "pane",
          workspaceId: paneWorkspaceId,
          sessionId: paneSessionId,
          edge: edgeForPointer(paneEl.getBoundingClientRect(), x, y),
        };
      }

      const tabEl = element.closest<HTMLElement>("[data-tab-id]");
      const tabId = tabEl?.dataset.tabId;
      if (!tabEl || !tabId) {
        return null;
      }
      const workspace = snapshot.find((item) => item.id === tabId);
      if (!workspace) {
        return null;
      }
      // Dropping on a tab splits against that tab's focused pane, on whichever
      // half of the tab the pointer sits.
      const others = collectSessionIds(workspace.root).filter(
        (id) => id !== sourceSessionId,
      );
      if (others.length === 0) {
        return null;
      }
      const sessionId =
        workspace.activePaneId !== sourceSessionId
          ? workspace.activePaneId
          : others[0];
      const rect = tabEl.getBoundingClientRect();
      return {
        kind: "tab",
        workspaceId: tabId,
        sessionId,
        edge: x < rect.left + rect.width / 2 ? "left" : "right",
      };
    },
    [],
  );

  const paintGhost = useCallback((x: number, y: number) => {
    ghostPos.current = { x, y };
    const element = dragGhostRef.current;
    if (element) {
      element.style.transform = `translate3d(${x + 16}px, ${y + 16}px, 0)`;
    }
  }, []);

  /** Pointer-drag a pane (from its header or its tab) onto another to split. */
  const beginSessionDrag = useCallback(
    (workspaceId: string, sessionId: string, event: ReactPointerEvent) => {
      const session = sessionByIdRef.current.get(sessionId);
      if (!session || event.button !== 0) {
        return;
      }
      const snapshot = workspaces;
      const origin = { x: event.clientX, y: event.clientY };
      let dragging = false;
      let lastKey = "";
      let target: DropTarget | null = null;

      const move = (moveEvent: PointerEvent) => {
        if (!dragging) {
          if (
            Math.abs(moveEvent.clientX - origin.x) +
              Math.abs(moveEvent.clientY - origin.y) <
            8
          ) {
            return;
          }
          dragging = true;
          document.body.classList.add("is-dragging-pane");
          setSplitPicker(null);
          setDraggingSessionId(sessionId);
          setDragGhost({ title: session.label, meta: tabMeta(session) });
        }
        paintGhost(moveEvent.clientX, moveEvent.clientY);

        target = resolveDropTarget(moveEvent.clientX, moveEvent.clientY, sessionId, snapshot);
        const key = target
          ? `${target.kind}:${target.workspaceId}:${target.sessionId}:${target.edge}`
          : "";
        if (key === lastKey) {
          return;
        }
        lastKey = key;
        setPaneHint(
          target && target.kind === "pane"
            ? { sessionId: target.sessionId, edge: target.edge }
            : null,
        );
        setTabHint(
          target && target.kind === "tab"
            ? { id: target.workspaceId, edge: target.edge }
            : null,
        );
      };

      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", onKey);
        document.body.classList.remove("is-dragging-pane");
        setDraggingSessionId(null);
        setDragGhost(null);
        setPaneHint(null);
        setTabHint(null);
        if (!dragging) {
          return;
        }
        // WKWebView turns the release into a click on whatever is under the
        // pointer, which would select or focus the drop target a second time.
        const swallow = (clickEvent: MouseEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
        };
        window.addEventListener("click", swallow, true);
        window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      };

      const up = () => {
        const dropped = target;
        stop();
        if (dropped) {
          dockSession(sessionId, dropped);
        }
      };
      const cancel = () => stop();
      const onKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") {
          stop();
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", onKey);
    },
    [workspaces, paintGhost, resolveDropTarget, dockSession],
  );

  // Dragging a tab moves the pane it is focused on.
  const beginTabDrag = useCallback(
    (workspaceId: string, event: ReactPointerEvent) => {
      const workspace = workspaces.find((item) => item.id === workspaceId);
      if (!workspace) {
        return;
      }
      beginSessionDrag(
        workspaceId,
        workspace.activePaneId || firstPaneId(workspace.root),
        event,
      );
    },
    [workspaces, beginSessionDrag],
  );

  useEffect(() => {
    if (!dragGhost) {
      return;
    }
    const element = dragGhostRef.current;
    if (element) {
      element.style.transform = `translate3d(${ghostPos.current.x + 16}px, ${ghostPos.current.y + 16}px, 0)`;
    }
  }, [dragGhost]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      const id = activeWorkspaceIdRef.current;
      if (!id || event.key.toLowerCase() !== "d") {
        return;
      }
      event.preventDefault();
      requestSplit(id, event.shiftKey ? "column" : "row");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestSplit]);

  const renameWorkspace = (id: string, label: string) => {
    const value = label.trim();
    if (!value) {
      return;
    }
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === id
          ? { ...workspace, label: value, customLabel: true }
          : workspace,
      ),
    );
  };

  const duplicateWorkspace = (id: string) => {
    const workspace = workspaces.find((item) => item.id === id);
    if (!workspace) {
      return;
    }
    const session =
      sessionById.get(workspace.activePaneId) ??
      sessionById.get(firstPaneId(workspace.root));
    if (!session) {
      return;
    }
    // A duplicated workspace copies its focused pane only, so the alias follows
    // that session: "Bravo (1)", "Bravo (2)" — not the workspace name.
    const label = copyLabel(session.label, sessions);
    if (!session.request) {
      void openLocalTab({ afterWorkspaceId: id, label });
      return;
    }
    void openSshTab(
      { ...session.request, TrustNewHostKey: false },
      { afterWorkspaceId: id, label },
    );
  };

  const reconnectPane = (workspaceId: string, sessionId: string) => {
    const session = sessionById.get(sessionId);
    if (!session) {
      return;
    }
    const options: OpenSessionOptions = {
      replacePane: { workspaceId, sessionId },
      label: session.label,
    };
    if (!session.request) {
      void openLocalTab(options);
      return;
    }
    void openSshTab({ ...session.request, TrustNewHostKey: false }, options);
  };

  const handleNew = () => {
    setInitial(null);
    setEditingId(null);
    setFormSeed((seed) => seed + 1);
    setActiveWorkspaceId(null);
    setError(null);
    setConnecting(false);
    setSidebarHidden(false);
    setSplitPicker(null);
  };

  const findHostSession = (host: SavedHost) => {
    const session = sessions.find((item) => hostTabMatches(host, item));
    if (!session) {
      return null;
    }
    const workspaceId = workspaceBySession.get(session.info.ID);
    return workspaceId ? { workspaceId, sessionId: session.info.ID } : null;
  };

  // Copies the saved host entry itself, placing it right below the original.
  // No connection is opened; the copy keeps every saved detail and gets a
  // " (n)" label so the two entries stay distinguishable.
  const handleDuplicateHost = (host: SavedHost) => {
    const result = duplicateHost(host.id);
    if (!result) {
      return;
    }
    setHosts(result.hosts);
    setNotice(`Created ${result.copy.label || result.copy.host}.`);
  };

  const showHostForm = (host: SavedHost) => {
    setInitial(host);
    setEditingId(host.id);
    setFormSeed((seed) => seed + 1);
    setActiveWorkspaceId(null);
    setError(null);
    setConnecting(false);
    setSplitPicker(null);
  };

  const handleOpenHost = (host: SavedHost) => {
    const existing = findHostSession(host);
    if (existing) {
      focusPane(existing.workspaceId, existing.sessionId);
      return;
    }
    showHostForm(host);
  };

  const handleEditHost = (host: SavedHost) => {
    showHostForm(host);
  };

  const handleDeleteHost = (id: string) => {
    const removed = hosts.find((host) => host.id === id);
    setHosts(deleteHost(id));
    if (editingId === id) {
      setEditingId(null);
      setInitial(null);
      setFormSeed((seed) => seed + 1);
    }
    if (removed) {
      setNotice(`Removed ${removed.label || removed.host} from saved hosts.`);
    }
  };

  const handleConnectHost = (host: SavedHost) => {
    const existing = findHostSession(host);
    if (existing) {
      focusPane(existing.workspaceId, existing.sessionId);
      return;
    }

    showHostForm(host);

    // A password host without a saved secret still needs the form; every
    // other saved host can reconnect straight away.
    if (host.authMethod === "password" && !host.password) {
      setNotice(`Enter the password for ${host.label || host.host} to connect.`);
      return;
    }
    void openSshTab(savedHostRequest(host), {
      showProgress: true,
      savedHostId: host.id,
    });
  };

  const handleLocal = () => {
    void openLocalTab({ showProgress: activeWorkspaceIdRef.current === null });
  };

  const handleClear = () => {
    const id = activeWorkspace?.activePaneId;
    if (id) {
      terminalActions.current.get(id)?.clear();
    }
  };

  const closeSftpFor = useCallback((workspaceId: string) => {
    setSftpViews((current) => {
      if (!(workspaceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[workspaceId];
      return next;
    });
  }, []);

  // Clicking the tab whose file manager is showing returns to that tab's
  // terminal: the tab strip is the natural way back, so the SFTP button is
  // only the entry point. Clicking another tab switches as usual.
  const handleSelectWorkspace = useCallback(
    (id: string) => {
      if (id === activeWorkspaceIdRef.current && sftpViews[id]) {
        closeSftpFor(id);
        const paneId = activeWorkspace?.activePaneId;
        if (paneId) {
          focusSessionSoon(paneId);
        }
        return;
      }
      selectWorkspace(id);
    },
    [activeWorkspace, closeSftpFor, focusSessionSoon, selectWorkspace, sftpViews],
  );

  // The SFTP button is the entry point: it opens the file manager inside the
  // current tab and can also close it again. The tab strip is the other way back.
  const toggleSftp = useCallback(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    const session = activeSession;
    if (!workspaceId) {
      setNotice("Connect to a server before opening SFTP.");
      return;
    }
    if (!session) {
      setNotice("Connect to a server before opening SFTP.");
      return;
    }
    if (session.info.Kind !== "ssh") {
      setNotice("SFTP is only available for SSH sessions.");
      return;
    }
    if (session.exit) {
      setNotice("Reconnect this session before opening SFTP.");
      return;
    }
    // Labels follow renamed tabs; the picker also lists every live session so
    // the left pane can browse another host.
    const labels: Record<string, string> = {};
    for (const item of sessions) {
      if (item.info.Kind === "ssh" && !item.exit) {
        labels[item.info.ID] = item.label;
      }
    }
    void SFTPService.SetLabels(labels).catch(() => undefined);
    setSftpViews((current) => {
      if (current[workspaceId]) {
        const next = { ...current };
        delete next[workspaceId];
        return next;
      }
      return { ...current, [workspaceId]: session.info.ID };
    });
  }, [activeSession, activeWorkspace, sessions]);

  // Closing a tab takes its file manager with it.
  useEffect(() => {
    setSftpViews((current) => {
      const live = new Set(workspaces.map((workspace) => workspace.id));
      const kept: Record<string, string> = {};
      for (const [id, sessionId] of Object.entries(current)) {
        if (live.has(id)) {
          kept[id] = sessionId;
        }
      }
      return Object.keys(kept).length === Object.keys(current).length ? current : kept;
    });
  }, [workspaces]);

  const handleDisconnectAll = () => {
    const count = sessions.length;
    setConfirmDisconnectAll(false);
    if (activeConnect.current) {
      cancelConnect();
    }
    terminalActions.current.clear();
    for (const session of sessions) {
      releaseTerminal(session.info.ID);
      void SSHService.Disconnect(session.info.ID).catch(() => undefined);
    }
    setSessions([]);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setBroadcast(false);
    setPendingTrust(null);
    setSplitPicker(null);
    setError(null);
    setSidebarHidden(false);
    setNotice(count === 1 ? "Closed the open session." : `Closed all ${count} sessions.`);
  };

  const handleTrustHost = () => {
    const trust = pendingTrust;
    if (!trust) {
      return;
    }
    setPendingTrust(null);
    void openSshTab(
      { ...trust.request, TrustNewHostKey: true },
      trust.options ?? {},
    );
  };

  const handleTrustCancel = () => {
    const trust = pendingTrust;
    setPendingTrust(null);
    const message = "Host key was not trusted, so the connection was cancelled.";
    if (trust?.origin === "form") {
      setError(message);
    } else {
      setNotice(message);
    }
  };

  return (
    <div className="app">
      <Sidebar
        hosts={hosts}
        groups={groups}
        hidden={sidebarHidden}
        onNew={handleNew}
        onLocal={handleLocal}
        onOpen={handleOpenHost}
        onConnect={handleConnectHost}
        onEdit={handleEditHost}
        onDelete={handleDeleteHost}
        onDuplicate={handleDuplicateHost}
        onMoveToGroup={handleMoveToGroup}
        connectedIds={connectedHostIds}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className={sidebarHidden ? "main is-focus" : "main"}>
        {workspaces.length > 0 && (
          <TabBar
            tabs={tabItems}
            activeId={activeWorkspaceId}
            sidebarHidden={sidebarHidden}
            dropHint={tabHint}
            draggingId={
              draggingSessionId ? workspaceBySession.get(draggingSessionId) ?? null : null
            }
            onToggleSidebar={() => setSidebarHidden((hidden) => !hidden)}
            onSelect={handleSelectWorkspace}
            onClose={closeWorkspace}
            onNew={handleNew}
            onClear={handleClear}
            broadcast={broadcast}
            broadcastAvailable={liveSessionIds.length > 1}
            onToggleBroadcast={handleToggleBroadcast}
            sftpAvailable={Boolean(sftpSession)}
            sftpActive={Boolean(sftpViews[activeWorkspaceId ?? ""])}
            sftpTarget={
              sftpSession
                ? `${sftpSession.label} — ${sftpSession.info.User}@${sftpSession.info.Host}`
                : ""
            }
            onToggleSftp={toggleSftp}
            onDisconnectAll={() => setConfirmDisconnectAll(true)}
            onDuplicate={duplicateWorkspace}
            onRename={renameWorkspace}
            onSplit={requestSplit}
            onDragTab={beginTabDrag}
          />
        )}

        <div className="main-body">
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className={
                workspace.id === activeWorkspaceId ? "pane-slot is-active" : "pane-slot"
              }
            >
              <SplitWorkspace
                workspace={workspace}
                sessions={sessionById}
                active={workspace.id === activeWorkspaceId}
                globalTheme={settings.theme}
                prefs={terminalPrefs}
                dropHint={paneHint}
                draggingSessionId={draggingSessionId}
                onFocusPane={focusPane}
                onClosePane={closePane}
                onReconnectPane={reconnectPane}
                onRatioChange={changeRatio}
                onDragPane={beginSessionDrag}
                registerActions={registerActions}
              />
            </div>
          ))}

          {/* SFTP is a view layered over the panes rather than a second window:
              the tab strip stays on screen and the terminals underneath stay
              mounted, so a return to the terminal shows the live session. */}
          {workspaces.map((workspace) => {
            const sessionId = sftpViews[workspace.id];
            if (!sessionId) {
              return null;
            }
            const session = sessionById.get(sessionId);
            return (
              <div
                key={`sftp-${workspace.id}`}
                className={
                  workspace.id === activeWorkspaceId ? "sftp-slot is-active" : "sftp-slot"
                }
              >
                <SftpView
                  sessionId={sessionId}
                  label={session?.label ?? workspace.label}
                  onExit={() => closeSftpFor(workspace.id)}
                />
              </div>
            );
          })}

          {activeWorkspaceId === null && (
            <ConnectForm
              key={formSeed}
              initial={initial}
              editing={editingId !== null}
              connecting={connecting}
              error={error}
              groups={groups}
              globalTheme={settings.theme}
              onConnect={(request) =>
                void openSshTab(request, {
                  showProgress: true,
                  savedHostId: editingId,
                })
              }
              onSave={handleSaveHost}
            />
          )}
        </div>
      </main>

      {connectVisual && (
        <ConnectingOverlay visual={connectVisual} onCancel={cancelConnect} />
      )}

      {pendingTrust && (
        <TrustHostDialog
          trust={pendingTrust}
          onTrust={handleTrustHost}
          onCancel={handleTrustCancel}
        />
      )}

      {confirmDisconnectAll && (
        <ConfirmDialog
          eyebrow="Close all sessions"
          title="Disconnect all sessions?"
          description={
            sessions.length === 1
              ? "This ends the open session and closes its tab. Scrollback will be lost."
              : `This ends all ${sessions.length} open sessions and closes every tab. Scrollback will be lost.`
          }
          confirmLabel="Disconnect all"
          onConfirm={handleDisconnectAll}
          onCancel={() => setConfirmDisconnectAll(false)}
        />
      )}

      {notice && (
        <div className="toast" role="alert" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      {splitPicker && (
        <SplitPicker
          candidates={splitCandidates(splitPicker.workspaceId)}
          direction={splitPicker.direction}
          x={splitPicker.x}
          y={splitPicker.y}
          onPick={(sessionId) => {
            dockSession(sessionId, {
              kind: "pane",
              workspaceId: splitPicker.workspaceId,
              sessionId: splitPicker.targetSessionId,
              edge: splitPicker.direction === "row" ? "right" : "bottom",
            });
            setSplitPicker(null);
          }}
          onClose={() => setSplitPicker(null)}
        />
      )}

      {dragGhost && (
        <div className="drag-ghost" ref={dragGhostRef} aria-hidden="true">
          <span className="drag-ghost-title">{dragGhost.title}</span>
          <span className="drag-ghost-meta">{dragGhost.meta}</span>
        </div>
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function insertWorkspace(
  workspaces: WorkspaceTab[],
  workspace: WorkspaceTab,
  afterId?: string,
): WorkspaceTab[] {
  if (!afterId) {
    return [...workspaces, workspace];
  }
  const index = workspaces.findIndex((item) => item.id === afterId);
  if (index < 0) {
    return [...workspaces, workspace];
  }
  return [...workspaces.slice(0, index + 1), workspace, ...workspaces.slice(index + 1)];
}

/** Matches an open SSH session to a saved host entry. */
function hostTabMatches(host: SavedHost, session: SessionTab): boolean {
  return (
    session.info.Kind === "ssh" &&
    session.info.Host === host.host &&
    session.info.Port === host.port &&
    (!host.user || session.info.User === host.user)
  );
}

function hostHasOpenSession(host: SavedHost, sessions: SessionTab[]): boolean {
  return sessions.some((session) => hostTabMatches(host, session));
}

/** Returns the next free "Base (n)" alias among the open session labels. */
function copyLabel(base: string, labels: Array<SessionTab | string>): string {
  const stem = base.replace(/\s*\(\d+\)\s*$/, "").trim() || base.trim();
  const pattern = new RegExp(`^${escapeRegExp(stem)} \\((\\d+)\\)$`);
  let next = 1;
  for (const entry of labels) {
    const label = typeof entry === "string" ? entry : entry.label;
    const match = label.match(pattern);
    if (match) {
      next = Math.max(next, Number(match[1]) + 1);
    }
  }
  return `${stem} (${next})`;
}

function tabMeta(session: SessionTab): string {
  const { info } = session;
  if (info.Kind === "local") {
    return `${info.User}@local`;
  }
  return `${info.User}@${info.Host}:${info.Port}`;
}

/**
 * The name a tab would show itself: one host keeps its own label, two hosts
 * read "A + B", and beyond that the extra panes are counted up. An empty
 * result means the panes have no labels yet, so the caller keeps the old name.
 */
function workspaceAutoName(
  ids: string[],
  resolve: (id: string) => SessionTab | undefined,
): string {
  const labels = ids
    .map((id) => resolve(id)?.label)
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0];
  }
  const [head, second] = labels;
  if (labels.length === 2) {
    return head === second ? `${head} +1` : `${head} + ${second}`;
  }
  return `${head} +${labels.length - 1}`;
}

/** Re-derives a tab's name from its panes, leaving hand-typed names alone. */
function withWorkspaceLabel(
  workspace: WorkspaceTab,
  resolve: (id: string) => SessionTab | undefined,
): WorkspaceTab {
  if (workspace.customLabel) {
    return workspace;
  }
  const auto = workspaceAutoName(collectSessionIds(workspace.root), resolve);
  return auto && auto !== workspace.label ? { ...workspace, label: auto } : workspace;
}

/** Sub-line under the tab name: what is actually inside this workspace. */
function workspaceMeta(
  ids: string[],
  resolve: (id: string) => SessionTab | undefined,
): string {
  const metas = ids
    .map((id) => {
      const session = resolve(id);
      return session ? tabMeta(session) : "";
    })
    .filter(Boolean);
  if (metas.length <= 1) {
    return metas[0] ?? "";
  }
  const shown = metas.slice(0, 2);
  const rest = metas.length - shown.length;
  return shown.join(" · ") + (rest > 0 ? ` · +${rest}` : "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function savedHostRequest(host: SavedHost): ConnectRequest {
  const hasPassword = host.authMethod === "password" && host.password !== "";
  const hasPassphrase = host.authMethod === "key" && host.passphrase !== "";
  return {
    RequestID: "",
    Host: host.host,
    Port: host.port,
    User: host.user,
    // Entries saved before key auth existed say "agent"; there is no agent in
    // a GUI app, so connect with the key instead.
    AuthMethod: host.authMethod === "agent" ? "key" : host.authMethod,
    Password: hasPassword ? host.password : "",
    KeyPath: host.keyPath,
    Passphrase: hasPassphrase ? host.passphrase : "",
    Cols: 120,
    Rows: 32,
    TrustNewHostKey: false,
    // Filled in from the emulation setting at connect time.
    Term: "",
    RememberPassword: hasPassword,
    RememberPassphrase: hasPassphrase,
    Label: host.label,
    Group: host.group,
    Theme: host.theme,
  };
}

function newRequestID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `connect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newWorkspaceID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `tab-${crypto.randomUUID()}`;
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseTrustError(err: unknown): Pick<PendingTrust, "address" | "fingerprint"> | null {
  const message = errorMessage(err);
  if (!message.includes("the host key is not trusted yet")) {
    return null;
  }
  const match = message.match(
    /not trusted yet: (\S+) has fingerprint (SHA256:[A-Za-z0-9+/=]+)/,
  );
  if (!match) {
    return null;
  }
  return { address: match[1], fingerprint: match[2] };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err) {
    return err;
  }
  return "Connection failed. Check the host and your credentials.";
}
