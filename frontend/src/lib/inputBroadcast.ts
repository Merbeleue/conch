/**
 * Input broadcast state shared with every terminal. TerminalPane reads this
 * synchronously inside xterm's onData handler, so toggling broadcast does not
 * require remounting terminals or touching their scrollback.
 */

let enabled = false;
let targets: readonly string[] = [];

/** Snapshot of the sessions that should receive broadcast keystrokes. */
export function setInputBroadcast(active: boolean, sessionIDs: readonly string[]): void {
  enabled = active;
  targets = sessionIDs;
}

/**
 * Sessions that should receive data typed in `sourceID`: every live session
 * while broadcast is on, otherwise just the pane that received the input.
 */
export function inputTargets(sourceID: string): readonly string[] {
  return enabled && targets.length > 0 ? targets : [sourceID];
}
