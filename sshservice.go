package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

var (
	errUnknownHostKey   = errors.New("the host key is not trusted yet")
	errConnectCancelled = errors.New("connection cancelled")
	knownHostsMu        sync.Mutex
)

type ConnectRequest struct {
	// RequestID lets the UI cancel an in-flight connection attempt.
	RequestID       string
	Host            string
	Port            int
	User            string
	AuthMethod      string
	Password        string
	KeyPath         string
	Passphrase      string
	Cols            int
	Rows            int
	TrustNewHostKey bool
}

type SessionInfo struct {
	ID   string
	Kind string
	Host string
	User string
	Port int
}

type SSHOutputEvent struct {
	SessionID string
	Data      string
}

type SSHExitEvent struct {
	SessionID string
	Reason    string
	Error     string
}

type sshSession struct {
	id       string
	host     string
	user     string
	port     int
	client   *ssh.Client
	session  *ssh.Session
	stdin    io.WriteCloser
	stdout   io.Reader
	resize   func(cols, rows int) error
	cleanups []func()

	// Local shell sessions own a PTY and reap the child via waitDone.
	pty      *os.File
	cmd      *exec.Cmd
	waitDone chan error

	done      chan struct{}
	closeOnce sync.Once
	writeMu   sync.Mutex

	// SFTP uses its own subsystem channel on the same SSH connection. The
	// client is opened on the first transfer and shared by later uploads.
	sftpMu     sync.Mutex
	sftpClient *sftp.Client
}

type SSHService struct {
	mu       sync.Mutex
	sessions map[string]*sshSession
	pending  map[string]*pendingConnect
}

// sshSessionRef is a snapshot of a live session for the SFTP source picker.
type sshSessionRef struct {
	id   string
	host string
	user string
	port int
}

// pendingConnect is an attempt that has not produced a session yet. It owns
// the raw socket and client early enough for CancelConnect to tear them down.
type pendingConnect struct {
	cancel context.CancelFunc

	mu        sync.Mutex
	conn      net.Conn
	client    *ssh.Client
	cancelled bool
	committed bool
}

func NewSSHService() *SSHService {
	return &SSHService{
		sessions: make(map[string]*sshSession),
		pending:  make(map[string]*pendingConnect),
	}
}

