import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Events } from "@wailsio/runtime";
import { SFTPService } from "../../bindings/conch";
import type { SFTPConflict, SFTPEntry, SFTPListing, SFTPSource } from "../../bindings/conch/models";
import { SftpTransfer, SshExit } from "../../bindings/events";
import { ChmodDialog } from "./ChmodDialog";
import { OverwriteDialog } from "./OverwriteDialog";
import { SftpRowMenu, type RowMenuTarget } from "./SftpRowMenu";
import { SourceGlyph, SourcePicker } from "./SourcePicker";
import { TransferPanel } from "./TransferPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  childPath,
  fileManagerLabel,
  isWindows,
  localMachineLabel,
  trashName,
  windowsNameProblem,
} from "../lib/platform";
import { sourceAddress, sourceKey } from "../lib/sftp";
import {
  firstTransferError,
  formatBytes,
  formatModified,
  transferInFlight,
  type SFTPTransferEvent,
  type TransferSide,
  type TransferState,
} from "../lib/transfer";

interface SftpViewProps {
  sessionId: string;
  label: string;
  onExit: () => void;
}

interface PaneView {
  listing: SFTPListing | null;
  loading: boolean;
  error: string;
  path: string;
}

interface PendingOverwrite {
  from: Side;
  names: string[];
  conflicts: SFTPConflict[];
  sourceLabel: string;
  targetLabel: string;
}

interface Renaming {
  side: Side;
  from: string;
  value: string;
  busy: boolean;
  error: string;
}

interface ChmodTarget {
  side: Side;
  names: string[];
  isDir: boolean;
  perm: number;
  busy: boolean;
  error: string;
}

interface DeleteTarget {
  side: Side;
  names: string[];
}

type Side = TransferSide;

const LOCAL_SOURCE: SFTPSource = {
  Kind: "local",
  SessionID: "",
  Label: localMachineLabel,
  Host: "localhost",
  User: "",
  Port: 0,
};

function blankPane(path = ""): PaneView {
  return { listing: null, loading: false, error: "", path };
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  return "Something went wrong.";
}

