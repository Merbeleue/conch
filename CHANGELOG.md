# Changelog

All notable changes to Conch are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [0.1.0] - 2026-11-03

First public release. Download `Conch-0.1.0.dmg` from the
[Releases page](https://github.com/Merbeleue/conch/releases/tag/v0.1.0).

### Added

- **SSH sessions** over password or private key (with passphrase and a native
  key-file picker), on a real Go `x/crypto/ssh` connection with a resizable PTY
- **Local shell sessions** that run your login shell on a PTY — no `sshd` needed
- **Host key verification** against `~/.ssh/known_hosts`, with a fingerprint
  dialog the first time you meet a host
- **Tabbed sessions** that keep their own scrollback when you switch away
- **Split panes** that dock sessions you already have: `⌘D` right, `⇧⌘D` down,
  or drag a tab or pane header onto any pane edge; dividers resize, double-click
  to even them out, and a tab with several panes becomes a workspace that names
  itself from its contents
- **Saved hosts** with labels, collapsible groups, name/IP search (`⌘F`),
  duplicate / edit / move / delete in the context menu, and a Save button that
  stores a host without connecting
- **Focus mode** — the sidebar folds away when a session connects and comes back
  from the Conch logo button, or automatically when the last tab closes
- **Animated connection flow** with a cancel button and `Esc`; cancelling aborts
  the pending TCP/SSH handshake
- **SFTP file manager** that opens inside the current tab, so the host tabs stay
  visible and the terminals keep running underneath: two panes (local filesystem
  or another live session on the left, the connected host on the right), editable
  path bars, copy by rail button / double-click / drag and drop, recursive folder
  transfers in both directions including host-to-host, an overwrite-or-skip
  prompt on name collisions, Finder-style `(1)` renaming for folders, a refusal
  to copy a file onto itself, right-click rename, `chmod` on Linux hosts, delete
  (local items go to the macOS Trash, remote ones are confirmed and removed), and
  a floating progress card with live percentage, byte counts and cancel
- **Broadcast input** that mirrors keystrokes from the focused pane to every live
  session and switches itself off when there is nothing to broadcast to
- **Eight themes** — Conch, Tide, Grove, Nebula and Graphite (dark), Dawn, Paper
  and Mist (daylight) — that recolor both the chrome and the terminal palette,
  set globally in Settings (`⌘,`) or overridden per host with a visual picker
- **Global terminal preferences** for font family and size (10–20px) and cursor
  style and blink, applied live to every open pane without losing scrollback
- **Disconnect all** in the tab bar, behind a confirmation dialog
- Optional in-app password saving so reconnects skip the prompt

### Known limitations

- Release builds are **ad-hoc signed, not notarized** (no Apple Developer
  account behind this project yet). macOS Gatekeeper will complain on first
  launch because the download carries the quarantine attribute; open the app
  once via right-click → Open, or run
  `xattr -cr /Applications/conch.app` after installing.
- A saved password is stored **in plain text** in the app's localStorage. Use it
  only on a machine you trust; unchecking "Save password" and reconnecting
  removes it.
- No port forwarding, no `~/.ssh/config` import, no session restore after
  relaunch, and the Linux/Windows targets are not built or tested.
- The app icon is still the stock Wails placeholder.

[0.1.0]: https://github.com/Merbeleue/conch/releases/tag/v0.1.0
