# Changelog

All notable changes to Conch are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **Windows build.** Conch now runs natively on Windows 10/11, x64 and ARM64, in a
  single installer that carries both architectures: local shells go through ConPTY
  (PowerShell 7, Windows PowerShell, or `cmd` in that order), SFTP deletes land in the
  Recycle Bin via the shell API, Windows reserved names and illegal characters are
  rejected before a rename reaches the filesystem, and the window keeps the native
  Windows title bar. `⌘` becomes `Ctrl` in every shortcut hint.
- A **key-file picker** and a **per-platform font list** — Cascadia Mono, Cascadia Code,
  JetBrains Mono, Consolas and Courier New are offered on Windows, the Mac families on
  macOS — and a stored font that the current system does not have falls back to that
  platform's default instead of rendering nothing.
- Saved hosts can keep a key **passphrase** ("Save passphrase"), so an encrypted key
  connects straight from the sidebar.
- A **failed key login explains itself**: the message names the paths that were tried
  and why each one was unusable — missing, unreadable (on macOS it points at Files and
  Folders permission), protected by a passphrase, or the `.pub` file rather than the key.

### Changed

- Settings lists (font family) are drawn by the app instead of a native `<select>`,
  following the active theme, keyboard-navigable, and clamped to the viewport.
- Terminal output batching and resize reporting are tuned per platform — Windows gets a
  wider output window and one resize per ~90ms only when the size actually changed —
  which removes the dropped frames on WebView2.

### Fixed

- Legacy saved hosts that still said `authMethod: "agent"` are normalized to the private
  key path at connect time.
- Dragging a tab or pane on Windows no longer re-sends a resize the backend already has,
  which used to make the remote shell repaint the whole screen.

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
  account behind this project yet). macOS Gatekeeper blocks the first launch
  because the download carries the quarantine attribute: double-click once, then
  press **Open Anyway** in System Settings → Privacy & Security. On macOS 15
  right-click → Open no longer bypasses this. Installing from the terminal with
  `curl … | tar -xz -C /Applications` avoids Gatekeeper altogether because curl
  doesn't set the quarantine flag.
- A saved password is stored **in plain text** in the app's localStorage. Use it
  only on a machine you trust; unchecking "Save password" and reconnecting
  removes it.
- No port forwarding, no `~/.ssh/config` import, no session restore after
  relaunch. 0.1.0 shipped macOS binaries only — the Windows build is in
  [Unreleased] above.

[Unreleased]: https://github.com/Merbeleue/conch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Merbeleue/conch/releases/tag/v0.1.0