func (s *SSHService) Connect(req ConnectRequest) (*SessionInfo, error) {
	host := strings.TrimSpace(req.Host)
	if host == "" {
		return nil, errors.New("host is required")
	}

	port := req.Port
	if port == 0 {
		port = 22
	}
	if port < 1 || port > 65535 {
		return nil, fmt.Errorf("invalid port %d", port)
	}

	username := strings.TrimSpace(req.User)
	if username == "" {
		username = defaultUser()
	}

	addr := net.JoinHostPort(host, strconv.Itoa(port))

	requestID := strings.TrimSpace(req.RequestID)
	ctx := context.Background()
	var pending *pendingConnect
	if requestID != "" {
		var cancel context.CancelFunc
		ctx, cancel = context.WithCancel(ctx)
		pending = &pendingConnect{cancel: cancel}

		s.mu.Lock()
		if _, exists := s.pending[requestID]; exists {
			s.mu.Unlock()
			cancel()
			return nil, errors.New("this connection attempt is already in progress")
		}
		s.pending[requestID] = pending
		s.mu.Unlock()

		defer func() {
			cancel()
			s.removePending(requestID, pending)
		}()
	}

	cancelled := func() bool {
		if ctx.Err() != nil {
			return true
		}
		return pending != nil && pending.isCancelled()
	}

	authMethods, cleanups, err := buildAuthMethods(req)
	if err != nil {
		return nil, err
	}
	cleanup := func() {
		for _, fn := range cleanups {
			fn()
		}
	}
	if cancelled() {
		cleanup()
		return nil, errConnectCancelled
	}

	hostKeyCallback, err := hostKeyCallback(addr, req.TrustNewHostKey)
	if err != nil {
		cleanup()
		return nil, err
	}

	cfg := &ssh.ClientConfig{
		User:            username,
		Auth:            authMethods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         15 * time.Second,
	}

	dialer := &net.Dialer{Timeout: 15 * time.Second}
	rawConn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, formatDialError(err, addr)
	}
	if pending != nil && !pending.attachConn(rawConn) {
		_ = rawConn.Close()
		cleanup()
		return nil, errConnectCancelled
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(rawConn, addr, cfg)
	if err != nil {
		_ = rawConn.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, formatDialError(err, addr)
	}
	client := ssh.NewClient(sshConn, chans, reqs)
	if pending != nil && !pending.attachClient(client) {
		_ = client.Close()
		cleanup()
		return nil, errConnectCancelled
	}

	session, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf("open session: %w", err)
	}

	cols, rows := req.Cols, req.Rows
	if cols <= 0 {
		cols = 120
	}
	if rows <= 0 {
		rows = 32
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf("request pty: %w", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf("open stdin: %w", err)
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf("open stdout: %w", err)
	}

	if err := session.Shell(); err != nil {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf("start shell: %w", err)
	}

	// Once committed, a late cancel must not tear down the live session.
	if pending != nil && !pending.commit() {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		return nil, errConnectCancelled
	}

	info := &SessionInfo{
		ID:   newSessionID(),
		Kind: "ssh",
		Host: host,
		User: username,
		Port: port,
	}

	sess := &sshSession{
		id:      info.ID,
		host:    host,
		user:    username,
		port:    port,
		client:  client,
		session: session,
		stdin:   stdin,
		stdout:  stdout,
		resize: func(cols, rows int) error {
			return session.WindowChange(rows, cols)
		},
		cleanups: cleanups,
		done:     make(chan struct{}),
	}

	s.mu.Lock()
	s.sessions[sess.id] = sess
	s.mu.Unlock()

	go s.pump(sess)

	return info, nil
}

// CancelConnect aborts an attempt that has not produced a session yet.
func (s *SSHService) CancelConnect(requestID string) {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return
	}
	s.mu.Lock()
	pending := s.pending[requestID]
	s.mu.Unlock()
	if pending != nil {
		pending.abort()
	}
}

func (s *SSHService) removePending(requestID string, pending *pendingConnect) {
	s.mu.Lock()
	if s.pending[requestID] == pending {
		delete(s.pending, requestID)
	}
	s.mu.Unlock()
}

func (p *pendingConnect) attachConn(conn net.Conn) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cancelled {
		return false
	}
	p.conn = conn
	return true
}

func (p *pendingConnect) attachClient(client *ssh.Client) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cancelled {
		return false
	}
	p.client = client
	return true
}

func (p *pendingConnect) isCancelled() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.cancelled
}

func (p *pendingConnect) commit() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cancelled {
		return false
	}
	p.committed = true
	p.conn = nil
	p.client = nil
	return true
}

func (p *pendingConnect) abort() {
	p.mu.Lock()
	if p.cancelled || p.committed {
		p.mu.Unlock()
		return
	}
	p.cancelled = true
	conn := p.conn
	client := p.client
	p.conn = nil
	p.client = nil
	p.mu.Unlock()

	// Cancel the dial context and unblock an in-progress handshake or channel
	// open. Closing both is safe: the client owns the connection.
	p.cancel()
	if client != nil {
		_ = client.Close()
	}
	if conn != nil {
		_ = conn.Close()
	}
}

// OpenLocal starts the user's login shell on a local PTY. It shares the SSH
// session plumbing so the frontend treats both kinds of terminal identically.
func (s *SSHService) OpenLocal() (*SessionInfo, error) {
	cmd := exec.Command(localShell(), "-l")
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	if home, err := os.UserHomeDir(); err == nil {
		cmd.Dir = home
	}

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: 120, Rows: 32})
	if err != nil {
		return nil, fmt.Errorf("start local shell: %w", err)
	}

	info := &SessionInfo{
		ID:   newSessionID(),
		Kind: "local",
		Host: "local",
		User: defaultUser(),
	}

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- cmd.Wait()
	}()

	sess := &sshSession{
		id:     info.ID,
		pty:    ptmx,
		cmd:    cmd,
		stdin:  ptmx,
		stdout: ptmx,
		resize: func(cols, rows int) error {
			return pty.Setsize(ptmx, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
		},
		waitDone: waitDone,
		done:     make(chan struct{}),
	}

	s.mu.Lock()
	s.sessions[sess.id] = sess
	s.mu.Unlock()

	go s.pump(sess)

	return info, nil
}

