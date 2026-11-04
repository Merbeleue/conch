package main

import "io"

// localTerminal is the peer end of a local shell session: a PTY master on
// macOS and Linux, a ConPTY pseudo-console on Windows. It carries the byte
// stream the terminal emulator talks to and owns the child process, so the
// session plumbing in sshservice.go never needs to know which one it got.
type localTerminal interface {
	io.ReadWriteCloser

	// Resize tells the shell how wide the pane became.
	Resize(cols int, rows int) error

	// Wait blocks until the shell exits and says how it ended.
	Wait() localExit

	// Terminate stops a shell that is still running when the user disconnects.
	Terminate()
}

// localExit is what a finished shell reports back. Reason lands in the
// ssh:exit event, so it reads like "exit 1" or "signal SIGHUP" rather than a
// Go error string; Err stays for genuine failures waiting on the process.
type localExit struct {
	Reason string
	Err    error
}

// startLocalShell runs argv[0] with argv[1:] in dir, attached to a terminal
// that is cols wide and rows tall. The returned terminal is already started.
func startLocalShell(argv []string, dir string, cols int, rows int) (localTerminal, error) {
	return startPlatformShell(argv, dir, cols, rows)
}
