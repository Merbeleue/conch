import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { SSHService } from "../../bindings/conch";
import { themeFor, type ThemeId } from "../lib/themes";
import { fontStackFor, type CursorStyle, type FontFamilyId } from "../lib/settings";
import { inputTargets } from "../lib/inputBroadcast";
import { attachSink, detachSink } from "../lib/sessionStream";
import type { ExitInfo, SessionInfo, TerminalHandle } from "../types";

/** Global terminal typography, applied to every pane and live-updated. */
export interface TerminalPrefs {
  fontFamily: FontFamilyId;
  fontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
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
    termRef.current = term;
    fitRef.current = fit;

    const safeFit = () => {
      try {
        fit.fit();
      } catch {
        // The container can be zero-sized while the view is animating in.
      }
    };
    safeFit();
    if (reattached) {
      // The re-attached element still carries the size of its previous pane.
      requestAnimationFrame(safeFit);
    } else {
      document.fonts?.ready.then(safeFit).catch(() => undefined);
    }

    attachSink(session.ID, (bytes) => term.write(bytes));
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
    const offResize = term.onResize(({ cols, rows }) => {
      SSHService.Resize(session.ID, cols, rows).catch(() => undefined);
    });
    SSHService.Resize(session.ID, term.cols, term.rows).catch(() => undefined);

    const observer = new ResizeObserver(safeFit);
    observer.observe(container);

    return () => {
      observer.disconnect();
      offData.dispose();
      offResize.dispose();
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
    const frame = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // The pane may be hidden while its tab is in the background.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [fontFamily, fontSize, cursorStyle, cursorBlink]);

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
              <p className="eyebrow">Session ended</p>
              <h3>
                {exit.Reason === "disconnected"
                  ? "Disconnected"
                  : session.Kind === "local"
                    ? "Local shell ended"
                    : "Connection closed"}
              </h3>
              <p className="exit-meta">
                {exit.Reason}
                {exit.Error ? ` — ${exit.Error}` : ""}
              </p>
              <div className="exit-actions">
                <button type="button" className="primary small" onClick={onReconnect}>
                  Reconnect
                </button>
                <button type="button" className="ghost" onClick={onDisconnect}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
