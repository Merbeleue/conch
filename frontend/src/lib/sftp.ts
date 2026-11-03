import type { SFTPSource } from "../../bindings/conch/models";

export function sourceKey(source: SFTPSource): string {
  return source.Kind === "remote" ? `remote:${source.SessionID}` : "local";
}

export function sourceAddress(source: SFTPSource): string {
  if (source.Kind !== "remote") {
    return "";
  }
  if (source.User && source.Host) {
    const port = source.Port && source.Port !== 22 ? `:${source.Port}` : "";
    return `${source.User}@${source.Host}${port}`;
  }
  return source.Host || "";
}

export interface PermBits {
  read: boolean;
  write: boolean;
  exec: boolean;
}

export interface PermSet {
  owner: PermBits;
  group: PermBits;
  other: PermBits;
}

const MASKS = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];

export function permToOctal(perm: number): string {
  return (perm & 0o777).toString(8).padStart(3, "0");
}

export function parseOctal(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[0-7]{3,4}$/.test(trimmed)) {
    return null;
  }
  const parsed = parseInt(trimmed, 8);
  return Number.isNaN(parsed) ? null : parsed & 0o777;
}

// permToSymbolic renders the familiar "-rw-r--r--" form so the dialog can show
// what the checkboxes mean without the user translating octal in their head.
export function permToSymbolic(perm: number, isDir: boolean): string {
  const letters = "rwx";
  let out = isDir ? "d" : "-";
  for (let i = 0; i < 9; i += 1) {
    const bit = (perm >> (8 - i)) & 1;
    out += bit ? letters[i % 3] : "-";
  }
  return out;
}

export function permToSet(perm: number): PermSet {
  const bit = (mask: number) => (perm & mask) !== 0;
  return {
    owner: { read: bit(0o400), write: bit(0o200), exec: bit(0o100) },
    group: { read: bit(0o040), write: bit(0o020), exec: bit(0o010) },
    other: { read: bit(0o004), write: bit(0o002), exec: bit(0o001) },
  };
}

export function setToPerm(set: PermSet): number {
  const flags = [
    set.owner.read,
    set.owner.write,
    set.owner.exec,
    set.group.read,
    set.group.write,
    set.group.exec,
    set.other.read,
    set.other.write,
    set.other.exec,
  ];
  let perm = 0;
  flags.forEach((on, index) => {
    if (on) {
      perm |= MASKS[index];
    }
  });
  return perm;
}
