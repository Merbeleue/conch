import { useEffect, useRef } from "react";
import { Clipboard } from "@wailsio/runtime";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { SSHService } from "../../bindings/conch";
import { themeFor, type ThemeId } from "../lib/themes";
import { fontStackFor, type CursorStyle, type FontFamilyId } from "../lib/settings";
import { isWindows } from "../lib/platform";
import { dropPainter, painterFor } from "../lib/highlight";
import { inputTargets } from "../lib/inputBroadcast";
import { attachSink, detachSink } from "../lib/sessionStream";
import { exitReasonLabel, useI18n } from "../lib/i18n";
import type { ExitInfo, SessionInfo, TerminalHandle } from "../types";

/** Global terminal typography, applied to every pane and live-updated. */
export interface TerminalPrefs {
  fontFamily: FontFamilyId;
  fontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  rightClickPaste: boolean;
}

interface TerminalPaneProps {
  session: SessionInfo;
  exit: ExitInfo | null;
  active: boolean;
  themeId: ThemeId;
  prefs: TerminalPrefs;
  onDisconnect: () => void;
  onReconnect: () => void;
  registerActions: (sessionID: string, actions: TerminalHandle | null) => void;
}

interface RetainedTerminal {
  term: Terminal;
  fit: FitAddon;
  timer: number | null;
}

/**
 * Split layouts change shape constantly (splits, drags, collapsing panes), and
 * React remounts the pane that moves. A remount would normally rebuild xterm
 * and throw away the scrollback of a live session, so a moved terminal is parked
 * here instead: the instance keeps running (output still streams into it) and the
 * next mount re-attaches its element. Terminals are dropped when the session is
 * closed, or shortly after they are unmounted and never come back.
 */
const RETAIN_MS = 8000;
const retained = new Map<string, RetainedTerminal>();
/** Sessions whose pane is about to unmount for the last time. */
const closedSessions = new Set<string>();
/**
 * The size each backend was last told about. It lives here rather than in the
 * pane because a session outlives its panes: without it, every tab switch and
 * every pane move re-sends the same size and makes the remote repaint its
 * whole screen.
 */
const sentSizes = new Map<string, { cols: number; rows: number }>();
let poolRoot: HTMLDivElement | null = null;

function poolContainer(): HTMLDivElement {
  if (!poolRoot) {
    poolRoot = document.createElement("div");
    poolRoot.className = "term-pool";
    poolRoot.setAttribute("aria-hidden", "true");
    document.body.appendChild(poolRoot);
  }
  return poolRoot;
}

function destroyTerminal(sessionID: string, term: Terminal): void {
  detachSink(sessionID);
  // The painter outlives a pane move but not the session: its write closure owns
  // the reference to this terminal.
  dropPainter(sessionID);
  sentSizes.delete(sessionID);
  const element = term.element;
  if (element?.parentElement) {
    element.parentElement.removeChild(element);
  }
  term.dispose();
}

/**
 * Frees a session's terminal for good. Called when a session is closed: if it is
 * parked, drop it now; if it is still mounted, the unmount cleanup tears it down.
 */
export function releaseTerminal(sessionID: string): void {
  const entry = retained.get(sessionID);
  if (!entry) {
    closedSessions.add(sessionID);
    return;
  }
  retained.delete(sessionID);
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer);
  }
  destroyTerminal(sessionID, entry.term);
}

