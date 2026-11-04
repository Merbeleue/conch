// The same bundle ships to macOS and Windows, and the webview tells us which
// one it is: WKWebView reports "Mac OS X", WebView2 reports "Windows NT".
// Anything the user sees that is specific to the host OS goes through here.
const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const isWindows = /Windows NT|Win64|i686/i.test(userAgent);

export const osName = isWindows ? "Windows" : "macOS";

/** The key drawn in shortcut hints: ⌘ on a Mac, Ctrl on Windows. */
export const modKey = isWindows ? "Ctrl" : "⌘";

/** Shift plus the modifier, in the order each OS writes it. */
export const shiftModKey = isWindows ? "Shift+Ctrl" : "⇧⌘";

/** What the local side of the file manager is called. */
export const localMachineLabel = isWindows ? "This PC" : "This Mac";

/** Where a deleted local file goes, and the app you restore it from. */
export const trashName = isWindows ? "Recycle Bin" : "Trash";

export const fileManagerLabel = isWindows ? "File Explorer" : "Finder";

/**
 * The prompt drawn in front of the settings font preview, in the style of this
 * machine's own shell.
 */
export const promptSample = isWindows ? "PS C:\\Users\\you>" : "you@mac:~$";

/**
 * Join a folder and an entry name the way the backend's filepath.Join would,
 * so a Windows drive root does not turn into "C:\Users\someone/Downloads".
 */
export function childPath(dir: string, name: string): string {
  if (!dir) {
    return `/${name}`;
  }
  // "C:\" and "C:" are roots too, not just "/".
  if (/^[A-Za-z]:\\?$/.test(dir)) {
    return `${dir.endsWith("\\") ? dir : `${dir}\\`}${name}`;
  }
  if (dir.includes("\\") && !dir.includes("/")) {
    return `${dir.replace(/\\+$/, "")}\\${name}`;
  }
  if (dir === "/") {
    return `/${name}`;
  }
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

// Win32 still refuses these as file names, with or without an extension.
const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** True when a name cannot be stored on a Windows volume. */
export function windowsNameProblem(name: string): boolean {
  return /[<>:"\\|?*]/.test(name) || windowsReserved.test(name) || /[. ]$/.test(name);
}
