//go:build windows

package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/UserExistsError/conpty"
)

// startPlatformShell runs the shell inside a ConPTY pseudo-console, which is
// what gives a GUI process an interactive console without popping a window.
// ConPTY speaks UTF-8 on both pipes, so xterm.js needs no transcoding.
func startPlatformShell(argv []string, dir string, cols int, rows int, termType string) (localTerminal, error) {
	if len(argv) == 0 {
		return nil, errors.New(tr("no local shell to start", "没有可启动的本地 shell"))
	}
	if !conpty.IsConPtyAvailable() {
		return nil, errors.New(tr(
			"ConPTY is unavailable: this Windows build needs Windows 10 1809 or newer",
			"ConPTY 不可用：此 Windows 版本需要 Windows 10 1809 或更高版本",
		))
	}
	cpty, err := conpty.Start(
		commandLine(argv),
		conpty.ConPtyDimensions(cols, rows),
		conpty.ConPtyWorkDir(dir),
		conpty.ConPtyEnv(envWithTerm(termType)),
	)
	if err != nil {
		return nil, fmt.Errorf(tr("start local shell: %w", "启动本地 shell 失败：%w"), err)
	}
	return &windowsTerminal{cpty: cpty}, nil
}

type windowsTerminal struct {
	cpty      *conpty.ConPty
	closeOnce sync.Once
	closeErr  error
}

func (t *windowsTerminal) Read(p []byte) (int, error)  { return t.cpty.Read(p) }
func (t *windowsTerminal) Write(p []byte) (int, error) { return t.cpty.Write(p) }

// Close tears down the pseudo-console, which also terminates the shell.
// Closing twice is harmless because Disconnect and the reader goroutine both
// reach this on the way out.
func (t *windowsTerminal) Close() error {
	t.closeOnce.Do(func() { t.closeErr = t.cpty.Close() })
	return t.closeErr
}

func (t *windowsTerminal) Resize(cols int, rows int) error {
	return t.cpty.Resize(cols, rows)
}

func (t *windowsTerminal) Wait() localExit {
	code, err := t.cpty.Wait(context.Background())
	if err != nil {
		return localExit{Reason: "exited", Err: err}
	}
	if code == 0 {
		return localExit{Reason: "exited"}
	}
	return localExit{Reason: fmt.Sprintf("exit %d", code)}
}

// Terminate closes the pseudo-console; ConPTY kills the attached process tree
// when its console goes away, so there is no separate signal to send.
func (t *windowsTerminal) Terminate() { _ = t.Close() }

// localShellArgv picks the shell for a local tab: PowerShell 7 when installed,
// then Windows PowerShell, then cmd.exe.
func localShellArgv() []string {
	powerShell := []struct {
		path string
		args []string
	}{
		{filepath.Join(programFiles(), "PowerShell", "7", "pwsh.exe"), []string{"-NoLogo"}},
		{filepath.Join(systemRoot(), "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), []string{"-NoLogo"}},
	}
	for _, candidate := range powerShell {
		if info, err := os.Stat(candidate.path); err == nil && !info.IsDir() {
			return append([]string{candidate.path}, candidate.args...)
		}
	}
	if comspec := os.Getenv("COMSPEC"); comspec != "" {
		if info, err := os.Stat(comspec); err == nil && !info.IsDir() {
			// cmd.exe starts in the OEM codepage, which mangles anything that is
			// not ASCII; switch it to UTF-8 to match what ConPTY carries.
			return []string{comspec, "/k", "chcp 65001 >nul"}
		}
	}
	return nil
}

func programFiles() string {
	if p := os.Getenv("ProgramFiles"); p != "" {
		return p
	}
	return `C:\Program Files`
}

func systemRoot() string {
	if r := os.Getenv("SystemRoot"); r != "" {
		return r
	}
	return `C:\Windows`
}

// commandLine joins argv the way CreateProcess expects it: the program is
// always quoted because "Program Files" contains a space, and an argument is
// quoted when it holds a space or a double quote.
func commandLine(argv []string) string {
	parts := make([]string, 0, len(argv))
	for _, arg := range argv {
		parts = append(parts, quoteArg(arg))
	}
	return strings.Join(parts, " ")
}

func quoteArg(arg string) string {
	if arg == "" {
		return `""`
	}
	if !strings.ContainsAny(arg, " \"") {
		return arg
	}
	escaped := strings.ReplaceAll(arg, `"`, `\"`)
	if strings.HasSuffix(escaped, `\`) {
		escaped += `\`
	}
	return `"` + escaped + `"`
}
