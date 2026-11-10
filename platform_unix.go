//go:build !windows

package main

import "time"

// Terminal output reaches the webview already coalesced (see SSHService.pump).
// WKWebView takes a per-read emit cheaply, so the batch stays small and the
// terminal as close to the keyboard echo latency as possible.
const (
	outputFlushInterval = 8 * time.Millisecond
	outputFlushLimit    = 64 * 1024
)

// localSourceLabel names the local pane in the file manager's source picker.
func localSourceLabel() string { return tr("This Mac", "这台 Mac") }

// platformNameProblem rejects a file name this OS cannot store. macOS and
// Linux only rule out the path separator, which validTransferName already does.
func platformNameProblem(name string) string { return "" }

// keyPermissionHint explains the one read failure that looks like a broken key:
// macOS refuses an app started from the Dock access to Downloads, Desktop and
// Documents until the user grants it explicitly.
func keyPermissionHint() string {
	return tr(
		" — macOS may be blocking this folder for apps (System Settings > Privacy & Security > Files and Folders), or the file is not readable by your user",
		" — macOS 可能阻止了应用访问此文件夹（系统设置 > 隐私与安全性 > 文件与文件夹），或者当前用户无法读取该文件",
	)
}
