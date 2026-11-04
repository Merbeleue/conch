//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

var (
	shell32              = syscall.NewLazyDLL("shell32.dll")
	ole32                = syscall.NewLazyDLL("ole32.dll")
	procSHFileOperationW = shell32.NewProc("SHFileOperationW")
	procCoInitializeEx   = ole32.NewProc("CoInitializeEx")
	procCoUninitialize   = ole32.NewProc("CoUninitialize")
)

const (
	foDelete = 3

	fofSilent          = 0x0004
	fofNoConfirmation  = 0x0010
	fofAllowUndo       = 0x0040
	fofNoErrorUI       = 0x0400
	coinitDisabledOLE1 = 0x0004
	coinitAPARTMENT    = 0x0002
)

// shellFileOperation mirrors SHFILEOPSTRUCTW for 64-bit Windows. The blank
// fields are the C struct's padding and must stay in place.
type shellFileOperation struct {
	hwnd                  uintptr
	wFunc                 uint32
	_                     uint32
	pFrom                 uintptr
	pTo                   uintptr
	fFlags                uint16
	_                     uint16
	fAnyOperationsAborted int32
	hNameMappings         uintptr
	lpszProgressTitle     uintptr
}

// moveToTrash sends a local entry to the Recycle Bin, the way Explorer does.
// Going through the shell rather than os.Rename means cross-volume moves,
// read-only files and per-drive $Recycle.Bin folders are all handled for us,
// and the item stays recoverable.
func moveToTrash(value string) error {
	if procSHFileOperationW.Find() != nil {
		// No shell (a Server Core install, say): fall back to a real delete so
		// the button still does something, since the UI already confirmed it.
		return os.RemoveAll(value)
	}

	// SHFileOperationW talks to shell folders over COM, and this runs on a
	// worker goroutine whose thread has never initialised COM. Lock the
	// goroutine to its thread first: the Go scheduler is free to move it, and
	// COM state lives on the thread, not on the goroutine.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	hr, _, _ := procCoInitializeEx.Call(0, coinitAPARTMENT|coinitDisabledOLE1)
	if hr == 0 { // S_OK: we own the initialisation, so we undo it.
		defer procCoUninitialize.Call()
	}

	// pFrom wants a double-null-terminated string list.
	encoded := utf16.Encode([]rune(value + "\x00"))
	encoded = append(encoded, 0)

	op := shellFileOperation{
		wFunc:  foDelete,
		pFrom:  uintptr(unsafe.Pointer(&encoded[0])),
		fFlags: fofAllowUndo | fofSilent | fofNoConfirmation | fofNoErrorUI,
	}
	ret, _, _ := procSHFileOperationW.Call(uintptr(unsafe.Pointer(&op)))
	runtime.KeepAlive(encoded)

	if op.fAnyOperationsAborted != 0 {
		return fmt.Errorf("%s: the delete was cancelled", filepath.Base(value))
	}
	if ret != 0 {
		return fmt.Errorf("%s: could not be moved to the Recycle Bin (0x%x)", filepath.Base(value), uint32(ret))
	}
	return nil
}
