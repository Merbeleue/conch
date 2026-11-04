<p align="center">
  <img src="docs/conch-mark.svg" alt="Conch" width="112" height="112">
</p>

<h1 align="center">Conch</h1>

<p align="center">
  A modern, open-source SSH and local terminal for macOS and Windows.<br>
  Native window, no Electron, no bundled Chromium.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-6c5ce7"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%2012%2B%20%C2%B7%20Windows%2010%2B-5b6478">
  <a href="https://wails.io"><img alt="Built with Wails v3" src="https://img.shields.io/badge/built%20with-Wails%20v3-2b8aef"></a>
  <img alt="Terminal" src="https://img.shields.io/badge/terminal-xterm.js%20%2B%20WebGL-2f9e6f">
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> · English
</p>

---

Conch is a single native app for people who live in a terminal across several servers. It is built with [Wails v3](https://wails.io) — Go handles the SSH connections, PTYs and SFTP, React renders the interface, and the terminal itself is xterm.js with WebGL, inside Apple's own WKWebView on macOS and WebView2 on Windows. That means a Conch window opens fast, idles quietly, and looks like part of the system instead of a browser tab wearing a costume.

The design goal was the everyday workflow rather than the feature checklist: keep many hosts open without losing scrollback, rearrange them into panes without reconnecting, push a folder to a server without leaving the tab you are in, and drop a command into every session at once when you are doing the same thing on all of them.

<!--
Screenshots go here. GitHub renders images referenced from this repo, so drop PNGs
into docs/screenshots/ and uncomment:

![Conch split panes](docs/screenshots/splits.png)
-->

## Highlights

| | |
| --- | --- |
| **Platforms** | macOS 12+ and Windows 10/11, x64 and ARM64 — the system's own webview on both, no Electron |
| **Sessions** | Tabbed SSH and local shell sessions, split panes you build by dragging, workspaces that name themselves from the hosts inside |
| **Saved hosts** | Labels, collapsible groups, search (`⌘F`), duplicate/edit/delete from the context menu, click to focus an open tab |
| **SFTP** | A two-pane file manager that opens *inside* the current tab — transfers, rename, delete, `chmod`, all without hiding your host tabs |
| **Broadcast** | One keystroke mirrored to every live session, with a guard rail that turns itself off when there is nothing to broadcast to |
| **Theming** | Eight themes (five dark, three daylight) that recolor the chrome *and* the terminal palette, globally or per host |
| **Comfort** | Global font and cursor preferences applied live, animated connect flow with a real cancel, focus mode that gets out of the way |
| **Trust** | Host key verification against `~/.ssh/known_hosts` with a fingerprint dialog for first contact |

## Download

Everything comes from the [latest release](https://github.com/Merbeleue/conch/releases/latest).

### macOS

Grab **`Conch-0.2.0.dmg`** — a universal binary (Apple Silicon and Intel) for macOS 12 and
newer. Drag the app into Applications, then launch it once and approve it: builds are ad-hoc
signed but not yet notarized, so Gatekeeper stops the first launch with *"Apple can't verify
"conch"…"*. Double-click it once, then open **System Settings → Privacy & Security** and press
**Open Anyway** next to the "blocked conch" line. (Right-click → Open is no longer an
escape hatch for un-notarized apps on macOS 15.)

If you live in a terminal, skip Gatekeeper entirely — `curl` never sets the quarantine
flag, so the app opens on a plain double-click:

```bash
curl -fsSL https://github.com/Merbeleue/conch/releases/download/v0.2.0/Conch-0.2.0.tar.gz \
  | tar -xz -C /Applications
```

### Windows

**`Conch-0.2.0-windows-installer.exe`** carries both amd64 and arm64 builds and picks the
right one at install time, so it works on Intel/AMD machines and on Windows-on-ARM PCs. It
installs per-user into `%LOCALAPPDATA%\Programs\Conch` — no administrator prompt — and adds
Start Menu and Desktop shortcuts. Builds are unsigned, so SmartScreen shows *"Windows saved
your PC from an unknown app"* on the first run; press **More info → Run anyway**. If Edge
WebView2 is not present yet, the installer fetches the runtime for you.

There is no install step at all in **`Conch-0.2.0-windows-portable.zip`**: unpack it and run
`conch.exe` (x64) or `conch-arm64.exe`. Requires Windows 10 or newer.

Release notes live in [CHANGELOG.md](./CHANGELOG.md).

## Build from source

```bash
git clone https://github.com/Merbeleue/conch.git
cd conch
npm --prefix frontend install
wails3 build                       # → bin/conch (a single executable; just run it)
./bin/conch
```

Building the Windows executable from a Mac or Linux box is a cross-compile:

```bash
wails3 task windows:build ARCH=amd64   # → bin/conch.exe
```

`wails3 dev` does the same with hot reload for Go and the frontend, and the
[Development](#development) section covers building the `.app` bundle and the
`.dmg` yourself.

Conch makes no network calls beyond the hosts you connect to, and there are no
accounts, no telemetry and no update pinger. Everything you save stays in
localStorage on your own machine — see [Security notes](#security-notes).

## Full feature list

- Fast native window, no bundled Chromium
- xterm.js terminal with WebGL rendering, 256-color and true-color support
- Local shell sessions on your own machine — a login shell on a PTY on macOS, PowerShell (or `cmd`) on a ConPTY on Windows — with no sshd required
- Authentication via a private key (with optional passphrase and a native key-file picker) or password; when a key login fails, the message names the files it tried and why each one was unusable instead of just saying "unable to authenticate"
- Host key verification against `~/.ssh/known_hosts`, with a fingerprint dialog for first-time hosts
- Saved hosts with optional labels; click to focus an open tab or edit an idle host, double-click to connect
- Search saved hosts by name or IP with the sidebar filter; press `⌘F` from anywhere to jump to it
- Group saved hosts into collapsible sections; the group field suggests every existing group on focus, filters as you type, matches names case-insensitively, and creates a typed new group on save; hover "Move to group" in a host's context menu to open the group list without clicking
- Save button on the host form, so details can be stored without connecting
- Right-click a saved host to connect, duplicate the host entry, edit its details, move it to a group, or delete it; duplicates appear just below the original with `(1)`, `(2)` labels, and editing an existing host updates that entry in place instead of adding another
- Tabbed sessions: switch between hosts and local shells without losing scrollback
- Split panes combine the sessions you already have: `⌘D` splits right and `⇧⌘D` splits down (also in a tab's context menu), docking another live session into the current tab instead of dialing a second connection to the same host. When more than one session could join, a picker lets you choose which
- Drag a tab or a pane header onto any edge of a pane to build a custom layout — left, right, up or down — with a drop hint showing where the pane will land; moving a pane never reconnects it, so scrollback and the SSH session stay intact, and a tab that runs out of panes closes itself. Split panes sit as rounded cards with a high-contrast, draggable divider, and the focused pane gets an animated accent ring with a soft halo that stays clearly visible on the daylight themes
- A tab holding several panes becomes a workspace: its title is generated from the panes inside it (`Alpha + Bravo`, `Alpha +2`), a badge counts them, and the subtitle gives way to the workspace name; renaming the tab pins your own name so it stops following the panes
- Drag the dividers to resize a pane, double-click one to even the split up, and close panes individually from the pane header
- Right-click a tab to duplicate the connection, split it, rename it, or close it; copies follow the session they were made from with `(1)`, `(2)` aliases. A multi-pane workspace keeps only "Rename workspace" and "Close tab" in its menu, since splitting and duplicating no longer apply once it holds several sessions
- Disconnect all button in the tab bar closes every open session after a confirmation dialog
- Focus mode: the sidebar collapses when a session connects so the terminal fills the window; the Conch logo button in the top bar brings it back, and the sidebar returns automatically when the last tab closes
- Animated connection transition with a cancel button and Escape shortcut; cancelling also aborts the pending TCP/SSH handshake
- Optional password saving inside the app, so reconnects skip the password prompt
- Eight themes — five dark (Conch, Tide, Grove, Nebula, Graphite) and three daylight (Dawn, Paper, Mist) — that recolor the chrome and the terminal palette; set one globally in Settings (`⌘,`) or override it per host with a visual picker that previews each theme, where the override takes over the window while that session is active
- Global terminal typography: pick from the fonts your system actually has — SF Mono, JetBrains Mono, Menlo, Monaco or System Mono on macOS, Cascadia Mono, Cascadia Code, JetBrains Mono, Consolas or Courier New on Windows — plus a size from 10–20px in Settings → Terminal; the picker is drawn by the app rather than the OS, so the list stays legible on the dark themes; every open pane follows instantly, splits included, and keeps its scrollback while it refits
- Global cursor preferences: block, bar or underline with blinking on or off, shown in a live preview inside Settings
- Keyword highlighting in every terminal: errors, warnings, successes, status words, debug chatter and IPv4/IPv6/MAC addresses are coloured as they arrive, with a colour per rule set in Settings → Highlighting through the app's own picker. Colours are written as ANSI into the stream, so copying still yields plain text, and full-screen programs such as vim, htop and less pass through untouched
- Terminal emulation (`$TERM`) for SSH sessions and local shells: choose xterm-256color down to vt100 for hosts whose terminfo does not know a modern xterm, and reconnect to use the new value — open sessions keep the type they were given
- Optional right-click paste: selecting text copies it automatically, and a right click pastes the selection (or the clipboard when nothing is selected) with xterm's bracketed-paste and multi-line safeguards intact; with the setting off, each platform keeps its native right-click behaviour
- Broadcast input: the Broadcast button in the tab bar mirrors keystrokes from the focused pane to every open session, and turns itself off when fewer than two sessions are live or when you disconnect all; the button is disabled with an explanation when there is nothing to broadcast to
- SFTP file manager from the accent SFTP pill in the tab bar: it opens as a sub-view inside the current tab — the host tabs stay on screen and the terminals keep running underneath, so `Esc` or the Terminal button drops you straight back to the live shell, and each tab remembers the folders you were looking at. Two panes, local filesystem on the left — switchable to any other live session from an animated source picker that follows the app's own styling — and the connected host on the right, each with an editable path bar. Copy selected files and folders with the rail buttons, a double-click, or drag and drop; folders move recursively, both directions work, and a remote source can send straight to another host. When a file already exists on the target, a confirmation dialog lists the clashes and offers Overwrite (replaces that file) or Skip existing (leaves it untouched and copies nothing for it); folders and skipped names get Finder-style `(1)`, `(2)` suffixes instead, and a copy onto itself is refused rather than truncating the original. Right-click a row for file operations: inline Rename, Permissions on Linux hosts (an octal field with a live `-rwxr-xr-x` preview and an owner/group/others grid), and Delete — local items go to the macOS Trash or the Windows Recycle Bin after confirmation, remote ones are removed for good with a dialog that says so. A floating card shows the live percentage, transferred and total bytes, the current file, a cancel button, and a clear success, failure or canceled summary; finished transfers dismiss themselves. Everything follows the active theme, including the daylight palettes
- Resizable PTY that follows the window

## Keyboard shortcuts

On Windows every `⌘` is `Ctrl` — the app labels its own hints for the platform you are on.

| Keys | Action |
| --- | --- |
| `⌘D` / `⇧⌘D` | Split the focused pane right / down, docking another live session |
| `⌘F` | Jump to the saved-host search field |
| `⌘,` | Open Settings (theme, terminal font, cursor) |
| `Esc` | Cancel a pending connection; leave the SFTP sub-view and return to the terminal |
| `click` / `⌘click` / `⇧click` in a file list | Select / toggle / range-select rows in either SFTP pane |

Everything else is reachable from the tab bar, the tab and row context menus, and
the sidebar; double-click a saved host to connect.

## Requirements

Running it:

- macOS 12 or newer, or Windows 10 or newer (x64 and ARM64) — the Windows build needs the
  [Microsoft Edge WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/),
  which ships with Windows 11 and is fetched by the installer when missing

Building it:

- Go 1.26+
- Node.js 20.19+
- Wails v3 CLI
- Xcode Command Line Tools (macOS); `makensis` from NSIS 3 (`brew install makensis`) for the Windows installer

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0
# make sure ~/go/bin is on PATH
```

## Development

```bash
wails3 dev       # hot reload for Go and the frontend (http://localhost:9245)
wails3 build     # production binary in bin/
wails3 package   # conch.app bundle in bin/ (ad-hoc signed)
```

`wails3 package` builds the binary first, then wraps it and ad-hoc signs the bundle.
For a release, `wails3 task darwin:package:universal` produces a fat arm64 + x86_64
`bin/conch.app` and `wails3 task darwin:create:dmg` wraps it into the styled
`bin/conch.dmg` (`darwin:package:dmg` does both for the host architecture only).

The fat `bin/conch` that `darwin:package:universal` leaves behind blocks the next plain
`go build -o bin/conch` ("already exists and is not an object file"), so delete it before
`wails3 dev`.

Windows packaging, from any platform with `makensis` installed:

```bash
LC_ALL=en_US.UTF-8 wails3 task windows:build ARCH=arm64
mv bin/conch.exe bin/conch-arm64.exe
LC_ALL=en_US.UTF-8 wails3 task windows:build ARCH=amd64
cd build/windows/nsis && makensis \
  -DWAILS_INSTALL_SCOPE=user -DREQUEST_EXECUTION_LEVEL=user \
  -DARG_WAILS_AMD64_BINARY="$PWD/../../../bin/conch.exe" \
  -DARG_WAILS_ARM64_BINARY="$PWD/../../../bin/conch-arm64.exe" project.nsi
```

That yields one installer carrying both architectures; `wails3 task
windows:create:nsis:installer ARCH=amd64 INSTALL_SCOPE=user` does a single-arch build in one
step. Export a real UTF-8 locale in front of `makensis` — with `LANG` empty it aborts with
`std::bad_alloc` while generating its language tables.

After changing a Go service method or a registered event, regenerate the
TypeScript bridge (it is committed, so a fresh clone builds without this step):

```bash
wails3 generate bindings -ts -i
```

The frontend can also be built on its own:

```bash
cd frontend
npm install
npm run build      # tsc + vite build
```

## Project layout

```
main.go             Wails app setup, window options, event registration
sshservice.go       SSH sessions, auth (password/key/agent), known_hosts handling
localterm.go        The local terminal interface, with localterm_unix.go (PTY) and
                    localterm_windows.go (ConPTY) behind build tags
platform_unix.go    Per-platform strings, key-path hints and output batching
platform_windows.go   (same contract, Windows side)  · trash_unix/trash_windows.go
                    (Trash vs. Recycle Bin) for SFTP deletes
sftpservice.go      Dual-pane listings, transfers, rename/delete/chmod and progress events
fileservice.go      Native key-file picker
frontend/src/App.tsx      Session, tab and workspace state; keyboard shortcuts
frontend/src/components   Chrome: sidebar, tab bar, split panes, terminal, SFTP view, dialogs
frontend/src/lib          Themes, settings, host storage, split tree, transfer helpers,
                          platform.ts (OS detection, Ctrl vs ⌘, path and name rules)
frontend/bindings         Generated TypeScript bindings for Go services and events
build/              Wails build assets — build/darwin has the macOS packaging, build/windows
                    the NSIS installer and MSIX scaffolding
```

## How the terminal data flows

Go owns the SSH connection and the remote PTY. Remote output is coalesced
(every ~8ms) and emitted as `ssh:output` events with base64 payloads, which the
terminal decodes and writes as raw bytes. Keystrokes and resizes go back through
the bound `SSHService` methods. This keeps large outputs off the per-read bridge
path while staying binary-safe.

## Security notes

- A password and a key passphrase are stored in the app's local storage only when
  the matching "Save password" / "Save passphrase" checkbox is ticked, so reconnects
  from the sidebar can skip the prompt. Both values are plain text at rest in the
  webview's localStorage — use them only on a machine you trust. Unticking the option
  and reconnecting removes it from the saved host.
- Unknown host keys show a fingerprint dialog. Accepting it appends the key to
  `~/.ssh/known_hosts` (mode 0600); cancelling aborts the connection.
- Saved hosts (label, host, port, username, auth method, key path, group, theme,
  optional password and passphrase) live in the webview's localStorage.
  Sessions are bounded to 20 entries.

## Roadmap

- Port forwarding (local, remote and SOCKS)
- Importing hosts from `~/.ssh/config`, and reading `IdentityFile`/`User` defaults from it
- Configurable scrollback buffer size, then per-host terminal overrides
- Signed and notarized release builds — an Apple Developer ID plus notarization for the
  DMG, Authenticode for the Windows installer
- Sessions that survive an app relaunch (reopen the tabs you had open)
- Windows polish: telling xterm.js it is running on ConPTY (`windowsPty`) so reflow matches
  the shell, a machine-scope installer, and a key picker that starts in `%USERPROFILE%\.ssh`

## Contributing

Issues and pull requests are welcome — especially for platform behaviour I have not
hit yet; the Windows paths get less seat time than the macOS ones. Before opening one,
run the checks the project already keeps green:

```bash
cd frontend && npx tsc --noEmit && npm run build
cd .. && go vet ./... && go build -o bin/conch .
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o /tmp/conch.exe .
```

The code is deliberately flat: a handful of Go files own the backend, and the UI lives in
`frontend/src/components`. Conventions worth knowing before you start — theme
colours come only from `frontend/src/lib/themes.ts` (never hard-code a hex in a
component, and remember that daylight themes flip `--overlay-rgb` to ink, so any
new surface needs a `:root[data-scheme="light"]` pass), and file operations in the
SFTP view go through the endpoint abstraction in `sftpservice.go` rather than
touching `os` or `sftp` directly from a handler.

## License

MIT — see [LICENSE](./LICENSE).
