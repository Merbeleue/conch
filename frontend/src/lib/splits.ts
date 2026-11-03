import type { PaneEdge, PaneNode, SplitDirection } from "../types";

let splitSeq = 0;

export function newSplitId(): string {
  splitSeq += 1;
  return `split-${Date.now().toString(36)}-${splitSeq.toString(36)}`;
}

export function pane(sessionId: string): PaneNode {
  return { kind: "pane", sessionId };
}

export function split(
  direction: SplitDirection,
  first: PaneNode,
  second: PaneNode,
  ratio = 0.5,
): PaneNode {
  return { kind: "split", id: newSplitId(), direction, ratio, first, second };
}

/**
 * Replaces the target pane with a split of the target and another session.
 * `before` puts the newcomer on the leading side (left of a row, above a
 * column), which is what a drop on the left or top edge asks for.
 */
export function insertBeside(
  node: PaneNode,
  targetSessionId: string,
  newSessionId: string,
  direction: SplitDirection,
  before: boolean,
): PaneNode {
  if (node.kind === "pane") {
    if (node.sessionId !== targetSessionId) {
      return node;
    }
    const newcomer = pane(newSessionId);
    return before
      ? split(direction, newcomer, node)
      : split(direction, node, newcomer);
  }
  const first = insertBeside(node.first, targetSessionId, newSessionId, direction, before);
  const second = insertBeside(node.second, targetSessionId, newSessionId, direction, before);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

/** Removes a pane and collapses any split left with a single child. */
export function removePane(node: PaneNode, sessionId: string): PaneNode | null {
  if (node.kind === "pane") {
    return node.sessionId === sessionId ? null : node;
  }
  const first = removePane(node.first, sessionId);
  const second = removePane(node.second, sessionId);
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

/** Swaps one session ID for another in place, preserving the layout shape. */
export function replaceSession(
  node: PaneNode,
  oldSessionId: string,
  newSessionId: string,
): PaneNode {
  if (node.kind === "pane") {
    return node.sessionId === oldSessionId ? { ...node, sessionId: newSessionId } : node;
  }
  const first = replaceSession(node.first, oldSessionId, newSessionId);
  const second = replaceSession(node.second, oldSessionId, newSessionId);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

export function updateRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.kind === "pane") {
    return node;
  }
  const clamped = Math.min(0.85, Math.max(0.15, ratio));
  const first = updateRatio(node.first, splitId, clamped);
  const second = updateRatio(node.second, splitId, clamped);
  if (node.id === splitId) {
    return { ...node, ratio: clamped, first, second };
  }
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

export function collectSessionIds(node: PaneNode): string[] {
  if (node.kind === "pane") {
    return [node.sessionId];
  }
  return [...collectSessionIds(node.first), ...collectSessionIds(node.second)];
}

export function paneCount(node: PaneNode): number {
  return node.kind === "pane" ? 1 : paneCount(node.first) + paneCount(node.second);
}

export function firstPaneId(node: PaneNode): string {
  return node.kind === "pane" ? node.sessionId : firstPaneId(node.first);
}

export function containsSession(node: PaneNode, sessionId: string): boolean {
  if (node.kind === "pane") {
    return node.sessionId === sessionId;
  }
  return containsSession(node.first, sessionId) || containsSession(node.second, sessionId);
}

/** Splits a drop edge into the axis to split on and which side the pane takes. */
export function edgeToSplit(edge: PaneEdge): {
  direction: SplitDirection;
  before: boolean;
} {
  switch (edge) {
    case "left":
      return { direction: "row", before: true };
    case "right":
      return { direction: "row", before: false };
    case "top":
      return { direction: "column", before: true };
    default:
      return { direction: "column", before: false };
  }
}

/** Maps a pointer position inside a rect to the nearest edge of that rect. */
export function edgeForPointer(
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
): PaneEdge {
  if (rect.width <= 0 || rect.height <= 0) {
    return "right";
  }
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  const horizontal = Math.min(fx, 1 - fx);
  const vertical = Math.min(fy, 1 - fy);
  if (horizontal < vertical) {
    return fx < 0.5 ? "left" : "right";
  }
  return fy < 0.5 ? "top" : "bottom";
}
