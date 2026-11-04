//go:build windows

package main

import (
	"fmt"
	"strings"
	"time"
)

// WebView2 runs each event emit as a script evaluation on its UI thread, which
// costs more per call than the same call on WKWebView. Batching twice as much
// output per emit halves that traffic, and the extra ~8ms is still under one
// frame at 60Hz, so typing echo does not feel slower.
const (
	outputFlushInterval = 16 * time.Millisecond
	outputFlushLimit    = 128 * 1024
)

// localSourceLabel names the local pane in the file manager's source picker.
func localSourceLabel() string { return "This PC" }

// windowsReserved are the device names Win32 still refuses to use as files,
// with or without an extension.
var windowsReserved = map[string]bool{
	"con": true, "prn": true, "aux": true, "nul": true,
}

func init() {
	for i := 1; i <= 9; i++ {
		windowsReserved[fmt.Sprintf("com%d", i)] = true
		windowsReserved[fmt.Sprintf("lpt%d", i)] = true
	}
}

// platformNameProblem rejects a file name Windows cannot store: an illegal
// character, a reserved device name, or a trailing dot or space, all of which
// would otherwise surface as an opaque os.Rename failure.
func platformNameProblem(name string) string {
	if bad := strings.ContainsAny(name, `<>:"\|?*`); bad {
		return `A name cannot contain \ / : * ? " < > |`
	}
	stem := strings.ToLower(strings.SplitN(name, ".", 2)[0])
	if windowsReserved[stem] {
		return fmt.Sprintf("%q is a reserved name on Windows", strings.ToUpper(stem))
	}
	if strings.HasSuffix(name, ".") || strings.HasSuffix(name, " ") {
		return "A name cannot end with a dot or a space on Windows"
	}
	return ""
}

// keyPermissionHint is the Windows half of the read-failure message: there is
// no per-folder consent, so it is about the file itself and its ACL.
func keyPermissionHint() string {
	return " — check the path and that your Windows account can read this file"
}
