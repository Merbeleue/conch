import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadSettings } from "./lib/settings";
import { applyTheme } from "./lib/themes";
import "./styles.css";

// Paint the active theme before the first React frame to avoid a flash of the
// default palette on launch. The SFTP manager is a view inside this window now,
// so it inherits the same theme without needing a query string.
applyTheme(loadSettings().theme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
