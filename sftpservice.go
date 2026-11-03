package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// errTransferCancelled is internal: the half-written target file is removed and
// the result reports Canceled instead of an error.
var errTransferCancelled = errors.New("transfer cancelled")

// SFTPSource identifies one side of the file manager: this Mac or a live SSH
// session. Labels come from the main window so renamed tabs keep their name.
type SFTPSource struct {
	Kind      string
	SessionID string
	Label     string
	Host      string
	User      string
	Port      int
}

type SFTPListRequest struct {
	Source SFTPSource
	Path   string
}

type SFTPEntry struct {
	Name     string
	Size     int64
	IsDir    bool
	IsLink   bool
	Modified int64
	// Perm holds the low permission bits (0o755 style) so the file manager can
	// show and edit them. Symlinks report the target's bits.
	Perm uint32
}

type SFTPListing struct {
	Path    string
	Home    string
	Parent  string
	Entries []SFTPEntry
}

type SFTPTransferRequest struct {
	TransferID string
	Source     SFTPSource
	SourceDir  string
	Target     SFTPSource
	TargetDir  string
	Names      []string
	// Overwrite replaces files that already exist at the destination instead of
	// choosing a Finder-style " (1)" name. Folders still get a unique name so a
	// transfer never merges into an existing tree.
	Overwrite bool
}

type SFTPConflictRequest struct {
	Source    SFTPSource
	SourceDir string
	Target    SFTPSource
	TargetDir string
	Names     []string
}

// SFTPConflict describes a source file whose name already exists as a regular
// file in the target folder.
type SFTPConflict struct {
	Name             string
	ExistingName     string
	Size             int64
	ExistingSize     int64
	ExistingModified int64
}

// SFTPRenameRequest renames one entry inside a folder. The destination must not
// exist yet; the window asks before retrying so a typo never destroys a file.
type SFTPRenameRequest struct {
	Source SFTPSource
	Dir    string
	From   string
	To     string
}

// SFTPDeleteRequest removes the named entries from one folder. Local entries go
// to the macOS Trash, remote entries are deleted for real after the window has
// asked for confirmation.
type SFTPDeleteRequest struct {
	Source SFTPSource
	Dir    string
	Names  []string
}

// SFTPChmodRequest sets the permission bits on the named entries.
type SFTPChmodRequest struct {
	Source SFTPSource
	Dir    string
	Names  []string
	Perm   uint32
}

// SFTPStatRequest asks for one entry so the permission editor can start from the
// real value instead of guessing.
type SFTPStatRequest struct {
	Source SFTPSource
	Dir    string
	Name   string
}

type SFTPTransferFile struct {
	Name  string
	Error string
}

type SFTPTransferResult struct {
	TransferID  string
	SourceLabel string
	TargetLabel string
	SourceDir   string
	TargetDir   string
	Copied      int
	Failed      int
	Canceled    bool
	Bytes       int64
	TotalBytes  int64
	Files       []SFTPTransferFile
}

// SFTPTransferEvent carries cumulative progress so a delayed event can never
// make the bar jump backwards.
type SFTPTransferEvent struct {
	TransferID  string
	SourceLabel string
	TargetLabel string
	CurrentName string
	FileIndex   int
	FileCount   int
	FileBytes   int64
	FileSize    int64
	Bytes       int64
	TotalBytes  int64
	Percent     int
}

type SFTPService struct {
	ssh       *SSHService
	mu        sync.Mutex
	labels    map[string]string
	transfers map[string]*transferJob
}

type transferJob struct {
	cancelled atomic.Bool
}

func NewSFTPService(ssh *SSHService) *SFTPService {
	return &SFTPService{
		ssh:       ssh,
		labels:    make(map[string]string),
		transfers: make(map[string]*transferJob),
	}
}

