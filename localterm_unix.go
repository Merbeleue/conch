//go:build !windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"github.com/creack/pty"
)

// startPlatformShell opens a real PTY and runs the shell attached to it.
func startPlatformShell(argv []string, dir string, cols int, rows int) (localTerminal, error) {
	if len(argv) == 0 {
		return nil, errors.New("no local shell to start")
	}
	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	if dir != "" {
		cmd.Dir = dir
	}

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return nil, fmt.Errorf("start local shell: %w", err)
	}
	return &unixTerminal{ptmx: ptmx, cmd: cmd}, nil
}

type unixTerminal struct {
	ptmx *os.File
	cmd  *exec.Cmd
}

func (t *unixTerminal) Read(p []byte) (int, error)  { return t.ptmx.Read(p) }
func (t *unixTerminal) Write(p []byte) (int, error) { return t.ptmx.Write(p) }
func (t *unixTerminal) Close() error                { return t.ptmx.Close() }

func (t *unixTerminal) Resize(cols int, rows int) error {
	return pty.Setsize(t.ptmx, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}

func (t *unixTerminal) Wait() localExit {
	err := t.cmd.Wait()
	reason := "exited"
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		// The shell is gone; a non-zero status or a signal is information for
		// the user, not a failure of Conch.
		if status, ok := exitErr.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			reason = "signal " + status.Signal().String()
		} else {
			reason = fmt.Sprintf("exit %d", exitErr.ExitCode())
		}
		err = nil
	}
	return localExit{Reason: reason, Err: err}
}

func (t *unixTerminal) Terminate() {
	if t.cmd == nil || t.cmd.Process == nil {
		return
	}
	// The shell runs as a process group leader (pty.Start calls Setsid), so
	// hang the whole group up rather than orphaning its children.
	_ = syscall.Kill(-t.cmd.Process.Pid, syscall.SIGHUP)
}

// localShellArgv picks the login shell to open in a local tab.
func localShellArgv() []string {
	for _, candidate := range []string{os.Getenv("SHELL"), "/bin/zsh", "/bin/bash", "/bin/sh"} {
		if !filepath.IsAbs(candidate) {
			continue
		}
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
			return []string{candidate, "-l"}
		}
	}
	return []string{"/bin/sh", "-l"}
}
