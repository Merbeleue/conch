package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[SSHOutputEvent]("ssh:output")
	application.RegisterEvent[SSHExitEvent]("ssh:exit")
	application.RegisterEvent[SFTPTransferEvent]("sftp:transfer")
}

func main() {
	sshService := NewSSHService()
	sftpService := NewSFTPService(sshService)

	app := application.New(application.Options{
		Name:        "Conch",
		Description: "A modern open-source SSH and local terminal",
		Services: []application.Service{
			application.NewService(sshService),
			application.NewService(sftpService),
			application.NewService(NewFileService()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Conch",
		Width:     1180,
		Height:    760,
		MinWidth:  900,
		MinHeight: 560,
		Mac: application.MacWindow{
			// Window dragging comes from explicit --wails-draggable regions.
			// A native invisible titlebar would sit over the tab strip and
			// swallow right-clicks while the window is not fullscreen.
			InvisibleTitleBarHeight: 0,
			Backdrop:                application.MacBackdropNormal,
			// No native toolbar: an empty NSToolbar covers the tab strip in
			// windowed mode and swallows right-clicks (fullscreen removes it,
			// which is why the menu worked there).
			TitleBar: application.MacTitleBarHidden,
		},
		BackgroundColour:           application.NewRGB(11, 13, 18),
		DefaultContextMenuDisabled: true,
		URL:                        "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