// SetLabels records the tab names the main window shows, so the source picker
// reads "Alpha" instead of "you@203.0.113.10" after a rename.
func (s *SFTPService) SetLabels(labels map[string]string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, label := range labels {
		if trimmed := strings.TrimSpace(label); trimmed != "" {
			s.labels[id] = trimmed
		}
	}
}

// Sources lists this Mac plus every live SSH session for the source picker.
func (s *SFTPService) Sources() []SFTPSource {
	sources := []SFTPSource{{Kind: "local", Label: "This Mac", Host: "localhost"}}
	for _, ref := range s.ssh.liveSSHSessions() {
		s.mu.Lock()
		label := s.labels[ref.id]
		s.mu.Unlock()
		if label == "" {
			label = sshSourceLabel(ref.user, ref.host, ref.port)
		}
		sources = append(sources, SFTPSource{
			Kind:      "remote",
			SessionID: ref.id,
			Label:     label,
			Host:      ref.host,
			User:      ref.user,
			Port:      ref.port,
		})
	}
	sort.SliceStable(sources[1:], func(i, j int) bool {
		a, b := sources[1+i], sources[1+j]
		if a.Label != b.Label {
			return strings.ToLower(a.Label) < strings.ToLower(b.Label)
		}
		return a.Host < b.Host
	})
	return sources
}

// List returns one folder for either endpoint. An empty path starts at home.
func (s *SFTPService) List(req SFTPListRequest) (*SFTPListing, error) {
	endpoint, err := s.endpoint(req.Source)
	if err != nil {
		return nil, err
	}
	dir, err := endpoint.resolveDir(req.Path)
	if err != nil {
		return nil, err
	}
	infos, err := endpoint.readDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", dir, err)
	}
	entries := make([]SFTPEntry, 0, len(infos))
	for _, info := range infos {
		name := info.Name()
		if name == "." || name == ".." {
			continue
		}
		isDir := info.IsDir()
		isLink := info.Mode()&os.ModeSymlink != 0
		if isLink {
			if target, err := endpoint.stat(endpoint.join(dir, name)); err == nil {
				isDir = target.IsDir()
			}
		}
		entries = append(entries, SFTPEntry{
			Name:     name,
			Size:     info.Size(),
			IsDir:    isDir,
			IsLink:   isLink,
			Modified: info.ModTime().UnixMilli(),
			Perm:     uint32(info.Mode().Perm()),
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		a, b := strings.ToLower(entries[i].Name), strings.ToLower(entries[j].Name)
		if a != b {
			return a < b
		}
		return entries[i].Name < entries[j].Name
	})
	home, err := endpoint.home()
	if err != nil {
		home = ""
	}
	return &SFTPListing{
		Path:    dir,
		Home:    home,
		Parent:  endpoint.parent(dir),
		Entries: entries,
	}, nil
}

// Conflicts reports source files that already exist as files in the target
// folder, so the window can ask before replacing anything.
func (s *SFTPService) Conflicts(req SFTPConflictRequest) ([]SFTPConflict, error) {
	source, err := s.endpoint(req.Source)
	if err != nil {
		return nil, err
	}
	target, err := s.endpoint(req.Target)
	if err != nil {
		return nil, err
	}
	sourceDir, err := source.resolveDir(req.SourceDir)
	if err != nil {
		return nil, err
	}
	targetDir, err := target.resolveDir(req.TargetDir)
	if err != nil {
		return nil, err
	}
	existing, err := target.readDir(targetDir)
	if err != nil {
		return nil, fmt.Errorf("read target folder: %w", err)
	}
	foldCase := target.kind == "local"
	byName := make(map[string]os.FileInfo, len(existing))
	for _, info := range existing {
		byName[destinationKey(info.Name(), foldCase)] = info
	}

	conflicts := make([]SFTPConflict, 0)
	seen := make(map[string]bool, len(req.Names))
	for _, name := range req.Names {
		if !validTransferName(name) || seen[name] {
			continue
		}
		seen[name] = true
		info, err := source.stat(source.join(sourceDir, name))
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		hit, ok := byName[destinationKey(name, foldCase)]
		if !ok || !hit.Mode().IsRegular() {
			continue
		}
		// Copying a file onto itself (both panes on the same host and folder)
		// would truncate it, so it keeps the Finder-style copy name instead.
		if sameEndpointFile(source, target, info, hit, source.join(sourceDir, name), target.join(targetDir, hit.Name())) {
			continue
		}
		conflicts = append(conflicts, SFTPConflict{
			Name:             name,
			ExistingName:     hit.Name(),
			Size:             info.Size(),
			ExistingSize:     hit.Size(),
			ExistingModified: hit.ModTime().UnixMilli(),
		})
	}
	return conflicts, nil
}

