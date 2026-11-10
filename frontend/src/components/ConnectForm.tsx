import { useState, type FormEvent } from "react";
import { FileService } from "../../bindings/conch";
import type { ThemeId } from "../lib/themes";
import type { ConnectRequest, SavedHost } from "../types";
import { GroupCombobox } from "./GroupCombobox";
import { ThemeSelect } from "./ThemePicker";
import { osName } from "../lib/platform";
import { useI18n, type MessageKey } from "../lib/i18n";

interface ConnectFormProps {
  initial: SavedHost | null;
  editing: boolean;
  connecting: boolean;
  error: string | null;
  groups: string[];
  globalTheme: ThemeId;
  onConnect: (request: ConnectRequest) => void;
  onSave: (request: ConnectRequest) => void;
}

const AUTH_METHODS: Array<{
  id: ConnectRequest["AuthMethod"];
  label: MessageKey;
  hint: MessageKey;
}> = [
  { id: "password", label: "Password", hint: "Sign in with the account password." },
  { id: "key", label: "Private key", hint: "Sign in with an SSH key on this Mac." },
];

export function ConnectForm({
  initial,
  editing,
  connecting,
  error,
  groups,
  globalTheme,
  onConnect,
  onSave,
}: ConnectFormProps) {
  const { t } = useI18n();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [group, setGroup] = useState(initial?.group ?? "");
  const [host, setHost] = useState(initial?.host ?? "");
  // 22 is shown as a grey hint rather than typed text, so an empty field and a
  // saved default look the same — and leaving it blank still connects to 22.
  const [port, setPort] = useState(
    initial?.port && initial.port !== 22 ? String(initial.port) : "",
  );
  const [username, setUsername] = useState(initial?.user ?? "");
  const [theme, setTheme] = useState<ThemeId | "">(initial?.theme ?? "");
  // Agent auth is no longer offered; legacy agent hosts fall back to a key.
  const [authMethod, setAuthMethod] = useState<ConnectRequest["AuthMethod"]>(
    initial?.authMethod === "password" ? "password" : "key",
  );
  const [password, setPassword] = useState(initial?.password ?? "");
  const [keyPath, setKeyPath] = useState(initial?.keyPath || "~/.ssh/id_ed25519");
  const [passphrase, setPassphrase] = useState(initial?.passphrase ?? "");
  const [savePassphrase, setSavePassphrase] = useState(
    initial?.authMethod === "key" && Boolean(initial?.passphrase),
  );
  const [pickingKey, setPickingKey] = useState(false);
  const [savePassword, setSavePassword] = useState(
    initial?.authMethod === "password" && Boolean(initial?.password),
  );

  const pickKeyFile = async () => {
    if (pickingKey) {
      return;
    }
    setPickingKey(true);
    try {
      const picked = await FileService.PickKeyFile();
      const path = typeof picked === "string" ? picked.trim() : "";
      if (path) {
        setKeyPath(path);
      }
    } catch {
      // A dismissed or unavailable dialog leaves the typed path untouched.
    } finally {
      setPickingKey(false);
    }
  };

  // Match an existing group regardless of casing; otherwise the typed name
  // becomes a new group when the host is saved.
  const resolveGroup = (raw: string): string => {
    const name = raw.trim();
    if (!name) {
      return "";
    }
    return groups.find((item) => item.toLowerCase() === name.toLowerCase()) ?? name;
  };

  const buildRequest = (): ConnectRequest | null => {
    const trimmedHost = host.trim();
    if (!trimmedHost) {
      return null;
    }

    const parsedPort = Number.parseInt(port, 10);
    return {
      RequestID: "",
      Host: trimmedHost,
      Port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 22,
      User: username.trim(),
      AuthMethod: authMethod,
      Password: authMethod === "password" ? password : "",
      KeyPath: authMethod === "key" ? keyPath.trim() : "",
      Passphrase: authMethod === "key" ? passphrase : "",
      Cols: 120,
      Rows: 32,
      TrustNewHostKey: false,
      // Filled in from the emulation setting at connect time.
      Term: "",
      RememberPassword: authMethod === "password" && savePassword,
      RememberPassphrase: authMethod === "key" && savePassphrase,
      Label: label.trim(),
      Group: resolveGroup(group),
      Theme: theme,
    };
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = buildRequest();
    if (!request || connecting) {
      return;
    }
    onConnect(request);
  };

  const save = () => {
    const request = buildRequest();
    if (!request || connecting) {
      return;
    }
    onSave(request);
    // Reflect the stored spelling when a typed name matched a group by case.
    setGroup(request.Group);
  };

  return (
    <div className="connect-view">
      <div className="connect-grip" aria-hidden="true" />

      <div className="connect-card">
        <header className="connect-head">
          <p className="eyebrow">
            {editing ? t("Saved host") : t("New session")}
          </p>
          <h2>{editing ? t("Edit host info") : t("Connect to a host")}</h2>
          <p className="sub">
            {editing
              ? t("Save your changes without connecting, or connect with the updated details.")
              : t("SSH over TCP with a private key or password.")}
          </p>
        </header>

        <form onSubmit={submit} className="connect-form">
          <div className="field-row">
            <label className="field grow">
              <span>
                {t("Label")} <span className="field-optional">{t("optional")}</span>
              </span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t("Production, db-01…")}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <div className="field grow">
              <span>
                {t("Group")} <span className="field-optional">{t("optional")}</span>
              </span>
              <GroupCombobox groups={groups} value={group} onChange={setGroup} />
            </div>
          </div>

          <div className="field-row">
            <label className="field grow">
              <span>{t("Host")}</span>
              <input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder={t("example.com or 192.168.1.10")}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
              />
            </label>
            <label className="field port">
              <span>{t("Port")}</span>
              <input
                value={port}
                onChange={(event) => setPort(event.target.value)}
                placeholder="22"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>

          <label className="field">
            <span>{t("Username")}</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t("Defaults to your {os} user", { os: osName })}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>

          <div className="theme-field">
            <span className="field-label">
              {t("Theme")} <span className="field-optional">{t("host override")}</span>
            </span>
            <ThemeSelect value={theme} globalTheme={globalTheme} onChange={setTheme} />
          </div>

          <div className="auth-block">
            <span className="field-label">{t("Authentication")}</span>
            <div className="segmented" role="tablist" aria-label={t("Authentication method")}>
              {AUTH_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  role="tab"
                  title={t(method.hint)}
                  aria-selected={authMethod === method.id}
                  className={authMethod === method.id ? "segment is-active" : "segment"}
                  onClick={() => setAuthMethod(method.id)}
                >
                  {t(method.label)}
                </button>
              ))}
            </div>

            <div className="auth-panel" key={authMethod}>
              {authMethod === "key" && (
                <>
                  <div className="field">
                    <span>{t("Key file")}</span>
                    <div className="field-picker">
                      <input
                        value={keyPath}
                        aria-label={t("Private key path")}
                        onChange={(event) => setKeyPath(event.target.value)}
                        placeholder="~/.ssh/id_ed25519"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="field-picker-button"
                        onClick={() => void pickKeyFile()}
                        disabled={pickingKey}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h4l2 2.4h9A1.5 1.5 0 0 1 21 10.9v7.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
                        </svg>
                        {pickingKey ? t("Choosing…") : t("Choose file")}
                      </button>
                    </div>
                  </div>
                  <label className="field">
                    <span>{t("Passphrase")}</span>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      placeholder={t("Only if the key is encrypted")}
                      autoComplete="off"
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={savePassphrase}
                      onChange={(event) => setSavePassphrase(event.target.checked)}
                    />
                    <span>
                      {t("Save passphrase")}
                      <span className="check-hint">
                        {t("Needed for an encrypted key to connect from the sidebar")}
                      </span>
                    </span>
                  </label>
                </>
              )}

              {authMethod === "password" && (
                <>
                  <label className="field">
                    <span>{t("Password")}</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t("Required for password auth")}
                      autoComplete="off"
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={savePassword}
                      onChange={(event) => setSavePassword(event.target.checked)}
                    />
                    <span>
                      {t("Save password")}
                      <span className="check-hint">{t("Stored in Conch and used automatically next time")}</span>
                    </span>
                  </label>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="alert" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="13" />
                <line x1="12" y1="16.5" x2="12" y2="16.6" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="connect-actions">
            <button
              type="button"
              className="primary save-button"
              onClick={save}
              disabled={!host.trim() || connecting}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 3h11l3 3v15H5z" />
                <path d="M8 3v6h8V3M8 21v-7h8v7" />
              </svg>
              {editing ? t("Save changes") : t("Save")}
            </button>
            <button type="submit" className="primary" disabled={!host.trim() || connecting}>
              {connecting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {t("Connecting")}
                </>
              ) : (
                <>
                  {t("Connect")}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
