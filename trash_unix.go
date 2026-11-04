//go:build !windows

package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// moveToTrash puts a local entry in the user's Trash folder. Renaming into
// ~/.Trash needs no extra permissions. When the entry lives on another volume
// the rename fails, so it is copied first and only removed once the copy is
// complete — an external drive never loses the file outright.
func moveToTrash(value string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	trash := filepath.Join(home, ".Trash")
	if err := os.MkdirAll(trash, 0o700); err != nil {
		return err
	}
	dest := filepath.Join(trash, filepath.Base(value))
	if _, err := os.Lstat(dest); err == nil {
		base := filepath.Base(value)
		ext := filepath.Ext(base)
		stem := strings.TrimSuffix(base, ext)
		if stem == "" {
			stem, ext = base, ""
		}
		for i := 1; i < 10000; i++ {
			candidate := filepath.Join(trash, fmt.Sprintf("%s (%d)%s", stem, i, ext))
			if _, err := os.Lstat(candidate); err != nil {
				dest = candidate
				break
			}
		}
	}
	err = os.Rename(value, dest)
	if err == nil {
		return nil
	}
	if !errors.Is(err, syscall.EXDEV) {
		return err
	}
	if err := copyToTrash(value, dest); err != nil {
		return err
	}
	return os.RemoveAll(value)
}

func copyToTrash(from, to string) error {
	info, err := os.Lstat(from)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(from)
		if err != nil {
			return err
		}
		return os.Symlink(target, to)
	}
	if info.IsDir() {
		if err := os.MkdirAll(to, info.Mode().Perm()); err != nil {
			return err
		}
		entries, err := os.ReadDir(from)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := copyToTrash(filepath.Join(from, entry.Name()), filepath.Join(to, entry.Name())); err != nil {
				return err
			}
		}
		return os.Chmod(to, info.Mode().Perm())
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%s is not a regular file", filepath.Base(from))
	}
	source, err := os.Open(from)
	if err != nil {
		return err
	}
	defer source.Close()
	target, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, info.Mode().Perm())
	if err != nil {
		return err
	}
	buffer := make([]byte, 64*1024)
	_, copyErr := io.CopyBuffer(target, source, buffer)
	closeErr := target.Close()
	if copyErr != nil {
		_ = os.Remove(to)
		return copyErr
	}
	return closeErr
}
