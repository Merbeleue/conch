# Changelog

All notable changes to Conch are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [0.1.0] - 2026-11-03

First public release, for **macOS and Windows**. The macOS binaries shipped on 2026-11-03
and the Windows binaries joined the same release on 2026-11-04; after that, every published
artifact was rebuilt from one commit, so the DMG and the installer carry identical code.

Download from the [Releases page](https://github.com/Merbeleue/conch/releases/tag/v0.1.0).

### Added

- **SSH sessions** over password or private key (with passphrase and a native
  key-file picker), on a real Go `x/crypto/ssh` connection with a resizable PTY
- **Local shell sessions** that need no `sshd`: your login shell on a PTY on macOS,
  PowerShell 7 → Windows PowerShell → `cmd` on a ConPTY on Windows
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
  prompt on name collisions, `(1)` renaming for folders, a refusal
  to copy a file onto itself, right-click rename, `chmod` on Linux hosts, delete
  (local items go to the Trash on macOS and the Recycle Bin on Windows, remote
  ones are confirmed and removed), and a floating progress card with live
  percentage, byte counts and cancel
- **Broadcast input** that mirrors keystrokes from the focused pane to every live
  session and switches itself off when there is nothing to broadcast to
- **Eight themes** — Conch, Tide, Grove, Nebula and Graphite (dark), Dawn, Paper
  and Mist (daylight) — that recolor both the chrome and the terminal palette,
  set globally in Settings (`⌘,`) or overridden per host with a visual picker
- **Global terminal preferences** for font family and size (10–20px) and cursor
  style and blink, applied live to every open pane without losing scrollback
- **Disconnect all** in the tab bar, behind a confirmation dialog
- Optional in-app password saving so reconnects skip the prompt
- **Windows native window**: a single installer carrying both x64 and ARM64 that
  picks the right one per machine, per-user install with no administrator prompt,
  the native Windows title bar, and `Ctrl` in place of `⌘` in every shortcut hint
- A **per-platform font list** — Cascadia Mono, Cascadia Code, JetBrains Mono,
  Consolas and Courier New on Windows, the Mac families on macOS — probed against
  the fonts actually installed, and a stored font the current system does not
  have falls back to that platform's default instead of rendering nothing
- Saved hosts can keep a key **passphrase** ("Save passphrase"), so an encrypted
  key connects straight from the sidebar
- A **failed key login explains itself**: the message names the paths that were
  tried and why each one was unusable — missing, unreadable (on macOS it points at
  Files and Folders permission), protected by a passphrase, or the `.pub` file
  rather than the key

### Changed

- Settings lists (font family) are drawn by the app instead of a native `<select>`,
  following the active theme, keyboard-navigable, and clamped to the viewport.
- Terminal output batching and resize reporting are tuned per platform — Windows gets a
  wider output window and one resize per ~90ms only when the size actually changed —
  which removes the dropped frames on WebView2.
- Windows file semantics in the SFTP view: reserved names (`con`, `nul`, `com1`…) and
  illegal characters are rejected before a rename reaches the filesystem, and local
  paths use `\` with drive roots treated as unclimbable.

### Fixed

- Legacy saved hosts that still said `authMethod: "agent"` are normalized to the private
  key path at connect time.
- Dragging a tab or pane no longer re-sends a resize the backend already has, which made
  the remote shell repaint the whole screen (most visible on ConPTY).
- The terminal preview in Settings wraps instead of clipping mid-line on a narrow window.

### Known limitations

- Release builds are **notarized on neither platform**: macOS binaries are ad-hoc signed,
  so Gatekeeper blocks the first launch (double-click once, then press **Open Anyway** in
  System Settings → Privacy & Security — on macOS 15 right-click → Open no longer bypasses
  it). Installing from a terminal with `curl … | tar -xz -C /Applications` avoids Gatekeeper
  altogether, because curl doesn't set the quarantine flag. Windows binaries carry no
  Authenticode, so SmartScreen shows a warning on the first run (**More info → Run anyway**).
- A saved password or key passphrase is stored **in plain text** in the app's localStorage.
  Use it only on a machine you trust; unchecking the option and reconnecting removes it.
- No port forwarding, no `~/.ssh/config` import, no session restore after relaunch,
  and xterm.js is not yet told it is on ConPTY, so Windows line-wrap reflow is guessed.

[0.1.0]: https://github.com/Merbeleue/conch/releases/tag/v0.1.0
