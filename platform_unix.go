//go:build !windows

package main

// localSourceLabel names the local pane in the file manager's source picker.
func localSourceLabel() string { return "This Mac" }

// platformNameProblem rejects a file name this OS cannot store. macOS and
// Linux only rule out the path separator, which validTransferName already does.
func platformNameProblem(name string) string { return "" }
