import {
  app,
  BrowserWindow,
  Menu,
  shell,
  session,
  ipcMain,
  type MenuItemConstructorOptions,
} from "electron";
import log from "electron-log";
import path from "node:path";
import fs from "node:fs";
import { DataStore } from "./store/data-store";
import { resolveDataDir } from "./store/paths";
import { registerProjectHandlers } from "./ipc/projects";
import { registerModuleHandlers } from "./ipc/modules";
import { registerContextHandlers } from "./ipc/context";
import { registerMcpServerHandlers } from "./ipc/mcp-server";
import { registerSettingsHandlers } from "./ipc/settings";
import { registerDialogHandlers } from "./ipc/dialog";
import { registerGitHandlers } from "./ipc/git";

// Configure logging
log.transports.file.level = "info";

const isDev = !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:3100";

let mainWindow: BrowserWindow | null = null;

// ─── Single Instance Lock ────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Core IPC Handlers ───────────────────────────────────────────────
function registerCoreHandlers(dataDir: string): void {
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-data-path", () => dataDir);

  ipcMain.on("update:install", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { autoUpdater } = require("electron-updater");
    autoUpdater.quitAndInstall();
  });
}

// ─── Auto-Updater (lazy-loaded to avoid crash before app.whenReady) ──
function setupAutoUpdater(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require("electron-updater");
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info: unknown) => {
    log.info("Update available:", info);
    mainWindow?.webContents.send("update:available", info);
  });

  autoUpdater.on("update-downloaded", (info: unknown) => {
    log.info("Update downloaded:", info);
    mainWindow?.webContents.send("update:downloaded", info);
  });

  autoUpdater.on("error", (error: unknown) => {
    log.error("Auto-update error:", error);
  });

  autoUpdater.checkForUpdatesAndNotify();
}

// ─── Window Creation ─────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Open Context",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"));
  }

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isDev && url.startsWith(DEV_SERVER_URL)) return;
    const parsed = new URL(url);
    if (parsed.protocol === "file:") return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Content Security Policy ─────────────────────────────────────────
function setContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' ws://localhost:* http://localhost:*",
          "img-src 'self' data:",
          "font-src 'self' data:",
        ].join("; ")
      : [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self' data:",
          "connect-src 'self' https://github.com https://api.github.com",
        ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

// ─── Menu ────────────────────────────────────────────────────────────
function createMenu(): void {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Data Migration ─────────────────────────────────────────────────
/**
 * Migrate data from old "Context Explorer" directory to new "Open Context" location.
 * Runs once — if old dir exists and new dir doesn't, moves it over.
 */
function migrateOldDataDir(newUserDataPath: string): void {
  // Handle both production ("Open Context" → "Context Explorer")
  // and dev mode ("open-context" → "context-explorer")
  const oldNames = [
    newUserDataPath.replace(/Open Context$/, "Context Explorer"),
    newUserDataPath.replace(/open-context$/, "context-explorer"),
  ];

  const newDataDir = path.join(newUserDataPath, "data");

  // Check if new data dir already has real content (projects-index with entries)
  try {
    const indexPath = path.join(newDataDir, "projects-index.json");
    if (fs.existsSync(indexPath)) {
      const content = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      if (Array.isArray(content.projects) && content.projects.length > 0) {
        return; // new location already has projects
      }
    }
  } catch { /* continue with migration */ }

  for (const oldName of oldNames) {
    if (oldName === newUserDataPath) continue;
    const oldDataDir = path.join(oldName, "data");

    try {
      if (!fs.existsSync(oldDataDir)) continue;

      // Copy contents from old to new (don't rename — old Electron may still reference it)
      const entries = fs.readdirSync(oldDataDir);
      fs.mkdirSync(newDataDir, { recursive: true });
      for (const entry of entries) {
        const src = path.join(oldDataDir, entry);
        const dest = path.join(newDataDir, entry);
        fs.cpSync(src, dest, { recursive: true, force: true });
      }
      log.info(`[migration] Copied data from "${oldDataDir}" to "${newDataDir}"`);
      return;
    } catch (err) {
      log.warn("[migration] Failed to migrate old data directory:", err);
    }
  }
}

// ─── App Lifecycle ───────────────────────────────────────────────────
app.whenReady().then(() => {
  const userDataPath = app.getPath("userData");
  migrateOldDataDir(userDataPath);
  const dataDir = resolveDataDir(userDataPath);
  const store = new DataStore(dataDir);
  const getMainWindow = () => mainWindow;

  // Forward store change events to renderer (debounced per project)
  const pendingNotifications = new Map<string, ReturnType<typeof setTimeout>>();
  store.on("project-changed", (projectId: string) => {
    const existing = pendingNotifications.get(projectId);
    if (existing) clearTimeout(existing);
    pendingNotifications.set(
      projectId,
      setTimeout(() => {
        pendingNotifications.delete(projectId);
        mainWindow?.webContents.send("store:project-changed", projectId);
      }, 300)
    );
  });

  // Register all IPC handlers
  setContentSecurityPolicy();
  registerCoreHandlers(dataDir);
  registerProjectHandlers(store);
  registerModuleHandlers(store);
  registerContextHandlers(store, getMainWindow);
  registerMcpServerHandlers(dataDir, store);
  registerSettingsHandlers(store);
  registerDialogHandlers();
  registerGitHandlers(store);

  createMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (!isDev) {
    setupAutoUpdater();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
});