export function TerminalPane({
  session,
  exit,
  active,
  themeId,
  prefs,
  onDisconnect,
  onReconnect,
  registerActions,
}: TerminalPaneProps) {
  const { language, t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Kept in a ref so a theme change repaints the existing terminal instead of
  // rebuilding it and losing scrollback.
  const themeRef = useRef(themeId);
  themeRef.current = themeId;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const { fontFamily, fontSize, cursorStyle, cursorBlink } = prefs;

  useEffect(() => {
    const container = hostRef.current;
    if (!container) {
      return;
    }

    let term: Terminal;
    let fit: FitAddon;
    let reattached = false;

    const parked = retained.get(session.ID);
    if (parked) {
      retained.delete(session.ID);
      if (parked.timer !== null) {
        window.clearTimeout(parked.timer);
        parked.timer = null;
      }
      term = parked.term;
      fit = parked.fit;
      const element = term.element;
      if (element && element.parentElement !== container) {
        container.appendChild(element);
      }
      reattached = true;
    } else {
      const initial = prefsRef.current;
      term = new Terminal({
        cursorBlink: initial.cursorBlink,
        cursorStyle: initial.cursorStyle,
        fontFamily: fontStackFor(initial.fontFamily),
        fontSize: initial.fontSize,
        lineHeight: 1.25,
        letterSpacing: 0.2,
        scrollback: 10000,
        theme: themeFor(themeRef.current).terminal,
        // xterm defaults this to true on macOS but false on Windows, which makes a
        // right-click select the word under the pointer and destroy the text just
        // marked. While right-click paste is on, right click must not touch the
        // selection; while it is off, each platform keeps its own default.
        rightClickSelectsWord: !isWindows && !initial.rightClickPaste,
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);

      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {
        // Canvas renderer is the fallback when WebGL is unavailable.
      }
    }

    // The theme and typography may have moved on while this terminal sat in
    // the pool.
    term.options.theme = themeFor(themeRef.current).terminal;
    const latest = prefsRef.current;
    term.options.fontFamily = fontStackFor(latest.fontFamily);
    term.options.fontSize = latest.fontSize;
    term.options.cursorStyle = latest.cursorStyle;
    term.options.cursorBlink = latest.cursorBlink;
    term.options.rightClickSelectsWord = !isWindows && !latest.rightClickPaste;
    termRef.current = term;
    fitRef.current = fit;

    // Fitting is not free: it measures the glyphs and can change the grid, which
    // then resizes the remote terminal. A window drag fires ResizeObserver on
    // every pixel, so the fits are coalesced into one per frame, and a fit is
    // skipped outright when the box did not change size.
    let boxWidth = -1;
    let boxHeight = -1;
    let fitFrame = 0;
    const fitNow = (force = false) => {
      fitFrame = 0;
      const box = container.getBoundingClientRect();
      const width = Math.round(box.width);
      const height = Math.round(box.height);
      if (!force && width === boxWidth && height === boxHeight) {
        return;
      }
      boxWidth = width;
      boxHeight = height;
      try {
        fit.fit();
      } catch {
        // The container can be zero-sized while the view is animating in.
      }
    };
    const scheduleFit = () => {
      if (fitFrame === 0) {
        fitFrame = requestAnimationFrame(() => fitNow());
      }
    };
    fitNow(true);
    if (reattached) {
      // The re-attached element still carries the size of its previous pane.
      fitFrame = requestAnimationFrame(() => fitNow(true));
    } else {
      // Web fonts change the cell size without changing the pane's box, so this
      // one fit has to happen even though the container has not moved.
      document.fonts?.ready.then(() => fitNow(true)).catch(() => undefined);
    }

    // Output goes through the keyword painter rather than straight into xterm: it
    // holds a line until that line ends, so a word split across two packets is
    // still recognised, and it is what paints the colours the user chose.
    const painter = painterFor(session.ID, (bytes) => term.write(bytes));
    attachSink(session.ID, (bytes) => painter.feed(bytes));
    registerActions(session.ID, {
      clear: () => {
        term.clear();
        term.focus();
      },
      focus: () => term.focus(),
    });

    const offData = term.onData((data) => {
      // Broadcast targets include this pane while broadcast is on, so each
      // keystroke is written exactly once per live session.
      for (const id of inputTargets(session.ID)) {
        SSHService.Write(id, data).catch(() => undefined);
      }
    });

    // Opt-in copy-on-select plus right-click paste. Selecting fills the
    // clipboard, so the usual idiom "select, then right-click to paste" works
    // without a separate copy step. Writes are debounced: a drag fires the
    // event once per cell, and each write is an IPC round-trip.
    let copyTimer = 0;
    const offSelection = term.onSelectionChange(() => {
      if (!prefsRef.current.rightClickPaste) {
        return;
      }
      const selection = term.getSelection();
      if (!selection) {
        return;
      }
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copyTimer = 0;
        Clipboard.SetText(selection).catch(() => undefined);
      }, 120);
    });

    // The clipboard is read through Wails rather than navigator.clipboard,
    // which a desktop WebView may refuse outside a trusted document. A live
    // selection is pasted directly: it is exactly what the user marked, and it
    // avoids racing the debounced clipboard write. xterm's paste() keeps
    // bracketed-paste mode and multi-line guards.
    const onContextMenu = (event: MouseEvent) => {
      if (!prefsRef.current.rightClickPaste) {
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest(".exit-layer")) {
        return;
      }
      event.preventDefault();
      const selection = term.getSelection();
      if (selection) {
        term.paste(selection);
        term.focus();
        return;
      }
      Clipboard.Text()
        .then((text) => {
          if (text) {
            term.paste(text);
          }
          term.focus();
        })
        .catch(() => undefined);
    };
    container.addEventListener("contextmenu", onContextMenu);

    // A resize is expensive on the far side: SSH re-wraps the screen and a local
    // ConPTY makes the shell repaint all of it. So the backend only ever hears
    // the size the user settles on — one report per ~90ms while the size keeps
    // changing, and none at all when it is the size it already has.
    const RESIZE_GAP_MS = 90;
    let resizeTimer = 0;
    let pendingCols = 0;
    let pendingRows = 0;
    let lastSentAt = 0;
    const pushResize = () => {
      resizeTimer = 0;
      lastSentAt = performance.now();
      sentSizes.set(session.ID, { cols: pendingCols, rows: pendingRows });
      SSHService.Resize(session.ID, pendingCols, pendingRows).catch(() => undefined);
    };
    const reportResize = (cols: number, rows: number) => {
      const known = sentSizes.get(session.ID);
      if (known && known.cols === cols && known.rows === rows) {
        return;
      }
      pendingCols = cols;
      pendingRows = rows;
      const wait = RESIZE_GAP_MS - (performance.now() - lastSentAt);
      if (wait <= 0) {
        if (resizeTimer !== 0) {
          window.clearTimeout(resizeTimer);
          resizeTimer = 0;
        }
        pushResize();
      } else if (resizeTimer === 0) {
        resizeTimer = window.setTimeout(pushResize, wait);
      }
    };

    const offResize = term.onResize(({ cols, rows }) => {
      reportResize(cols, rows);
    });
    reportResize(term.cols, term.rows);

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);

    return () => {
      observer.disconnect();
      offData.dispose();
      offSelection.dispose();
      offResize.dispose();
      container.removeEventListener("contextmenu", onContextMenu);
      if (copyTimer !== 0) {
        window.clearTimeout(copyTimer);
        copyTimer = 0;
      }
      if (fitFrame !== 0) {
        cancelAnimationFrame(fitFrame);
        fitFrame = 0;
      }
      // The pane may be parked rather than closed, so an unsent size is dropped
      // here and re-reported by the next mount instead of racing a dead session.
      if (resizeTimer !== 0) {
        window.clearTimeout(resizeTimer);
        resizeTimer = 0;
      }
      registerActions(session.ID, null);
      termRef.current = null;
      fitRef.current = null;

      if (closedSessions.has(session.ID)) {
        closedSessions.delete(session.ID);
        destroyTerminal(session.ID, term);
        return;
      }
      // Park the live terminal (still fed by the output sink) until the moved
      // pane mounts again.
      const element = term.element;
      if (element) {
        poolContainer().appendChild(element);
      }
      const entry: RetainedTerminal = {
        term,
        fit,
        timer: window.setTimeout(() => {
          entry.timer = null;
          if (retained.get(session.ID) !== entry) {
            return;
          }
          retained.delete(session.ID);
          destroyTerminal(session.ID, term);
        }, RETAIN_MS),
      };
      retained.set(session.ID, entry);
    };
  }, [session.ID, registerActions]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // The pane can still be settling when a tab is activated.
      }
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  // Live-repaint when the global theme or this host's theme changes.
  useEffect(() => {
    const term = termRef.current;
    if (term) {
      term.options.theme = themeFor(themeId).terminal;
    }
  }, [themeId]);

  // Typography and cursor changes apply to already-open terminals without a
  // remount; the refit keeps the grid in step with the new glyph metrics.
  useEffect(() => {
    const term = termRef.current;
    if (!term) {
      return;
    }
    term.options.fontFamily = fontStackFor(fontFamily);
    term.options.fontSize = fontSize;
    term.options.cursorStyle = cursorStyle;
    term.options.cursorBlink = cursorBlink;
    // Turning the setting on must stop xterm from grabbing a word on right
    // click; turning it off restores the platform's own default.
    term.options.rightClickSelectsWord = !isWindows && !prefs.rightClickPaste;
    const frame = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // The pane may be hidden while its tab is in the background.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [fontFamily, fontSize, cursorStyle, cursorBlink, prefs.rightClickPaste]);

  return (
    <section className={exit ? "term-pane is-ended" : "term-pane"}>
      <div
        className="term-body"
        style={{ backgroundColor: themeFor(themeId).terminal.background }}
      >
        <div className="xterm-host" ref={hostRef} />

        {exit && (
          <div className="exit-layer">
            <div className="exit-card">
              <p className="eyebrow">{t("Session ended")}</p>
              <h3>
                {exit.Reason === "disconnected"
                  ? t("Disconnected")
                  : session.Kind === "local"
                    ? t("Local shell ended")
                    : t("Connection closed")}
              </h3>
              <p className="exit-meta">
                {exitReasonLabel(exit.Reason, language)}
                {exit.Error ? ` — ${exit.Error}` : ""}
              </p>
              <div className="exit-actions">
                <button type="button" className="primary small" onClick={onReconnect}>
                  {t("Reconnect")}
                </button>
                <button type="button" className="ghost" onClick={onDisconnect}>
                  {t("Close")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
