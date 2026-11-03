import type { ConnectRequest, SavedHost } from "../types";
import { isThemeId } from "./themes";

const STORAGE_KEY = "conch.hosts.v1";
const MAX_HOSTS = 20;

export interface PersistResult {
  hosts: SavedHost[];
  saved: SavedHost;
}

export interface DuplicateResult {
  hosts: SavedHost[];
  copy: SavedHost;
}

/** Copies a saved host in place, right below the original entry. */
export function duplicateHost(id: string): DuplicateResult | null {
  const hosts = loadHosts();
  const index = hosts.findIndex((host) => host.id === id);
  if (index < 0) {
    return null;
  }

  const original = hosts[index];
  const copy: SavedHost = {
    ...original,
    id: newHostID(),
    // Keep the same lastUsed so a reload's stable sort preserves the
    // original-then-copy order.
    lastUsed: original.lastUsed,
    label: nextHostCopyLabel(original.label.trim() || original.host, hosts),
  };

  // Stay after the newest copy in the same group, so repeated duplicates read
  // (1), (2), (3) instead of stacking backwards under the original.
  const stem = copyStem(original.label.trim() || original.host);
  let insertAt = index + 1;
  for (let cursor = index + 1; cursor < hosts.length; cursor += 1) {
    const item = hosts[cursor];
    if (item.group === original.group && copyStem(item.label.trim() || item.host) === stem) {
      insertAt = cursor + 1;
    }
  }

  const next = [
    ...hosts.slice(0, insertAt),
    copy,
    ...hosts.slice(insertAt),
  ];

  writeHosts(next);
  return { hosts: next, copy };
}

export function loadHosts(): SavedHost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const valid = parsed.filter(isSavedHost);
    const hosts = valid.map(normalizeHost);
    if (hosts.some((host, index) => host.id !== valid[index].id)) {
      writeHosts(hosts);
    }
    return hosts.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_HOSTS);
  } catch {
    return [];
  }
}

/**
 * Saves the form values without connecting. Edits keep the same entry; a new
 * host that matches an existing user/host/port updates that entry as well.
 */
export function saveHost(req: ConnectRequest, id?: string | null): PersistResult {
  return persistHost(req, id, false);
}

/**
 * Records a host after a successful connection. `id` scopes the update to the
 * saved entry the form was editing, even when its address was changed.
 */
export function rememberHost(req: ConnectRequest, id?: string | null): PersistResult {
  return persistHost(req, id, true);
}

export function deleteHost(id: string): SavedHost[] {
  const next = loadHosts().filter((host) => host.id !== id);
  writeHosts(next);
  return next;
}

/** Moves one saved host into a group; an empty name removes it from its group. */
export function moveHost(id: string, group: string): SavedHost[] {
  const name = group.trim();
  const next = loadHosts().map((host) =>
    host.id === id ? { ...host, group: name } : host,
  );
  writeHosts(next);
  return next;
}

export function hostKey(host: SavedHost): string {
  return `${host.user}@${host.host}:${host.port}`;
}

function persistHost(req: ConnectRequest, id: string | null | undefined, markUsed: boolean): PersistResult {
  const hosts = loadHosts();
  const entry = entryFromRequest(req);
  const existing = findMatch(hosts, entry, id);

  const saved: SavedHost = existing
    ? {
        ...existing,
        ...entry,
        id: existing.id,
        lastUsed: markUsed ? Date.now() : existing.lastUsed,
      }
    : {
        ...entry,
        id: id || newHostID(),
        lastUsed: Date.now(),
      };

  let next: SavedHost[];
  if (!existing) {
    next = [saved, ...hosts];
  } else if (markUsed) {
    next = [saved, ...hosts.filter((host) => host.id !== existing.id)];
  } else {
    next = hosts.map((host) => (host.id === existing.id ? saved : host));
  }

  next = next.slice(0, MAX_HOSTS);
  writeHosts(next);
  return { hosts: next, saved };
}

function entryFromRequest(req: ConnectRequest): Omit<SavedHost, "id" | "lastUsed"> {
  return {
    host: req.Host.trim(),
    port: req.Port,
    user: req.User.trim(),
    authMethod: req.AuthMethod,
    keyPath: req.AuthMethod === "key" ? req.KeyPath.trim() : "",
    label: (req.Label ?? "").trim(),
    group: (req.Group ?? "").trim(),
    password: req.AuthMethod === "password" && req.RememberPassword ? req.Password : "",
    theme: isThemeId(req.Theme) ? req.Theme : "",
  };
}

function findMatch(
  hosts: SavedHost[],
  entry: Omit<SavedHost, "id" | "lastUsed">,
  id?: string | null,
): SavedHost | undefined {
  if (id) {
    return hosts.find((host) => host.id === id);
  }
  return hosts.find(
    (host) =>
      host.host === entry.host && host.port === entry.port && host.user === entry.user,
  );
}

function writeHosts(hosts: SavedHost[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hosts));
  } catch {
    // Storage can be unavailable; the session still works.
  }
}

function newHostID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSavedHost(value: unknown): value is SavedHost {
  if (!value || typeof value !== "object") {
    return false;
  }
  const host = value as Partial<SavedHost>;
  return (
    typeof host.host === "string" &&
    typeof host.port === "number" &&
    typeof host.user === "string" &&
    typeof host.lastUsed === "number"
  );
}

/** Strips an existing " (n)" copy suffix so copies share one family. */
function copyStem(labelOrHost: string): string {
  return labelOrHost.replace(/\s*\(\d+\)\s*$/, "").trim() || labelOrHost.trim();
}

/** Picks the next free "Base (n)" label among saved hosts. */
function nextHostCopyLabel(base: string, hosts: SavedHost[]): string {
  const stem = copyStem(base);
  const pattern = new RegExp(`^${escapeRegExp(stem)} \\((\\d+)\\)$`);
  let next = 1;
  for (const host of hosts) {
    const match = host.label.match(pattern);
    if (match) {
      next = Math.max(next, Number(match[1]) + 1);
    }
  }
  return `${stem} (${next})`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Fills in fields that older saved entries did not have. */
function normalizeHost(host: SavedHost): SavedHost {
  return {
    ...host,
    id: typeof host.id === "string" && host.id ? host.id : newHostID(),
    label: typeof host.label === "string" ? host.label : "",
    group: typeof host.group === "string" ? host.group : "",
    password: typeof host.password === "string" ? host.password : "",
    theme: isThemeId(host.theme) ? host.theme : "",
  };
}