func (s *SSHService) Write(sessionID string, data string) error {
	sess := s.lookup(sessionID)
	if sess == nil {
		return errors.New("session not found")
	}
	sess.writeMu.Lock()
	defer sess.writeMu.Unlock()
	_, err := io.WriteString(sess.stdin, data)
	return err
}

func (s *SSHService) Resize(sessionID string, cols int, rows int) error {
	sess := s.lookup(sessionID)
	if sess == nil {
		return errors.New("session not found")
	}
	if cols <= 0 || rows <= 0 {
		return nil
	}
	if sess.resize == nil {
		return errors.New("session does not support resizing")
	}
	return sess.resize(cols, rows)
}

func (s *SSHService) Disconnect(sessionID string) {
	if sess := s.lookup(sessionID); sess != nil {
		s.finish(sess, "disconnected", nil)
	}
}

func (s *SSHService) lookup(sessionID string) *sshSession {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessions[sessionID]
}

func (s *SSHService) liveSSHSessions() []sshSessionRef {
	s.mu.Lock()
	defer s.mu.Unlock()
	refs := make([]sshSessionRef, 0, len(s.sessions))
	for _, sess := range s.sessions {
		if sess.client == nil {
			continue
		}
		refs = append(refs, sshSessionRef{
			id:   sess.id,
			host: sess.host,
			user: sess.user,
			port: sess.port,
		})
	}
	return refs
}

// sftpFor lazily opens and then reuses one SFTP subsystem channel on the
// session's SSH connection.
func (s *SSHService) sftpFor(sess *sshSession) (*sftp.Client, error) {
	if sess.client == nil {
		return nil, errors.New("SFTP is only available for SSH sessions")
	}
	sess.sftpMu.Lock()
	defer sess.sftpMu.Unlock()
	if sess.sftpClient != nil {
		return sess.sftpClient, nil
	}
	select {
	case <-sess.done:
		return nil, errors.New("the SSH session is no longer connected")
	default:
	}
	client, err := sftp.NewClient(sess.client)
	if err != nil {
		return nil, fmt.Errorf("start SFTP: %w", err)
	}
	sess.sftpClient = client
	return client, nil
}