function newTransferID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `transfer-${crypto.randomUUID()}`;
  }
  return `transfer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Leaving for the terminal unmounts the view, so the folders each pane was
// looking at live outside it. Keyed by session, because two tabs browsing the
// same host should not share one "last folder".
const folderMemory = new Map<string, string>();

function memoryKey(sessionId: string, source: SFTPSource): string {
  return `${sessionId}|${sourceKey(source)}`;
}

export function SftpView({ sessionId, label, onExit }: SftpViewProps) {
  const fallbackRight = useMemo<SFTPSource>(
    () => ({
      Kind: "remote",
      SessionID: sessionId,
      Label: label,
      Host: "",
      User: "",
      Port: 0,
    }),
    [sessionId, label],
  );

  const [sources, setSources] = useState<SFTPSource[]>([LOCAL_SOURCE, fallbackRight]);
  const [leftSource, setLeftSource] = useState<SFTPSource>(LOCAL_SOURCE);
  const [rightSource, setRightSource] = useState<SFTPSource>(fallbackRight);
  const [panes, setPanes] = useState<Record<Side, PaneView>>({
    left: blankPane(),
    right: blankPane(),
  });
  const [selections, setSelections] = useState<Record<Side, string[]>>({ left: [], right: [] });
  const [rightGone, setRightGone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [overwritePrompt, setOverwritePrompt] = useState<PendingOverwrite | null>(null);
  const [checking, setChecking] = useState(false);
  const [dragSource, setDragSource] = useState<{ side: Side; names: string[] } | null>(null);
  const [dropSide, setDropSide] = useState<Side | null>(null);
  const [menu, setMenu] = useState<RowMenuTarget | null>(null);
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const [chmodTarget, setChmodTarget] = useState<ChmodTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // One toast for every outcome; the card turns red only when something failed.
  const notify = useCallback((text: string | null, isError = false) => {
    setNoticeIsError(isError);
    setNotice(text);
  }, []);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestSeq = useRef<Record<Side, number>>({ left: 0, right: 0 });
  const remember = useCallback(
    (source: SFTPSource, path: string) => {
      if (path) {
        folderMemory.set(memoryKey(sessionId, source), path);
      }
    },
    [sessionId],
  );
  const recall = useCallback(
    (source: SFTPSource) => folderMemory.get(memoryKey(sessionId, source)) ?? "",
    [sessionId],
  );
  const anchors = useRef<Record<Side, string | null>>({ left: null, right: null });
  const panesRef = useRef(panes);
  const leftSourceRef = useRef(leftSource);
  const rightSourceRef = useRef(rightSource);
  const transferRef = useRef<TransferState | null>(null);
  const preflightRef = useRef(false);
  const renameInFlight = useRef(false);
  const dragRef = useRef<{ side: Side; names: string[] } | null>(null);

  useEffect(() => {
    panesRef.current = panes;
  }, [panes]);

  useEffect(() => {
    leftSourceRef.current = leftSource;
  }, [leftSource]);

  useEffect(() => {
    rightSourceRef.current = rightSource;
  }, [rightSource]);

  useEffect(() => {
    transferRef.current = transfer;
  }, [transfer]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => notify(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // A successful batch dismisses itself; failures stay so the reason is readable.
  useEffect(() => {
    if (transfer?.phase !== "success") {
      return;
    }
    const timer = window.setTimeout(() => {
      setTransfer((current) => (current?.phase === "success" ? null : current));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [transfer?.phase, transfer?.id]);

  const loadPane = useCallback(
    async (side: Side, source: SFTPSource, targetPath: string, homeFallback = false) => {
      const seq = requestSeq.current[side] + 1;
      requestSeq.current[side] = seq;
      setPanes((current) => ({
        ...current,
        [side]: {
          ...current[side],
          loading: true,
          error: "",
          path: targetPath || current[side].path,
        },
      }));
      try {
        const listing = await SFTPService.List({ Source: source, Path: targetPath });
        if (requestSeq.current[side] !== seq) {
          return;
        }
        if (!listing) {
          throw new Error("The folder could not be read.");
        }
        remember(source, listing.Path);
        setPanes((current) => ({
          ...current,
          [side]: { listing, loading: false, error: "", path: listing.Path },
        }));
        setSelections((current) => ({ ...current, [side]: [] }));
        anchors.current[side] = null;
      } catch (err) {
        if (requestSeq.current[side] !== seq) {
          return;
        }
        if (homeFallback && targetPath) {
          // A remembered folder can disappear or lose its permission between
          // visits; opening home beats showing a dead error card.
          void loadPane(side, source, "");
          return;
        }
        setPanes((current) => ({
          ...current,
          [side]: { ...current[side], loading: false, error: errorText(err) },
        }));
      }
    },
    [remember],
  );

  // Reload a folder and keep the named entries selected, so a rename or a
  // permission change leaves the same rows picked.
  const reloadKeeping = useCallback(
    async (side: Side, keep: string[]) => {
      const source = side === "left" ? leftSourceRef.current : rightSourceRef.current;
      const dir = panesRef.current[side].listing?.Path ?? "";
      const seq = requestSeq.current[side] + 1;
      requestSeq.current[side] = seq;
      try {
        const listing = await SFTPService.List({ Source: source, Path: dir });
        if (requestSeq.current[side] !== seq || !listing) {
          return;
        }
        remember(source, listing.Path);
        const present = new Set((listing.Entries ?? []).map((entry) => entry.Name));
        setPanes((current) => ({
          ...current,
          [side]: { listing, loading: false, error: "", path: listing.Path },
        }));
        const survivors = keep.filter((name) => present.has(name));
        setSelections((current) => ({ ...current, [side]: survivors }));
        anchors.current[side] = survivors[0] ?? null;
      } catch (err) {
        setPanes((current) => ({
          ...current,
          [side]: { ...current[side], loading: false, error: errorText(err) },
        }));
      }
    },
    [remember],
  );

  // Boot: resolve live sources first so both panes can show proper labels.
  useEffect(() => {
    let active = true;
    const boot = async () => {
      let list: SFTPSource[] = [LOCAL_SOURCE, fallbackRight];
      try {
        const loaded = await SFTPService.Sources();
        if (loaded && loaded.length > 0) {
          list = loaded;
        }
      } catch {
        // Fall back to the session this view was opened for.
      }
      if (!active) {
        return;
      }
      setSources(list);
      const local = list.find((source) => source.Kind === "local") ?? LOCAL_SOURCE;
      const remote =
        list.find((source) => source.Kind === "remote" && source.SessionID === sessionId) ??
        fallbackRight;
      setLeftSource(local);
      setRightSource(remote);
      void loadPane("left", local, recall(local), true);
      void loadPane("right", remote, recall(remote), true);
    };
    void boot();
    return () => {
      active = false;
    };
  }, [sessionId, fallbackRight, loadPane, recall]);

  // Pick up hosts that connected since this view opened.
  useEffect(() => {
    const refresh = async () => {
      try {
        const list = await SFTPService.Sources();
        if (!list) {
          return;
        }
        setSources(list);
        setLeftSource((current) => {
          const next = list.find((source) => sourceKey(source) === sourceKey(current));
          return next && next.Label !== current.Label ? next : current;
        });
        setRightSource((current) => {
          const next = list.find((source) => sourceKey(source) === sourceKey(current));
          return next && next.Label !== current.Label ? next : current;
        });
      } catch {
        // A transient refresh failure leaves the current list in place.
      }
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    return Events.On(SshExit, (event) => {
      const info = event.data as unknown as { SessionID: string; Error: string };
      if (info.SessionID === sessionId) {
        setRightGone(true);
      }
      if (info.SessionID === leftSourceRef.current.SessionID) {
        setLeftSource(LOCAL_SOURCE);
        setPanes((current) => ({
          ...current,
          left: { listing: null, loading: true, error: "", path: "" },
        }));
        setSelections((current) => ({ ...current, left: [] }));
        void loadPane("left", LOCAL_SOURCE, recall(LOCAL_SOURCE), true);
        notify(`The source connection ended. Showing ${localMachineLabel}.`);
      }
    });
  }, [sessionId, loadPane, recall]);

  useEffect(() => {
    return Events.On(SftpTransfer, (event) => {
      const progress = event.data as unknown as SFTPTransferEvent;
      setTransfer((current) => {
        if (!current || current.id !== progress.TransferID || !transferInFlight(current)) {
          return current;
        }
        return {
          ...current,
          percent: progress.Percent,
          bytes: progress.Bytes,
          totalBytes: progress.TotalBytes || current.totalBytes,
          sourceLabel: progress.SourceLabel || current.sourceLabel,
          targetLabel: progress.TargetLabel || current.targetLabel,
          currentName: progress.CurrentName || current.currentName,
          fileIndex: progress.FileIndex,
          fileCount: progress.FileCount || current.fileCount,
        };
      });
    });
  }, []);

  const selectedSets = useMemo(
    () => ({
      left: new Set(selections.left),
      right: new Set(selections.right),
    }),
    [selections],
  );

  const busy = transferInFlight(transfer);

  const runTransfer = useCallback(
    async (from: Side, names: string[], overwrite: boolean) => {
      if (names.length === 0) {
        return;
      }
      if (transferInFlight(transferRef.current)) {
        notify("A transfer is already in progress.", true);
        return;
      }
      if (from === "right" && rightGone) {
        notify("This SSH connection has ended.", true);
        return;
      }
      const pane = panesRef.current;
      const source = from === "left" ? leftSourceRef.current : rightSourceRef.current;
      const target = from === "left" ? rightSourceRef.current : leftSourceRef.current;
      const sourcePane = pane[from];
      const to: Side = from === "left" ? "right" : "left";
      const targetPane = pane[to];
      if (!sourcePane.listing || !targetPane.listing) {
        notify("Open a folder on both sides before copying.", true);
        return;
      }

      const id = newTransferID();
      const initial: TransferState = {
        id,
        sourceLabel: source.Label,
        targetLabel: target.Label,
        targetSide: to,
        phase: "running",
        percent: 0,
        bytes: 0,
        totalBytes: 0,
        currentName: "",
        fileIndex: 0,
        fileCount: names.length,
        copied: 0,
        failed: 0,
        error: "",
      };
      transferRef.current = initial;
      setTransfer(initial);

      try {
        const result = await SFTPService.Transfer({
          TransferID: id,
          Source: source,
          SourceDir: sourcePane.listing.Path,
          Target: target,
          TargetDir: targetPane.listing.Path,
          Names: names,
          Overwrite: overwrite,
        });
        const current = transferRef.current;
        if (current && current.id === id) {
          let next: TransferState;
          if (!result) {
            next = { ...current, phase: "error", error: "The transfer did not start." };
          } else if (result.Canceled) {
            next = {
              ...current,
              phase: "canceled",
              copied: result.Copied,
              failed: result.Failed,
              bytes: result.Bytes,
              totalBytes: result.TotalBytes || current.totalBytes,
            };
          } else if (result.Failed > 0) {
            next = {
              ...current,
              phase: "error",
              copied: result.Copied,
              failed: result.Failed,
              bytes: result.Bytes,
              totalBytes: result.TotalBytes || current.totalBytes,
              error: firstTransferError(result) || "Some items could not be copied.",
            };
          } else {
            next = {
              ...current,
              phase: "success",
              percent: 100,
              copied: result.Copied,
              failed: 0,
              bytes: result.TotalBytes || result.Bytes,
              totalBytes: result.TotalBytes || current.totalBytes,
            };
          }
          transferRef.current = next;
          setTransfer(next);
        }
        // Show any renamed, new or partial items without moving the target.
        const liveTarget = panesRef.current[to];
        if (liveTarget.listing) {
          void loadPane(to, target, liveTarget.listing.Path);
        }
      } catch (err) {
        setTransfer((current) =>
          current && current.id === id
            ? { ...current, phase: "error", error: errorText(err) }
            : current,
        );
        const liveTarget = panesRef.current[to];
        if (liveTarget.listing) {
          void loadPane(to, target, liveTarget.listing.Path);
        }
      }
    },
    [loadPane, rightGone],
  );

  const startTransfer = useCallback(
    async (from: Side, names: string[]) => {
      if (names.length === 0) {
        return;
      }
      if (transferInFlight(transferRef.current) || preflightRef.current) {
        notify("A transfer is already in progress.", true);
        return;
      }
      if (from === "right" && rightGone) {
        notify("This SSH connection has ended.", true);
        return;
      }
      const pane = panesRef.current;
      const source = from === "left" ? leftSourceRef.current : rightSourceRef.current;
      const target = from === "left" ? rightSourceRef.current : leftSourceRef.current;
      const sourcePane = pane[from];
      const to: Side = from === "left" ? "right" : "left";
      const targetPane = pane[to];
      if (!sourcePane.listing || !targetPane.listing) {
        notify("Open a folder on both sides before copying.", true);
        return;
      }

      preflightRef.current = true;
      setChecking(true);
      let conflicts: SFTPConflict[] = [];
      try {
        conflicts =
          (await SFTPService.Conflicts({
            Source: source,
            SourceDir: sourcePane.listing.Path,
            Target: target,
            TargetDir: targetPane.listing.Path,
            Names: names,
          })) ?? [];
      } catch {
        // If the check fails, the transfer falls back to unique names.
      } finally {
        preflightRef.current = false;
        setChecking(false);
      }

      if (conflicts.length > 0) {
        setOverwritePrompt({
          from,
          names,
          conflicts,
          sourceLabel: source.Label,
          targetLabel: target.Label,
        });
        return;
      }
      void runTransfer(from, names, false);
    },
    [rightGone, runTransfer],
  );

  const resolveOverwrite = (overwrite: boolean) => {
    const prompt = overwritePrompt;
    if (!prompt) {
      return;
    }
    setOverwritePrompt(null);
    if (overwrite) {
      void runTransfer(prompt.from, prompt.names, true);
      return;
    }
    const skipped = new Set(prompt.conflicts.map((conflict) => conflict.Name));
    const remaining = prompt.names.filter((name) => !skipped.has(name));
    if (remaining.length === 0) {
      notify("All selected files already exist, so nothing was copied.");
      return;
    }
    void runTransfer(prompt.from, remaining, false);
  };

  const cancelTransfer = useCallback(() => {
    const current = transferRef.current;
    if (!current || !transferInFlight(current) || current.phase === "canceling") {
      return;
    }
    const next: TransferState = { ...current, phase: "canceling" };
    transferRef.current = next;
    setTransfer(next);
    void SFTPService.CancelTransfer(current.id).catch(() => undefined);
  }, []);

  const dismissTransfer = useCallback(() => {
    if (transferInFlight(transferRef.current)) {
      return;
    }
    setTransfer(null);
  }, []);

  const paneOf = (side: Side) => panesRef.current[side];
  const sourceOf = (side: Side) =>
    side === "left" ? leftSourceRef.current : rightSourceRef.current;

  const chooseLeftSource = (key: string) => {
    const next = sources.find((source) => sourceKey(source) === key);
    if (!next || sourceKey(next) === sourceKey(leftSource)) {
      return;
    }
    setLeftSource(next);
    setSelections((current) => ({ ...current, left: [] }));
    anchors.current.left = null;
    const path = recall(next);
    setPanes((current) => ({
      ...current,
      left: { listing: null, loading: true, error: "", path },
    }));
    void loadPane("left", next, path, true);
  };

  const navigate = (side: Side, path: string) => {
    const source = side === "left" ? leftSource : rightSource;
    if (side === "right" && rightGone) {
      return;
    }
    void loadPane(side, source, path);
  };

  const submitPath = (side: Side) => {
    const pane = panes[side];
    navigate(side, pane.path.trim());
  };

  const openEntry = (side: Side, entry: SFTPEntry) => {
    const listing = panes[side].listing;
    if (!listing) {
      return;
    }
    if (entry.IsDir) {
      navigate(side, childPath(listing.Path, entry.Name));
      return;
    }
    void startTransfer(side, [entry.Name]);
  };

  const selectRow = (side: Side, index: number, event: ReactMouseEvent) => {
    const entries = panes[side].listing?.Entries ?? [];
    const names = entries.map((entry) => entry.Name);
    const clicked = names[index];
    if (!clicked) {
      return;
    }
    const anchor = anchors.current[side];
    if (event.shiftKey && anchor) {
      const from = names.indexOf(anchor);
      if (from >= 0) {
        const [low, high] = from < index ? [from, index] : [index, from];
        setSelections((current) => {
          const next = new Set(current[side]);
          for (let i = low; i <= high; i += 1) {
            next.add(names[i]);
          }
          return { ...current, [side]: Array.from(next) };
        });
        return;
      }
    }
    anchors.current[side] = clicked;
    if (event.metaKey || event.ctrlKey) {
      setSelections((current) => {
        const next = new Set(current[side]);
        if (next.has(clicked)) {
          next.delete(clicked);
        } else {
          next.add(clicked);
        }
        return { ...current, [side]: Array.from(next) };
      });
      return;
    }
    setSelections((current) => ({ ...current, [side]: [clicked] }));
  };

  // Right-click selects the clicked row first (unless it is already part of the
  // selection) so the menu always acts on what the pointer is on.
  const openRowMenu = (
    side: Side,
    index: number,
    event: { preventDefault: () => void; clientX: number; clientY: number },
  ) => {
    if (side === "right" && rightGone) {
      return;
    }
    event.preventDefault();
    const entries = panes[side].listing?.Entries ?? [];
    const entry = entries[index];
    if (!entry) {
      return;
    }
    const chosen = selectedSets[side].has(entry.Name) ? selections[side] : [entry.Name];
    if (!selectedSets[side].has(entry.Name)) {
      anchors.current[side] = entry.Name;
      setSelections((current) => ({ ...current, [side]: [entry.Name] }));
    }
    setMenu({ side, names: chosen, x: event.clientX + 2, y: event.clientY + 2 });
  };

  const openRowMenuRef = useRef(openRowMenu);
  useEffect(() => {
    openRowMenuRef.current = openRowMenu;
  });

  // WKWebView hands a right-click to its own Cut/Copy/Paste menu before the
  // React handler on the row ever runs, so the file area has to claim the event
  // at the window in the capture phase — the same approach the tab strip and the
  // sidebar use. Text fields are left alone so they keep native editing.
  useEffect(() => {
    const onContextMenu = (event: globalThis.MouseEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Element) || !root.contains(target)) {
        return;
      }
      if (target.closest('input, textarea, [contenteditable="true"]')) {
        return;
      }
      event.preventDefault();
      const row = target.closest<HTMLElement>("[data-sftp-row]");
      if (!row) {
        return;
      }
      event.stopPropagation();
      const index = Number(row.dataset.sftpIndex);
      if (Number.isInteger(index) && index >= 0) {
        openRowMenuRef.current(row.dataset.sftpSide === "right" ? "right" : "left", index, event);
      }
    };
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => window.removeEventListener("contextmenu", onContextMenu, true);
  }, []);

  const beginRename = (side: Side, name: string) => {
    setMenu(null);
    setRenaming({ side, from: name, value: name, busy: false, error: "" });
  };

  const commitRename = useCallback(async () => {
    const current = renaming;
    if (!current || current.busy || renameInFlight.current) {
      return;
    }
    const target = current.value.trim();
    if (!target || target === current.from) {
      setRenaming(null);
      return;
    }
    if (target.includes("/") || target.includes("\\")) {
      setRenaming({ ...current, error: "A name cannot contain / or \\" });
      return;
    }
    if (isWindows && sourceOf(current.side).Kind === "local" && windowsNameProblem(target)) {
      setRenaming({ ...current, error: `“${target}” is not a valid Windows name` });
      return;
    }
    const source = sourceOf(current.side);
    const dir = paneOf(current.side).listing?.Path ?? "";
    renameInFlight.current = true;
    setRenaming({ ...current, busy: true, error: "" });
    try {
      await SFTPService.Rename({ Source: source, Dir: dir, From: current.from, To: target });
      setRenaming(null);
      void reloadKeeping(current.side, [target]);
      notify(`Renamed to “${target}”.`);
    } catch (err) {
      setRenaming({ ...current, busy: false, error: errorText(err) });
    } finally {
      renameInFlight.current = false;
    }
  }, [renaming, reloadKeeping]);

  const beginChmod = async (side: Side, names: string[]) => {
    setMenu(null);
    if (names.length === 0) {
      return;
    }
    const source = sourceOf(side);
    const dir = panesRef.current[side].listing?.Path ?? "";
    const entry = panesRef.current[side].listing?.Entries?.find((item) => item.Name === names[0]);
    let perm = entry?.Perm ?? 0o644;
    try {
      const fresh = await SFTPService.Stat({ Source: source, Dir: dir, Name: names[0] });
      if (fresh) {
        perm = fresh.Perm;
      }
    } catch {
      // Fall back to the value the listing already showed.
    }
    setChmodTarget({
      side,
      names,
      isDir: Boolean(entry?.IsDir),
      perm,
      busy: false,
      error: "",
    });
  };

  const applyChmod = useCallback(
    async (perm: number) => {
      const target = chmodTarget;
      if (!target || target.busy) {
        return;
      }
      const source = sourceOf(target.side);
      const dir = panesRef.current[target.side].listing?.Path ?? "";
      setChmodTarget({ ...target, perm, busy: true, error: "" });
      try {
        await SFTPService.Chmod({ Source: source, Dir: dir, Names: target.names, Perm: perm });
        setChmodTarget(null);
        void reloadKeeping(target.side, target.names);
        notify(
          target.names.length === 1
            ? `Permissions set on “${target.names[0]}”.`
            : `Permissions set on ${target.names.length} items.`,
        );
      } catch (err) {
        setChmodTarget({ ...target, perm, busy: false, error: errorText(err) });
      }
    },
    [chmodTarget, reloadKeeping],
  );

  const beginDelete = (side: Side, names: string[]) => {
    setMenu(null);
    if (names.length === 0) {
      return;
    }
    setDeleteTarget({ side, names });
  };

  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target) {
      return;
    }
    const source = sourceOf(target.side);
    const dir = panesRef.current[target.side].listing?.Path ?? "";
    setDeleteTarget(null);
    try {
      await SFTPService.Delete({ Source: source, Dir: dir, Names: target.names });
      void reloadKeeping(target.side, []);
      notify(
        source.Kind === "local"
          ? target.names.length === 1
            ? `“${target.names[0]}” moved to the ${trashName}.`
            : `${target.names.length} items moved to the ${trashName}.`
          : target.names.length === 1
            ? `“${target.names[0]}” deleted.`
            : `${target.names.length} items deleted.`,
      );
    } catch (err) {
      notify(errorText(err), true);
    }
  }, [deleteTarget, reloadKeeping]);

  const beginDrag = (side: Side, entry: SFTPEntry, event: ReactDragEvent) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    const chosen = selectedSets[side].has(entry.Name) ? selections[side] : [entry.Name];
    const payload = { side, names: chosen };
    dragRef.current = payload;
    setDragSource(payload);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", chosen.join("\n"));
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragSource(null);
    setDropSide(null);
  };

  const dropOnPane = (side: Side, event: ReactDragEvent) => {
    event.preventDefault();
    const payload = dragRef.current;
    setDropSide(null);
    if (!payload || payload.side === side) {
      return;
    }
    void startTransfer(payload.side, payload.names);
  };

  const dragOverPane = (side: Side, event: ReactDragEvent) => {
    const payload = dragRef.current;
    if (!payload || payload.side === side) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (dropSide !== side) {
      setDropSide(side);
    }
  };

  // Rename edits happen inside the pane, so only the portal overlays pull the
  // file area back; otherwise the row being edited would fade while you type.
  const anyOverlay = Boolean(menu || chmodTarget || deleteTarget || overwritePrompt);

  // Escape walks back out one layer at a time: menu, rename, then the view.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (menu) {
        event.preventDefault();
        setMenu(null);
        return;
      }
      if (renaming) {
        event.preventDefault();
        setRenaming(null);
        return;
      }
      if (overwritePrompt || chmodTarget || deleteTarget) {
        return;
      }
      event.preventDefault();
      onExit();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [menu, renaming, overwritePrompt, chmodTarget, deleteTarget, onExit]);

  // Delete/Backspace removes the current selection, Enter starts a rename —
  // the same muscle memory as Finder.
  const onListKeyDown = (side: Side, event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) {
      return;
    }
    const chosen = selections[side];
    if (chosen.length === 0) {
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      beginDelete(side, chosen);
      return;
    }
    if (event.key === "Enter" && chosen.length === 1) {
      event.preventDefault();
      beginRename(side, chosen[0]);
    }
  };

  const renderPane = (side: Side) => {
    const pane = panes[side];
    const source = side === "left" ? leftSource : rightSource;
    const selected = selectedSets[side];
    const entries = pane.listing?.Entries ?? [];
    const selectedBytes = entries.reduce(
      (total, entry) =>
        selected.has(entry.Name) && !entry.IsDir ? total + entry.Size : total,
      0,
    );
    const address = sourceAddress(source);
    const gone = side === "right" && rightGone;

    return (
      <section className={`sftp-pane${dropSide === side ? " is-drop" : ""}`}>
        <header className="sftp-pane-head">
          <span className={`sftp-source-icon ${source.Kind === "remote" ? "is-remote" : "is-local"}`} aria-hidden="true">
            <SourceGlyph source={source} />
          </span>
          <div className="sftp-source-text">
            {side === "left" ? (
              <SourcePicker sources={sources} value={source} onChange={chooseLeftSource} />
            ) : (
              <span className="sftp-source-name">{source.Label}</span>
            )}
            <span className="sftp-source-meta">
              {gone ? "Connection ended" : address || (source.Kind === "local" ? "Local filesystem" : "")}
            </span>
          </div>
          <div className="sftp-pane-tools">
            <button
              type="button"
              className="sftp-tool"
              onClick={() => pane.listing && beginChmod(side, selections[side])}
              disabled={selections[side].length === 0 || gone}
              title="Change permissions of the selected items"
              aria-label="Change permissions"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8.6" cy="8.6" r="3.4" />
                <path d="M11.2 11.2 19 19" />
                <path d="M15.8 14l1.6-1.6" />
              </svg>
            </button>
            <button
              type="button"
              className="sftp-tool"
              onClick={() => {
                const chosen = selections[side];
                if (chosen.length === 1) {
                  beginRename(side, chosen[0]);
                }
              }}
              disabled={selections[side].length !== 1 || gone}
              title="Rename the selected item"
              aria-label="Rename"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17Z" />
                <path d="M14.6 6.6l2.8 2.8" />
              </svg>
            </button>
            <button
              type="button"
              className="sftp-tool is-danger"
              onClick={() => beginDelete(side, selections[side])}
              disabled={selections[side].length === 0 || gone}
              title={source.Kind === "local" ? `Move the selected items to the ${trashName}` : "Delete the selected items"}
              aria-label="Delete selected items"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.8 7.4h14.4" />
                <path d="M9.4 7.4V5.2h5.2v2.2" />
                <path d="M6.6 7.4l.9 11.4h9l.9-11.4" />
              </svg>
            </button>
            <button
              type="button"
              className="sftp-tool"
              onClick={() => pane.listing?.Parent && navigate(side, pane.listing.Parent)}
              disabled={!pane.listing?.Parent || gone}
              title="Parent folder"
              aria-label="Parent folder"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5.5" />
                <path d="m6.5 11 5.5-5.5L17.5 11" />
              </svg>
            </button>
            <button
              type="button"
              className="sftp-tool"
              onClick={() => pane.listing?.Home && navigate(side, pane.listing.Home)}
              disabled={!pane.listing?.Home || gone}
              title="Home folder"
              aria-label="Home folder"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 10.6 8-6.4 8 6.4" />
                <path d="M6.2 9.4V19h11.6V9.4" />
              </svg>
            </button>
            <button
              type="button"
              className="sftp-tool"
              onClick={() => pane.listing && navigate(side, pane.listing.Path)}
              disabled={!pane.listing || gone || pane.loading}
              title="Refresh"
              aria-label="Refresh folder"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
                <path d="M19.7 4.5v4.2h-4.2" />
              </svg>
            </button>
          </div>
        </header>

        <form
          className="sftp-pathbar"
          onSubmit={(event) => {
            event.preventDefault();
            submitPath(side);
          }}
        >
          <svg className="sftp-path-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 7.2A1.7 1.7 0 0 1 5.2 5.5h4l2 2.2h7.6a1.7 1.7 0 0 1 1.7 1.7v7.4a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7Z" />
          </svg>
          <input
            className="sftp-path-input"
            value={pane.path}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={side === "left" ? "Type a local path and press Enter" : "Type a remote path and press Enter"}
            aria-label="Folder path"
            disabled={gone}
            onChange={(event) =>
              setPanes((current) => ({
                ...current,
                [side]: { ...current[side], path: event.target.value },
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Escape" && pane.listing) {
                setPanes((current) => ({
                  ...current,
                  [side]: { ...current[side], path: current[side].listing?.Path ?? "" },
                }));
              }
            }}
          />
          {pane.path !== (pane.listing?.Path ?? "") && (
            <button type="submit" className="sftp-go" title="Open this path">
              Go
            </button>
          )}
        </form>

        {pane.error && (
          <div className="sftp-banner is-error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8.6" />
              <line x1="12" y1="7.8" x2="12" y2="12.8" />
              <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
            </svg>
            <span>{pane.error}</span>
          </div>
        )}
        {gone && (
          <div className="sftp-banner is-warning" role="status">
            <span>This SSH session has ended. Press Esc to go back to the terminal and reconnect.</span>
          </div>
        )}

        <div className="sftp-columns" aria-hidden="true">
          <span>Name</span>
          <span className="sftp-col-size">Size</span>
          <span className="sftp-col-date">Modified</span>
        </div>

        <div
          className={`sftp-list${pane.loading ? " is-loading" : ""}`}
          role="listbox"
          tabIndex={0}
          aria-label={`${source.Label} files`}
          aria-multiselectable="true"
          onKeyDown={(event) => onListKeyDown(side, event)}
          onDragOver={(event) => dragOverPane(side, event)}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDropSide((current) => (current === side ? null : current));
            }
          }}
          onDrop={(event) => dropOnPane(side, event)}
        >
          {entries.map((entry, index) => {
            const isSelected = selected.has(entry.Name);
            const renameState =
              renaming && renaming.side === side && renaming.from === entry.Name
                ? renaming
                : null;
            const isRenaming = Boolean(renameState);
            return (
              <div
                key={entry.Name}
                role="option"
                aria-selected={isSelected}
                data-sftp-row=""
                data-sftp-side={side}
                data-sftp-index={index}
                className={[
                  "sftp-row",
                  entry.IsDir ? "is-dir" : "is-file",
                  isSelected ? "is-selected" : "",
                  isRenaming ? "is-renaming" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                draggable={!gone && !busy && !isRenaming}
                onDragStart={(event) => beginDrag(side, entry, event)}
                onDragEnd={endDrag}
                onClick={(event) => selectRow(side, index, event)}
                onDoubleClick={() => openEntry(side, entry)}
                title={`${entry.Name} · right-click for rename, permissions and delete`}
              >
                <span className="sftp-row-icon" aria-hidden="true">
                  {entry.IsDir ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                      <path d="M3.5 7.2A1.7 1.7 0 0 1 5.2 5.5h4l2 2.2h7.6a1.7 1.7 0 0 1 1.7 1.7v7.4a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6.5 3.8h7l4.5 4.5v11.9H6.5Z" />
                      <path d="M13.2 3.9v4.7h4.6" />
                    </svg>
                  )}
                </span>
                <span className="sftp-row-name">
                  {renameState ? (
                    <span className="sftp-rename">
                      <input
                        className="sftp-rename-input"
                        value={renameState.value}
                        spellCheck={false}
                        autoFocus
                        aria-label="New name"
                        onChange={(event) =>
                          setRenaming({
                            ...renameState,
                            value: event.target.value,
                            error: "",
                          })
                        }
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void commitRename();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            setRenaming(null);
                          }
                        }}
                        onBlur={() => {
                          if (renameState.busy) {
                            return;
                          }
                          void commitRename();
                        }}
                        onFocus={(event) => {
                          // Select the stem like Finder so the extension stays put.
                          const dot = event.target.value.lastIndexOf(".");
                          event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
                        }}
                      />
                      {renameState.error && (
                        <span className="sftp-rename-error" role="alert">
                          {renameState.error}
                        </span>
                      )}
                    </span>
                  ) : (
                    <>
                      {entry.Name}
                      {entry.IsLink && <span className="sftp-link-badge">link</span>}
                    </>
                  )}
                </span>
                <span className="sftp-row-size">{entry.IsDir ? "—" : formatBytes(entry.Size)}</span>
                <span className="sftp-row-date">{formatModified(entry.Modified)}</span>
              </div>
            );
          })}

          {pane.loading && (
            <div className="sftp-state">
              <span className="sftp-spinner" aria-hidden="true" />
              <span>Loading…</span>
            </div>
          )}

          {!pane.loading && entries.length === 0 && !gone && (
            <div className="sftp-state">
              <span className="sftp-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                  <path d="M3.5 7.2A1.7 1.7 0 0 1 5.2 5.5h4l2 2.2h7.6a1.7 1.7 0 0 1 1.7 1.7v7.4a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7Z" />
                </svg>
              </span>
              <span>This folder is empty</span>
            </div>
          )}

          {dropSide === side && dragSource && (
            <div className="sftp-drop-overlay">
              <span>Copy {dragSource.names.length} {dragSource.names.length === 1 ? "item" : "items"} here</span>
            </div>
          )}
        </div>

        <footer className="sftp-pane-foot">
          <span>
            {selected.size > 0
              ? `${selected.size} selected · ${formatBytes(selectedBytes)}`
              : `${entries.length} ${entries.length === 1 ? "item" : "items"}`}
          </span>
          <span className="sftp-foot-hint">
            {side === "left" ? "Right-click a file for more" : "Double-click to open"}
          </span>
        </footer>
      </section>
    );
  };

  return (
    <div ref={rootRef} className={`sftp-app is-embedded${anyOverlay ? " has-overlay" : ""}`}>
      <header className="sftp-viewbar">
        <span className="sftp-viewbar-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8c0-3.4-2.4-5.9-5.8-5.9a4.9 4.9 0 0 0-4.9 4.9 2.9 2.9 0 0 0 2.9 2.9 1.8 1.8 0 0 0 1.8-1.8" />
          </svg>
        </span>
        <div className="sftp-viewbar-text">
          <span className="sftp-viewbar-title">SFTP</span>
          <span className="sftp-viewbar-sub">
            Two-way transfer · right-click a file to rename, change permissions or delete
          </span>
        </div>
        <button type="button" className="sftp-exit" onClick={onExit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.5 6.5 15 12l-5.5 5.5" />
          </svg>
          <span>Terminal</span>
          <kbd>Esc</kbd>
        </button>
      </header>

      <div className="sftp-workspace">
        {renderPane("left")}

        <div className="sftp-rail">
          <span className="sftp-rail-line" aria-hidden="true" />
          <button
            type="button"
            className="sftp-copy"
            onClick={() => void startTransfer("left", selections.left)}
            disabled={selections.left.length === 0 || busy || checking || !panes.right.listing}
            title={
              selections.left.length > 0
                ? `Copy ${selections.left.length} to ${rightSource.Label}`
                : "Select files on the left to copy them right"
            }
            aria-label="Copy selected items to the right"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h13.5" />
              <path d="m13.5 6.5 5.5 5.5-5.5 5.5" />
            </svg>
            {selections.left.length > 0 && (
              <span className="sftp-copy-count">{selections.left.length}</span>
            )}
          </button>
          <button
            type="button"
            className="sftp-copy"
            onClick={() => void startTransfer("right", selections.right)}
            disabled={selections.right.length === 0 || busy || checking || rightGone || !panes.left.listing}
            title={
              selections.right.length > 0
                ? `Copy ${selections.right.length} to ${leftSource.Label}`
                : "Select files on the right to copy them left"
            }
            aria-label="Copy selected items to the left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5.5" />
              <path d="M10.5 6.5 5 12l5.5 5.5" />
            </svg>
            {selections.right.length > 0 && (
              <span className="sftp-copy-count">{selections.right.length}</span>
            )}
          </button>
          <span className="sftp-rail-line" aria-hidden="true" />
        </div>

        {renderPane("right")}
      </div>

      {transfer && (
        <TransferPanel
          state={transfer}
          onCancel={cancelTransfer}
          onDismiss={dismissTransfer}
        />
      )}

      {overwritePrompt && (
        <OverwriteDialog
          conflicts={overwritePrompt.conflicts}
          sourceLabel={overwritePrompt.sourceLabel}
          targetLabel={overwritePrompt.targetLabel}
          onOverwrite={() => resolveOverwrite(true)}
          onSkip={() => resolveOverwrite(false)}
        />
      )}

      {menu && (
        <SftpRowMenu
          target={menu}
          isRemote={sourceOf(menu.side).Kind === "remote"}
          onRename={() => beginRename(menu.side, menu.names[0])}
          onChmod={() => void beginChmod(menu.side, menu.names)}
          onDelete={() => beginDelete(menu.side, menu.names)}
          onClose={() => setMenu(null)}
        />
      )}

      {chmodTarget && (
        <ChmodDialog
          names={chmodTarget.names}
          isDir={chmodTarget.isDir}
          perm={chmodTarget.perm}
          sourceLabel={sourceOf(chmodTarget.side).Label}
          busy={chmodTarget.busy}
          error={chmodTarget.error}
          onApply={(perm) => void applyChmod(perm)}
          onClose={() => setChmodTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          icon="trash"
          eyebrow={sourceOf(deleteTarget.side).Kind === "local" ? `Move to ${trashName}` : "Delete on remote host"}
          title={
            sourceOf(deleteTarget.side).Kind === "local"
              ? deleteTarget.names.length === 1
                ? `Move “${deleteTarget.names[0]}” to ${trashName}?`
                : `Move ${deleteTarget.names.length} items to ${trashName}?`
              : deleteTarget.names.length === 1
                ? `Delete “${deleteTarget.names[0]}”?`
                : `Delete ${deleteTarget.names.length} items?`
          }
          description={
            sourceOf(deleteTarget.side).Kind === "local"
              ? `Local items move to the ${trashName}, so you can bring them back from ${fileManagerLabel}.`
              : "This deletes the items on the remote host. Folders are removed with everything inside them, and there is no Trash on the server."
          }
          confirmLabel={sourceOf(deleteTarget.side).Kind === "local" ? `Move to ${trashName}` : "Delete"}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {notice && (
        <div
          className={noticeIsError ? "sftp-toast is-error" : "sftp-toast"}
          role={noticeIsError ? "alert" : "status"}
          onClick={() => notify(null)}
        >
          {notice}
        </div>
      )}
    </div>
  );
}