// Transfer copies the selected entries from one pane to the other. It supports
// local→remote, remote→local and remote→remote, including folders. Files that
// already exist are renamed Finder-style unless the caller asked to overwrite.
func (s *SFTPService) Transfer(req SFTPTransferRequest) (*SFTPTransferResult, error) {
	source, err := s.endpoint(req.Source)
	if err != nil {
		return nil, err
	}
	target, err := s.endpoint(req.Target)
	if err != nil {
		return nil, err
	}
	sourceDir, err := source.resolveDir(req.SourceDir)
	if err != nil {
		return nil, err
	}
	targetDir, err := target.resolveDir(req.TargetDir)
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(req.Names))
	seen := make(map[string]bool, len(req.Names))
	for _, name := range req.Names {
		if !validTransferName(name) || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	if len(names) == 0 {
		return nil, errors.New("select at least one file or folder")
	}

	transferID := strings.TrimSpace(req.TransferID)
	if transferID == "" {
		transferID = newSessionID()
	}
	job := &transferJob{}
	s.mu.Lock()
	if _, exists := s.transfers[transferID]; exists {
		s.mu.Unlock()
		return nil, errors.New("this transfer is already in progress")
	}
	s.transfers[transferID] = job
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.transfers, transferID)
		s.mu.Unlock()
	}()

	result := &SFTPTransferResult{
		TransferID:  transferID,
		SourceLabel: source.label,
		TargetLabel: target.label,
		SourceDir:   sourceDir,
		TargetDir:   targetDir,
		Files:       make([]SFTPTransferFile, 0),
	}

	items, failures, totalBytes, fileCount, err := collectTransfer(
		source, target, sourceDir, targetDir, names, req.Overwrite, &job.cancelled,
	)
	result.Files = append(result.Files, failures...)
	result.TotalBytes = totalBytes
	if err != nil {
		if errors.Is(err, errTransferCancelled) {
			result.Canceled = true
			result.Failed = len(result.Files)
			return result, nil
		}
		return nil, err
	}

	var (
		sent      int64
		fileIndex int
		fileSize  int64
		fileSent  int64
		lastEmit  time.Time
		current   string
	)
	emit := func(force bool) {
		if !force && time.Since(lastEmit) < 80*time.Millisecond {
			return
		}
		lastEmit = time.Now()
		percent := 0
		if totalBytes > 0 {
			percent = int(sent * 100 / totalBytes)
			if percent > 99 && sent < totalBytes {
				percent = 99
			}
			if percent > 100 {
				percent = 100
			}
		} else if fileCount == 0 {
			percent = 100
		}
		app := application.Get()
		if app == nil {
			return
		}
		app.Event.Emit("sftp:transfer", SFTPTransferEvent{
			TransferID:  transferID,
			SourceLabel: source.label,
			TargetLabel: target.label,
			CurrentName: current,
			FileIndex:   fileIndex,
			FileCount:   fileCount,
			FileBytes:   fileSent,
			FileSize:    fileSize,
			Bytes:       sent,
			TotalBytes:  totalBytes,
			Percent:     percent,
		})
	}
	emit(true)

	buffer := make([]byte, 64*1024)
	for _, item := range items {
		if job.cancelled.Load() {
			result.Canceled = true
			break
		}
		if item.IsDir {
			if err := target.mkdirAll(item.Dst); err != nil {
				result.Failed++
				result.Files = append(result.Files, SFTPTransferFile{Name: item.Name, Error: err.Error()})
			}
			continue
		}

		fileIndex++
		current = item.Name
		fileSize = item.Size
		fileSent = 0
		emit(true)

		in, err := source.openRead(item.Src)
		if err != nil {
			result.Failed++
			result.Files = append(result.Files, SFTPTransferFile{Name: item.Name, Error: err.Error()})
			continue
		}
		out, err := target.openWrite(item.Dst, item.Mode)
		if err != nil {
			_ = in.Close()
			result.Failed++
			result.Files = append(result.Files, SFTPTransferFile{Name: item.Name, Error: err.Error()})
			continue
		}

		progress := &transferProgressWriter{
			w:         out,
			cancelled: &job.cancelled,
			onWrite: func(n int) {
				fileSent += int64(n)
				sent += int64(n)
				emit(false)
			},
		}
		_, copyErr := io.CopyBuffer(progress, in, buffer)
		_ = in.Close()
		closeErr := out.Close()
		if copyErr == nil {
			copyErr = closeErr
		}
		if copyErr != nil {
			_ = target.remove(item.Dst)
			if errors.Is(copyErr, errTransferCancelled) {
				result.Canceled = true
				result.Files = append(result.Files, SFTPTransferFile{Name: item.Name, Error: "canceled"})
				break
			}
			result.Failed++
			result.Files = append(result.Files, SFTPTransferFile{Name: item.Name, Error: copyErr.Error()})
			continue
		}

		_ = target.chmod(item.Dst, item.Mode)
		result.Copied++
		emit(true)
	}

	result.Bytes = sent
	if !result.Canceled && result.Failed == 0 {
		emit(true)
	}
	return result, nil
}