func (s *SSHService) pump(sess *sshSession) {
	chunks := make(chan []byte, 128)
	readDone := make(chan struct{})

	go func() {
		defer close(readDone)
		buf := make([]byte, 32*1024)
		for {
			n, err := sess.stdout.Read(buf)
			if n > 0 {
				chunk := make([]byte, n)
				copy(chunk, buf[:n])
				select {
				case chunks <- chunk:
				case <-sess.done:
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	app := application.Get()
	ticker := time.NewTicker(8 * time.Millisecond)
	defer ticker.Stop()

	// Remote output is coalesced before it crosses the webview bridge: one
	// emit per ~8ms instead of one per read keeps `cat` on a big file smooth.
	var pending []byte
	flush := func() {
		if len(pending) == 0 {
			return
		}
		if app != nil {
			app.Event.Emit("ssh:output", SSHOutputEvent{
				SessionID: sess.id,
				Data:      base64.StdEncoding.EncodeToString(pending),
			})
		}
		pending = pending[:0]
	}

	for {
		select {
		case <-sess.done:
			return
		case chunk := <-chunks:
			pending = append(pending, chunk...)
			if len(pending) >= 64*1024 {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-readDone:
			for {
				select {
				case chunk := <-chunks:
					pending = append(pending, chunk...)
					continue
				default:
				}
				break
			}
			flush()

			reason, waitErr := waitForSession(sess)
			s.finish(sess, reason, waitErr)
			return
		}
	}
}

func waitForSession(sess *sshSession) (string, error) {
	if sess.waitDone != nil {
		waitErr := <-sess.waitDone
		reason := "exited"
		var exitErr *exec.ExitError
		if errors.As(waitErr, &exitErr) {
			if status, ok := exitErr.Sys().(syscall.WaitStatus); ok && status.Signaled() {
				reason = "signal " + status.Signal().String()
			} else {
				reason = fmt.Sprintf("exit %d", exitErr.ExitCode())
			}
			waitErr = nil
		}
		return reason, waitErr
	}

	waitErr := sess.session.Wait()
	reason := "closed"
	var exitErr *ssh.ExitError
	if errors.As(waitErr, &exitErr) {
		reason = fmt.Sprintf("exit %d", exitErr.ExitStatus())
		waitErr = nil
	}
	// Some servers close a shell channel without sending an exit status; that
	// is a normal disconnect, not a failure.
	var missingErr *ssh.ExitMissingError
	if errors.As(waitErr, &missingErr) || errors.Is(waitErr, io.EOF) {
		waitErr = nil
	}
	return reason, waitErr
}

func (s *SSHService) finish(sess *sshSession, reason string, err error) {
	closed := false
	sess.closeOnce.Do(func() {
		closed = true
		close(sess.done)
		// On macOS a blocked reader can keep the PTY master open after Close,
		// so hang up the local shell's process group first.
		if reason == "disconnected" && sess.pty != nil && sess.cmd != nil && sess.cmd.Process != nil {
			_ = syscall.Kill(-sess.cmd.Process.Pid, syscall.SIGHUP)
		}
		_ = sess.stdin.Close()
		sess.sftpMu.Lock()
		if sess.sftpClient != nil {
			_ = sess.sftpClient.Close()
			sess.sftpClient = nil
		}
		sess.sftpMu.Unlock()
		if sess.client != nil {
			_ = sess.client.Close()
		}
		for _, fn := range sess.cleanups {
			fn()
		}
		s.mu.Lock()
		delete(s.sessions, sess.id)
		s.mu.Unlock()
	})
	if !closed {
		return
	}

	msg := ""
	if err != nil {
		msg = err.Error()
	}
	if app := application.Get(); app != nil {
		app.Event.Emit("ssh:exit", SSHExitEvent{
			SessionID: sess.id,
			Reason:    reason,
			Error:     msg,
		})
	}
}

func buildAuthMethods(req ConnectRequest) ([]ssh.AuthMethod, []func(), error) {
	method := strings.ToLower(strings.TrimSpace(req.AuthMethod))
	if method == "" {
		method = "auto"
	}

	var (
		methods  []ssh.AuthMethod
		cleanups []func()
	)

	useAgent := method == "agent" || method == "auto"
	useKey := method == "key" || method == "auto"
	usePassword := method == "password" || method == "auto"

	if useAgent {
		sock := os.Getenv("SSH_AUTH_SOCK")
		if sock == "" {
			if method == "agent" {
				return nil, nil, errors.New("ssh-agent is not running (SSH_AUTH_SOCK is empty)")
			}
		} else {
			conn, err := net.Dial("unix", sock)
			if err != nil {
				if method == "agent" {
					return nil, nil, fmt.Errorf("connect to ssh-agent: %w", err)
				}
			} else {
				cleanups = append(cleanups, func() { _ = conn.Close() })
				agentClient := agent.NewClient(conn)
				methods = append(methods, ssh.PublicKeysCallback(agentClient.Signers))
			}
		}
	}

	if useKey {
		var keyErrors []string
		found := false
		for _, path := range keyPaths(req.KeyPath) {
			keyBytes, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			found = true

			var signer ssh.Signer
			if req.Passphrase != "" {
				signer, err = ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(req.Passphrase))
			} else {
				signer, err = ssh.ParsePrivateKey(keyBytes)
			}
			if err != nil {
				keyErrors = append(keyErrors, fmt.Sprintf("%s: %v", path, err))
				continue
			}
			methods = append(methods, ssh.PublicKeys(signer))
		}
		if len(keyErrors) > 0 && method == "key" && len(methods) == 0 {
			return nil, nil, errors.New(strings.Join(keyErrors, "; "))
		}
		if method == "key" && !found {
			return nil, nil, fmt.Errorf("no private key found at %s", strings.Join(keyPaths(req.KeyPath), ", "))
		}
	}

	if usePassword {
		if req.Password == "" {
			if method == "password" {
				return nil, nil, errors.New("password is required")
			}
		} else {
			methods = append(methods, ssh.Password(req.Password))
		}
	}

	if len(methods) == 0 {
		return nil, nil, errors.New("no authentication method available: start ssh-agent, add a key, or enter a password")
	}
	return methods, cleanups, nil
}

func hostKeyCallback(addr string, trustNew bool) (ssh.HostKeyCallback, error) {
	path := knownHostsPath()

	var verify ssh.HostKeyCallback
	if _, err := os.Stat(path); err == nil {
		cb, err := knownhosts.New(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}
		verify = cb
	} else {
		verify = func(string, net.Addr, ssh.PublicKey) error {
			return &knownhosts.KeyError{}
		}
	}

	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		err := verify(hostname, remote, key)
		if err == nil {
			return nil
		}

		var keyErr *knownhosts.KeyError
		if errors.As(err, &keyErr) && len(keyErr.Want) == 0 {
			if !trustNew {
				return fmt.Errorf("%w: %s has fingerprint %s — accept it to save the key to %s",
					errUnknownHostKey, addr, ssh.FingerprintSHA256(key), path)
			}
			return appendKnownHost(addr, key)
		}

		return fmt.Errorf("host key mismatch for %s: %w", addr, err)
	}, nil
}

func appendKnownHost(addr string, key ssh.PublicKey) error {
	path := knownHostsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create ~/.ssh: %w", err)
	}

	knownHostsMu.Lock()
	defer knownHostsMu.Unlock()

	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("open known_hosts: %w", err)
	}
	defer file.Close()

	line := knownhosts.Line([]string{knownhosts.Normalize(addr)}, key)
	if _, err := fmt.Fprintln(file, line); err != nil {
		return fmt.Errorf("update known_hosts: %w", err)
	}
	return nil
}

func knownHostsPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".ssh/known_hosts"
	}
	return filepath.Join(home, ".ssh", "known_hosts")
}

