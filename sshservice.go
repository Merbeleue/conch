package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

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

// defaultTermType is what every terminal declares unless the user picks a
// simpler emulation: 256 colours and the full xterm escape vocabulary.
const defaultTermType = "xterm-256color"

// normalizeTermType turns whatever the settings store held into a usable TERM
// value. The name travels to the remote host verbatim, so it is only trimmed —
// hosts with their own terminfo entry should not need a Conch update to use it.
func normalizeTermType(term string) string {
	term = strings.TrimSpace(term)
	if term == "" {
		return defaultTermType
	}
	if len(term) > 64 {
		return defaultTermType
	}
	return term
}

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
	// Term is announced as $TERM in the pty request. Empty means the modern
	// default; a simpler value is for hosts whose terminfo has no xterm entry.
	Term string
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

	// Local shell sessions own a terminal and reap the child via waitDone.
	term     localTerminal
	waitDone chan localExit

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
		return nil, errors.New(tr("host is required", "请输入主机地址"))
	}

	port := req.Port
	if port == 0 {
		port = 22
	}
	if port < 1 || port > 65535 {
		return nil, fmt.Errorf(tr("invalid port %d", "端口 %d 无效"), port)
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
			return nil, errors.New(tr("this connection attempt is already in progress", "该连接请求已在进行中"))
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

	authMethods, cleanups, keyNotes, err := buildAuthMethods(req)
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
		return nil, formatDialError(err, addr, keyNotes...)
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
		return nil, fmt.Errorf(tr("open session: %w", "打开会话失败：%w"), err)
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
	if err := session.RequestPty(normalizeTermType(req.Term), rows, cols, modes); err != nil {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf(tr("request pty: %w", "请求终端失败：%w"), err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf(tr("open stdin: %w", "打开标准输入失败：%w"), err)
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf(tr("open stdout: %w", "打开标准输出失败：%w"), err)
	}

	if err := session.Shell(); err != nil {
		_ = session.Close()
		_ = client.Close()
		cleanup()
		if cancelled() {
			return nil, errConnectCancelled
		}
		return nil, fmt.Errorf(tr("start shell: %w", "启动 shell 失败：%w"), err)
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

// OpenLocal starts the user's login shell on a local terminal — a PTY on
// macOS, a ConPTY on Windows. It shares the SSH session plumbing so the
// frontend treats both kinds of terminal identically. termType becomes the
// shell's TERM, so `tput colors`, prompts and ls colours match what the user
// declared for their remote sessions.
func (s *SSHService) OpenLocal(termType string) (*SessionInfo, error) {
	dir := ""
	if home, err := os.UserHomeDir(); err == nil {
		dir = home
	}
	term, err := startLocalShell(localShellArgv(), dir, 120, 32, normalizeTermType(termType))
	if err != nil {
		return nil, err
	}

	info := &SessionInfo{
		ID:   newSessionID(),
		Kind: "local",
		Host: "local",
		User: defaultUser(),
	}

	waitDone := make(chan localExit, 1)
	go func() {
		waitDone <- term.Wait()
	}()

	sess := &sshSession{
		id:       info.ID,
		term:     term,
		stdin:    term,
		stdout:   term,
		resize:   term.Resize,
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
		return errors.New(tr("session not found", "会话不存在"))
	}
	sess.writeMu.Lock()
	defer sess.writeMu.Unlock()
	_, err := io.WriteString(sess.stdin, data)
	return err
}

func (s *SSHService) Resize(sessionID string, cols int, rows int) error {
	sess := s.lookup(sessionID)
	if sess == nil {
		return errors.New(tr("session not found", "会话不存在"))
	}
	if cols <= 0 || rows <= 0 {
		return nil
	}
	if sess.resize == nil {
		return errors.New(tr("session does not support resizing", "该会话不支持调整大小"))
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
		return nil, errors.New(tr("SFTP is only available for SSH sessions", "SFTP 仅适用于 SSH 会话"))
	}
	sess.sftpMu.Lock()
	defer sess.sftpMu.Unlock()
	if sess.sftpClient != nil {
		return sess.sftpClient, nil
	}
	select {
	case <-sess.done:
		return nil, errors.New(tr("the SSH session is no longer connected", "SSH 会话已断开"))
	default:
	}
	client, err := sftp.NewClient(sess.client)
	if err != nil {
		return nil, fmt.Errorf(tr("start SFTP: %w", "启动 SFTP 失败：%w"), err)
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
	ticker := time.NewTicker(outputFlushInterval)
	defer ticker.Stop()

	// Remote output is coalesced before it crosses the webview bridge: one
	// emit per flush interval instead of one per read keeps `cat` on a big file
	// smooth. Every emit is a script evaluation on the webview's own thread, so
	// the interval is tuned per platform rather than assumed to be free.
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
			if len(pending) >= outputFlushLimit {
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
		exit := <-sess.waitDone
		return exit.Reason, exit.Err
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
		// A local shell keeps running (and can keep the terminal open) unless
		// it is told to stop; on macOS a blocked reader also holds the PTY
		// master, so hang the process group up before closing it.
		if reason == "disconnected" && sess.term != nil {
			sess.term.Terminate()
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

// buildAuthMethods turns the form values into SSH auth methods. The returned
// notes explain every key that could not be used, so a failed handshake can
// tell the user what was actually tried instead of just "authentication failed".
func buildAuthMethods(req ConnectRequest) ([]ssh.AuthMethod, []func(), []string, error) {
	method := strings.ToLower(strings.TrimSpace(req.AuthMethod))
	if method == "" {
		method = "auto"
	}

	var (
		methods  []ssh.AuthMethod
		cleanups []func()
		notes    []string
	)

	useAgent := method == "agent" || method == "auto"
	useKey := method == "key" || method == "auto"
	usePassword := method == "password" || method == "auto"

	if useAgent {
		sock := os.Getenv("SSH_AUTH_SOCK")
		if sock == "" {
			if method == "agent" {
				return nil, nil, nil, errors.New(tr(
					"ssh-agent is not running (SSH_AUTH_SOCK is empty)",
					"ssh-agent 未运行（SSH_AUTH_SOCK 为空）",
				))
			}
		} else {
			conn, err := net.Dial("unix", sock)
			if err != nil {
				if method == "agent" {
					return nil, nil, nil, fmt.Errorf(tr("connect to ssh-agent: %w", "连接 ssh-agent 失败：%w"), err)
				}
			} else {
				cleanups = append(cleanups, func() { _ = conn.Close() })
				agentClient := agent.NewClient(conn)
				if keys, err := agentClient.List(); err == nil && len(keys) == 0 {
					notes = append(notes, tr(
						"ssh-agent is running but holds no keys",
						"ssh-agent 正在运行，但其中没有密钥",
					))
				}
				methods = append(methods, ssh.PublicKeysCallback(agentClient.Signers))
			}
		}
	}

	paths := keyPaths(req.KeyPath)
	if useKey {
		explicit := len(paths) == 1 && strings.TrimSpace(req.KeyPath) != ""
		found := false
		for _, path := range paths {
			keyBytes, err := os.ReadFile(path)
			if err != nil {
				if os.IsNotExist(err) {
					if explicit {
						notes = append(notes, trf("%s does not exist", "%s 不存在", path))
					}
					continue
				}
				notes = append(notes, trf("%s: %s", "%s：%s", path, describeReadError(err)))
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
				notes = append(notes, trf("%s: %s", "%s：%s", path, describeKeyError(err, keyBytes, req.Passphrase != "")))
				continue
			}
			methods = append(methods, ssh.PublicKeys(signer))
		}
		if method == "key" && !found && len(notes) == 0 {
			return nil, nil, nil, fmt.Errorf(tr("no private key found at %s", "在 %s 未找到私钥"), strings.Join(paths, ", "))
		}
		if method == "key" && len(methods) == 0 {
			return nil, nil, nil, errors.New(joinOrNotes(notes, tr(
				"the selected private key could not be used",
				"无法使用所选私钥",
			)))
		}
	}

	if usePassword {
		if req.Password == "" {
			if method == "password" {
				return nil, nil, nil, errors.New(tr("password is required", "请输入密码"))
			}
		} else {
			methods = append(methods, ssh.Password(req.Password))
		}
	}

	if len(methods) == 0 {
		return nil, nil, notes, errors.New(joinOrNotes(notes, tr(
			"no authentication method available: add a key, or enter a password",
			"没有可用的认证方式：请添加密钥或输入密码",
		)))
	}
	return methods, cleanups, notes, nil
}

func joinOrNotes(notes []string, fallback string) string {
	if len(notes) == 0 {
		return fallback
	}
	return strings.Join(notes, "; ")
}

// describeReadError turns a file error into something worth showing in the
// connect panel. macOS refuses apps started from the Dock access to
// ~/Downloads, ~/Desktop and ~/Documents without an explicit grant, and that
// looks exactly like a broken key unless it is named.
func describeReadError(err error) string {
	if errors.Is(err, os.ErrPermission) {
		return tr("permission denied", "没有读取权限") + keyPermissionHint()
	}
	return err.Error()
}

func describeKeyError(err error, keyBytes []byte, gavePassphrase bool) string {
	text := err.Error()
	switch {
	case !gavePassphrase && strings.Contains(text, "passphrase"):
		return tr(
			"is protected by a passphrase — enter it above, or use a key without one",
			"受密码短语保护 — 请在上方输入，或改用无密码短语的密钥",
		)
	case !bytes.Contains(keyBytes, []byte("-----BEGIN")):
		return tr(
			"does not look like a private key — choose the key itself, not the .pub file",
			"看起来不是私钥 — 请选择密钥文件本身，而不是 .pub 文件",
		)
	default:
		return text
	}
}

func hostKeyCallback(addr string, trustNew bool) (ssh.HostKeyCallback, error) {
	path := knownHostsPath()

	var verify ssh.HostKeyCallback
	if _, err := os.Stat(path); err == nil {
		cb, err := knownhosts.New(path)
		if err != nil {
			return nil, fmt.Errorf(tr("read %s: %w", "读取 %s 失败：%w"), path, err)
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

		return fmt.Errorf(tr("host key mismatch for %s: %w", "主机密钥不匹配（%s）：%w"), addr, err)
	}, nil
}

func appendKnownHost(addr string, key ssh.PublicKey) error {
	path := knownHostsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf(tr("create ~/.ssh: %w", "创建 ~/.ssh 失败：%w"), err)
	}

	knownHostsMu.Lock()
	defer knownHostsMu.Unlock()

	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf(tr("open known_hosts: %w", "打开 known_hosts 失败：%w"), err)
	}
	defer file.Close()

	line := knownhosts.Line([]string{knownhosts.Normalize(addr)}, key)
	if _, err := fmt.Fprintln(file, line); err != nil {
		return fmt.Errorf(tr("update known_hosts: %w", "更新 known_hosts 失败：%w"), err)
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
	// A path pasted from a terminal often arrives wrapped in quotes.
	if explicit = strings.Trim(strings.TrimSpace(explicit), `"'`); explicit != "" {
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

// formatDialError turns a low-level dial or handshake failure into something a
// terminal user can act on. `notes` carry why a key was skipped, which is the
// difference between "authentication failed" and a fixable sentence.
func formatDialError(err error, addr string, notes ...string) error {
	msg := err.Error()
	// Host key errors are already user-facing; drop the handshake wrapper.
	if idx := strings.Index(msg, errUnknownHostKey.Error()); idx >= 0 {
		return errors.New(msg[idx:])
	}
	if strings.Contains(msg, "unable to authenticate") {
		if len(notes) > 0 {
			return fmt.Errorf(tr(
				"authentication failed for %s — %s",
				"对 %s 认证失败 — %s",
			), addr, strings.Join(notes, "; "))
		}
		return fmt.Errorf(tr(
			"authentication failed for %s: check your username and credentials",
			"对 %s 认证失败：请检查用户名和登录凭据",
		), addr)
	}
	if strings.Contains(msg, "no supported methods") || strings.Contains(msg, "none no more methods to try") {
		if len(notes) > 0 {
			return fmt.Errorf(tr(
				"the server refused every method for %s — %s",
				"服务器拒绝了 %s 的所有认证方式 — %s",
			), addr, strings.Join(notes, "; "))
		}
	}
	if kind := netErrorHint(msg); kind != "" {
		return fmt.Errorf(tr("connect to %s — %s: %w", "连接 %s 失败 — %s：%w"), addr, kind, err)
	}
	return fmt.Errorf(tr("connect to %s: %w", "连接 %s 失败：%w"), addr, err)
}

// netErrorHint names the network failures a dial produces verbatim from Go, so
// a Chinese screen does not stop at "dial tcp …: i/o timeout". The raw error is
// still appended: the address and errno are what a user pastes into a bug
// report, and the hint is what tells them where to look first.
func netErrorHint(msg string) string {
	switch {
	case strings.Contains(msg, "i/o timeout"), strings.Contains(msg, "operation timed out"):
		return tr("the host did not answer in time", "主机超时未响应，请检查网络或防火墙")
	case strings.Contains(msg, "connection refused"):
		return tr("nothing is listening on that port", "该端口没有服务在监听")
	case strings.Contains(msg, "no such host"), strings.Contains(msg, "server could not be found"):
		return tr("the name could not be resolved", "无法解析该主机名")
	case strings.Contains(msg, "network is unreachable"), strings.Contains(msg, "no route to host"),
		strings.Contains(msg, "network down"):
		return tr("there is no route to the host", "没有到达主机的网络路径")
	case strings.Contains(msg, "connection reset"):
		return tr("the connection was reset", "连接被重置")
	}
	return ""
}