// CancelTransfer asks an in-flight transfer to stop at the next chunk boundary.
func (s *SFTPService) CancelTransfer(transferID string) {
	transferID = strings.TrimSpace(transferID)
	if transferID == "" {
		return
	}
	s.mu.Lock()
	job := s.transfers[transferID]
	s.mu.Unlock()
	if job != nil {
		job.cancelled.Store(true)
	}
}

// Stat returns one entry so the permission editor can start from the real value.
func (s *SFTPService) Stat(req SFTPStatRequest) (*SFTPEntry, error) {
	endpoint, err := s.endpoint(req.Source)
	if err != nil {
		return nil, err
	}
	dir, err := endpoint.resolveDir(req.Dir)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	if !validTransferName(name) {
		return nil, errors.New("select one file or folder first")
	}
	info, err := endpoint.lstat(endpoint.join(dir, name))
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}
	isDir := info.IsDir()
	isLink := info.Mode()&os.ModeSymlink != 0
	if isLink {
		if target, err := endpoint.stat(endpoint.join(dir, name)); err == nil {
			isDir = target.IsDir()
		}
	}
	return &SFTPEntry{
		Name:     name,
		Size:     info.Size(),
		IsDir:    isDir,
		IsLink:   isLink,
		Modified: info.ModTime().UnixMilli(),
		Perm:     uint32(info.Mode().Perm()),
	}, nil
}

// Rename moves one entry inside its own folder. It refuses a name that already
// exists so a typo cannot destroy a file.
func (s *SFTPService) Rename(req SFTPRenameRequest) error {
	endpoint, err := s.endpoint(req.Source)
	if err != nil {
		return err
	}
	dir, err := endpoint.resolveDir(req.Dir)
	if err != nil {
		return err
	}
	from := strings.TrimSpace(req.From)
	to := strings.TrimSpace(req.To)
	if !validTransferName(from) {
		return errors.New("the item to rename is not valid")
	}
	if !validTransferName(to) {
		return errors.New("a name cannot be empty or contain /")
	}
	if from == to {
		return nil
	}
	src := endpoint.join(dir, from)
	dst := endpoint.join(dir, to)
	if _, err := endpoint.lstat(src); err != nil {
		return fmt.Errorf("%s: %w", from, err)
	}
	if _, err := endpoint.lstat(dst); err == nil {
		return fmt.Errorf("%s already exists in this folder", to)
	}
	return endpoint.rename(src, dst)
}