func keyPaths(explicit string) []string {
	if explicit = strings.TrimSpace(explicit); explicit != "" {
		return []string{expandHome(explicit)}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	return []string{
		filepath.Join(home, ".ssh", "id_ed25519"),
		filepath.Join(home, ".ssh", "id_ecdsa"),
		filepath.Join(home, ".ssh", "id_rsa"),
	}
}

func expandHome(path string) string {
	if path == "~" || strings.HasPrefix(path, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, strings.TrimPrefix(path, "~"))
		}
	}
	return path
}

func localShell() string {
	for _, candidate := range []string{os.Getenv("SHELL"), "/bin/zsh", "/bin/bash", "/bin/sh"} {
		if !filepath.IsAbs(candidate) {
			continue
		}
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && info.Mode()&0o111 != 0 {
			return candidate
		}
	}
	return "/bin/sh"
}

func defaultUser() string {
	if u, err := user.Current(); err == nil && u.Username != "" {
		return u.Username
	}
	if u := os.Getenv("USER"); u != "" {
		return u
	}
	return "root"
}

func newSessionID() string {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(buf)
}

func formatDialError(err error, addr string) error {
	msg := err.Error()
	// Host key errors are already user-facing; drop the handshake wrapper.
	if idx := strings.Index(msg, errUnknownHostKey.Error()); idx >= 0 {
		return errors.New(msg[idx:])
	}
	if strings.Contains(msg, "unable to authenticate") {
		return fmt.Errorf("authentication failed for %s: check your username and credentials", addr)
	}
	return fmt.Errorf("connect to %s: %w", addr, err)
}
