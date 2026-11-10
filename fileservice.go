package main

import (
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// FileService exposes native file pickers to the frontend.
type FileService struct{}

func NewFileService() *FileService {
	return &FileService{}
}

// PickKeyFile opens a native open panel for an SSH private key. An empty path
// means the user cancelled the dialog.
func (s *FileService) PickKeyFile() (string, error) {
	app := application.Get()
	dialog := app.Dialog.OpenFile().
		SetTitle(tr("Choose a private key", "选择私钥")).
		SetMessage(tr(
			"Select the private key Conch should use for this host.",
			"选择 Conch 连接此主机时要使用的私钥。",
		)).
		SetButtonText(tr("Use key", "使用密钥")).
		CanChooseFiles(true).
		CanChooseDirectories(false).
		ShowHiddenFiles(true).
		AllowsOtherFileTypes(true)

	if window := app.Window.Current(); window != nil {
		dialog.AttachToWindow(window)
	}
	if home, err := os.UserHomeDir(); err == nil {
		sshDir := filepath.Join(home, ".ssh")
		if info, err := os.Stat(sshDir); err == nil && info.IsDir() {
			dialog.SetDirectory(sshDir)
		}
	}

	return dialog.PromptForSingleSelection()
}