// Delete removes the selected entries. Local items are moved to the macOS Trash
// so they stay recoverable; remote items are deleted for real, folders included.
func (s *SFTPService) Delete(req SFTPDeleteRequest) error {
	endpoint, err := s.endpoint(req.Source)
	if err != nil {
		return err
	}
	dir, err := endpoint.resolveDir(req.Dir)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(req.Names))
	seen := make(map[string]bool, len(req.Names))
	for _, name := range req.Names {
		if !validTransferName(name) || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	if len(names) == 0 {
		return errors.New("select at least one file or folder")
	}

	problems := make([]string, 0)
	for _, name := range names {
		target := endpoint.join(dir, name)
		info, err := endpoint.lstat(target)
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s: %s", name, err))
			continue
		}
		if endpoint.kind == "local" {
			err = moveToTrash(target)
		} else {
			err = endpoint.removeAll(target, info)
		}
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s: %s", name, err))
		}
	}
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

// Chmod sets the permission bits on the selected entries, which is the usual way
// to fix a script that is not executable on a Linux host.
func (s *SFTPService) Chmod(req SFTPChmodRequest) error {
	endpoint, err := s.endpoint(req.Source)
	if err != nil {
		return err
	}
	dir, err := endpoint.resolveDir(req.Dir)
	if err != nil {
		return err
	}
	perm := os.FileMode(req.Perm & 0o777)
	names := make([]string, 0, len(req.Names))
	seen := make(map[string]bool, len(req.Names))
	for _, name := range req.Names {
		if !validTransferName(name) || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	if len(names) == 0 {
		return errors.New("select at least one file or folder")
	}

	problems := make([]string, 0)
	for _, name := range names {
		target := endpoint.join(dir, name)
		if _, err := endpoint.lstat(target); err != nil {
			problems = append(problems, fmt.Sprintf("%s: %s", name, err))
			continue
		}
		if err := endpoint.setPerm(target, perm); err != nil {
			problems = append(problems, fmt.Sprintf("%s: %s", name, err))
		}
	}
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

type sftpEndpoint struct {
	kind    string
	client  *sftp.Client
	label   string
	session string
}

func (s *SFTPService) endpoint(src SFTPSource) (*sftpEndpoint, error) {
	kind := strings.ToLower(strings.TrimSpace(src.Kind))
	if kind == "" {
		kind = "local"
	}
	if kind == "local" {
		return &sftpEndpoint{kind: "local", label: "This Mac"}, nil
	}
	if kind != "remote" {
		return nil, fmt.Errorf("unknown source type %q", src.Kind)
	}
	sess := s.ssh.lookup(strings.TrimSpace(src.SessionID))
	if sess == nil {
		return nil, errors.New("the remote session is no longer connected")
	}
	client, err := s.ssh.sftpFor(sess)
	if err != nil {
		return nil, err
	}
	label := strings.TrimSpace(src.Label)
	if label == "" {
		s.mu.Lock()
		label = s.labels[sess.id]
		s.mu.Unlock()
	}
	if label == "" {
		label = sshSourceLabel(sess.user, sess.host, sess.port)
	}
	return &sftpEndpoint{kind: "remote", client: client, label: label, session: sess.id}, nil
}

func (e *sftpEndpoint) home() (string, error) {
	if e.kind == "local" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Clean(home), nil
	}
	home, err := e.client.Getwd()
	if err != nil {
		return "", fmt.Errorf("find the remote home folder: %w", err)
	}
	return path.Clean(home), nil
}

func (e *sftpEndpoint) resolveDir(requested string) (string, error) {
	home, err := e.home()
	if err != nil {
		return "", err
	}
	value := strings.TrimSpace(requested)
	switch {
	case value == "" || value == "~":
		value = home
	case strings.HasPrefix(value, "~/"):
		value = e.join(home, strings.TrimPrefix(value, "~/"))
	case !e.isAbs(value):
		value = e.join(home, value)
	}
	value = e.clean(value)
	info, err := e.stat(value)
	if err != nil {
		return "", fmt.Errorf("%s: %w", value, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%s is not a folder", value)
	}
	return value, nil
}

func (e *sftpEndpoint) join(dir, name string) string {
	if e.kind == "local" {
		return filepath.Join(dir, name)
	}
	return path.Join(dir, name)
}

func (e *sftpEndpoint) clean(value string) string {
	if e.kind == "local" {
		return filepath.Clean(value)
	}
	return path.Clean(value)
}

func (e *sftpEndpoint) isAbs(value string) bool {
	if e.kind == "local" {
		return filepath.IsAbs(value)
	}
	return path.IsAbs(value)
}

func (e *sftpEndpoint) parent(dir string) string {
	var parent string
	if e.kind == "local" {
		parent = filepath.Dir(dir)
	} else {
		parent = path.Dir(dir)
	}
	if parent == dir || parent == "." {
		return ""
	}
	return parent
}

func (e *sftpEndpoint) stat(value string) (os.FileInfo, error) {
	if e.kind == "local" {
		return os.Stat(value)
	}
	return e.client.Stat(value)
}

func (e *sftpEndpoint) readDir(dir string) ([]os.FileInfo, error) {
	if e.kind == "local" {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return nil, err
		}
		infos := make([]os.FileInfo, 0, len(entries))
		for _, entry := range entries {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			infos = append(infos, info)
		}
		return infos, nil
	}
	return e.client.ReadDir(dir)
}

func (e *sftpEndpoint) openRead(value string) (io.ReadCloser, error) {
	if e.kind == "local" {
		return os.Open(value)
	}
	return e.client.Open(value)
}

func (e *sftpEndpoint) openWrite(value string, mode os.FileMode) (io.WriteCloser, error) {
	perm := mode.Perm()
	if perm == 0 {
		perm = 0o644
	}
	if e.kind == "local" {
		return os.OpenFile(value, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	}
	return e.client.OpenFile(value, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
}

func (e *sftpEndpoint) mkdirAll(value string) error {
	if e.kind == "local" {
		return os.MkdirAll(value, 0o755)
	}
	return e.client.MkdirAll(value)
}

func (e *sftpEndpoint) chmod(value string, mode os.FileMode) error {
	perm := mode.Perm()
	if perm == 0 {
		return nil
	}
	if e.kind == "local" {
		return os.Chmod(value, perm)
	}
	return e.client.Chmod(value, perm)
}

func (e *sftpEndpoint) remove(value string) error {
	if e.kind == "local" {
		return os.Remove(value)
	}
	return e.client.Remove(value)
}

func (e *sftpEndpoint) lstat(value string) (os.FileInfo, error) {
	if e.kind == "local" {
		return os.Lstat(value)
	}
	return e.client.Lstat(value)
}

func (e *sftpEndpoint) rename(from, to string) error {
	if e.kind == "local" {
		return os.Rename(from, to)
	}
	return e.client.Rename(from, to)
}

// setPerm always applies the bits it is given, including 000.
func (e *sftpEndpoint) setPerm(value string, perm os.FileMode) error {
	if e.kind == "local" {
		return os.Chmod(value, perm)
	}
	return e.client.Chmod(value, perm)
}

// removeAll deletes a remote entry, walking into folders depth-first. Symlinks
// are removed as links so a folder they point at is never emptied.
func (e *sftpEndpoint) removeAll(value string, info os.FileInfo) error {
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return e.remove(value)
	}
	infos, err := e.readDir(value)
	if err != nil {
		return err
	}
	for _, child := range infos {
		if child.Name() == "." || child.Name() == ".." {
			continue
		}
		if err := e.removeAll(e.join(value, child.Name()), child); err != nil {
			return err
		}
	}
	return e.remove(value)
}

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

func validTransferName(name string) bool {
	return name != "" && name != "." && name != ".." && !strings.ContainsAny(name, `/\`)
}

// copyItem is one directory or regular file in the planned copy, in walk order
// so directories are created before their children.
type copyItem struct {
	Name  string
	Dst   string
	Src   string
	IsDir bool
	Size  int64
	Mode  os.FileMode
}

func collectTransfer(
	source, target *sftpEndpoint,
	sourceDir, targetDir string,
	names []string,
	overwrite bool,
	cancel *atomic.Bool,
) ([]copyItem, []SFTPTransferFile, int64, int, error) {
	used, err := existingNames(target, targetDir)
	if err != nil {
		return nil, nil, 0, 0, fmt.Errorf("read target folder: %w", err)
	}

	items := make([]copyItem, 0, len(names))
	failures := make([]SFTPTransferFile, 0)
	var totalBytes int64
	var fileCount int

	for _, name := range names {
		if cancel.Load() {
			return items, failures, totalBytes, fileCount, errTransferCancelled
		}
		info, err := source.stat(source.join(sourceDir, name))
		if err != nil {
			failures = append(failures, SFTPTransferFile{Name: name, Error: err.Error()})
			continue
		}
		destName := name
		if info.IsDir() || !overwrite {
			destName = uniqueDestinationName(used, name, info.IsDir(), target.kind == "local")
		} else if existing, statErr := target.stat(target.join(targetDir, name)); statErr == nil {
			switch {
			case existing.IsDir():
				// A file cannot replace a folder of the same name.
				destName = uniqueDestinationName(used, name, false, target.kind == "local")
			case sameEndpointFile(source, target, info, existing, source.join(sourceDir, name), target.join(targetDir, name)):
				// Never truncate a file by copying it over itself.
				failures = append(failures, SFTPTransferFile{Name: name, Error: "the source and destination are the same file"})
				continue
			}
		}
		used[destinationKey(destName, target.kind == "local")] = true
		srcPath := source.join(sourceDir, name)
		dstPath := target.join(targetDir, destName)

		switch {
		case info.IsDir():
			items = append(items, copyItem{Name: destName, Src: srcPath, Dst: dstPath, IsDir: true})
			added, failed, bytes, files, err := collectTree(
				source, target, srcPath, dstPath, destName, cancel,
			)
			items = append(items, added...)
			failures = append(failures, failed...)
			totalBytes += bytes
			fileCount += files
			if err != nil {
				return items, failures, totalBytes, fileCount, err
			}
		case info.Mode().IsRegular():
			items = append(items, copyItem{Name: destName, Src: srcPath, Dst: dstPath, Size: info.Size(), Mode: info.Mode()})
			totalBytes += info.Size()
			fileCount++
		default:
			failures = append(failures, SFTPTransferFile{Name: name, Error: "not a regular file"})
		}
	}
	return items, failures, totalBytes, fileCount, nil
}

func collectTree(
	source, target *sftpEndpoint,
	sourceDir, targetDir, displayPrefix string,
	cancel *atomic.Bool,
) ([]copyItem, []SFTPTransferFile, int64, int, error) {
	if cancel.Load() {
		return nil, nil, 0, 0, errTransferCancelled
	}
	infos, err := source.readDir(sourceDir)
	if err != nil {
		return nil, []SFTPTransferFile{{Name: displayPrefix, Error: err.Error()}}, 0, 0, nil
	}

	items := make([]copyItem, 0, len(infos))
	failures := make([]SFTPTransferFile, 0)
	var totalBytes int64
	var fileCount int

	for _, info := range infos {
		if cancel.Load() {
			return items, failures, totalBytes, fileCount, errTransferCancelled
		}
		name := info.Name()
		if name == "." || name == ".." {
			continue
		}
		display := path.Join(displayPrefix, name)
		srcPath := source.join(sourceDir, name)
		dstPath := target.join(targetDir, name)
		switch {
		case info.IsDir():
			items = append(items, copyItem{Name: display, Src: srcPath, Dst: dstPath, IsDir: true})
			added, failed, bytes, files, err := collectTree(
				source, target, srcPath, dstPath, display, cancel,
			)
			items = append(items, added...)
			failures = append(failures, failed...)
			totalBytes += bytes
			fileCount += files
			if err != nil {
				return items, failures, totalBytes, fileCount, err
			}
		case info.Mode().IsRegular():
			items = append(items, copyItem{Name: display, Src: srcPath, Dst: dstPath, Size: info.Size(), Mode: info.Mode()})
			totalBytes += info.Size()
			fileCount++
		default:
			failures = append(failures, SFTPTransferFile{Name: display, Error: "symlinks and special files are skipped"})
		}
	}
	return items, failures, totalBytes, fileCount, nil
}

// sameEndpointFile reports whether two endpoint paths refer to the same file.
// This can only happen when both panes browse the same machine and folder.
func sameEndpointFile(source, target *sftpEndpoint, sourceInfo, targetInfo os.FileInfo, srcPath, dstPath string) bool {
	switch {
	case source.kind != target.kind:
		return false
	case source.kind == "local":
		return os.SameFile(sourceInfo, targetInfo)
	case source.session == "" || target.session != source.session:
		return false
	default:
		return path.Clean(srcPath) == path.Clean(dstPath)
	}
}

func existingNames(endpoint *sftpEndpoint, dir string) (map[string]bool, error) {
	infos, err := endpoint.readDir(dir)
	if err != nil {
		return nil, err
	}
	names := make(map[string]bool, len(infos))
	for _, info := range infos {
		names[destinationKey(info.Name(), endpoint.kind == "local")] = true
	}
	return names, nil
}

func destinationKey(name string, foldCase bool) string {
	if foldCase {
		return strings.ToLower(name)
	}
	return name
}

// uniqueDestinationName follows Finder: "photo.png" becomes "photo (1).png",
// while folders get the suffix at the end.
func uniqueDestinationName(used map[string]bool, name string, isDir, foldCase bool) string {
	if !used[destinationKey(name, foldCase)] {
		return name
	}
	base, ext := name, ""
	if !isDir {
		ext = filepath.Ext(name)
		base = strings.TrimSuffix(name, ext)
		// Dotfiles such as ".bashrc" have no stem of their own; keep the whole
		// name intact so the suffix reads ".bashrc (1)" rather than " (1).bashrc".
		if base == "" {
			base, ext = name, ""
		}
	}
	for i := 1; i < 10000; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if !used[destinationKey(candidate, foldCase)] {
			return candidate
		}
	}
	return name + " (copy)"
}

type transferProgressWriter struct {
	w         io.Writer
	onWrite   func(int)
	cancelled *atomic.Bool
}

func (p *transferProgressWriter) Write(data []byte) (int, error) {
	if p.cancelled != nil && p.cancelled.Load() {
		return 0, errTransferCancelled
	}
	n, err := p.w.Write(data)
	if n > 0 && p.onWrite != nil {
		p.onWrite(n)
	}
	return n, err
}

func sshSourceLabel(user, host string, port int) string {
	label := fmt.Sprintf("%s@%s", user, host)
	if port > 0 && port != 22 {
		label += fmt.Sprintf(":%d", port)
	}
	return label
}
