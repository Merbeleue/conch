import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isWindows } from "./lib/platform";
import { loadSettings } from "./lib/settings";
import { applyTheme } from "./lib/themes";
import "./styles.css";

// The same bundle runs in WKWebView and WebView2, so the shell records which one
// it is on the document before the first paint. styles.css keys the chrome
// measurements off this: macOS hides its title bar and needs room for the
// traffic lights, while Windows keeps the native one and needs none.
document.documentElement.dataset.os = isWindows ? "windows" : "macos";

// Paint the active theme before the first React frame to avoid a flash of the
// default palette on launch. The SFTP manager is a view inside this window now,
// so it inherits the same theme without needing a query string.
applyTheme(loadSettings().theme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
