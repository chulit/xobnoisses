import { app, BrowserWindow, dialog, ipcMain, session, WebContentsView } from "electron";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  cookieToSetDetails,
  cookiesForHost,
  hostOf,
  nextColor,
  normalizeInputUrl,
  partitionFor,
  type AppState,
  type SiteSession,
  type TabInfo,
} from "../shared/model.js";
import { loadSessions, loadTabs, saveSessions, saveTabs } from "./store.js";

const START_PAGE = pathToFileURL(join(__dirname, "..", "renderer", "start.html")).toString();

let win: BrowserWindow;
let sessions: SiteSession[] = [];
let nextTabId = 1;
let activeTabId = 0;
const tabs = new Map<number, { view: WebContentsView; sessionId: string | null }>();
const configuredPartitions = new Set<string>();
let metrics = { top: 92, panel: 0 };
let saveTimer: NodeJS.Timeout | undefined;

// --- Partisi ---------------------------------------------------------------

function partitionSession(partition: string) {
  const ses = session.fromPartition(partition);
  if (!configuredPartitions.has(partition)) {
    configuredPartitions.add(partition);
    // v1: semua izin perangkat (kamera/mik/notifikasi) ditolak.
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.on("will-download", async (_event, item) => {
      const result = await dialog.showSaveDialog(win, {
        defaultPath: join(app.getPath("downloads"), item.getFilename()),
      });
      if (result.canceled || !result.filePath) item.cancel();
      else item.setSavePath(result.filePath);
    });
  }
  return ses;
}

// --- State -----------------------------------------------------------------

function snapshot(): AppState {
  const list: TabInfo[] = [];
  for (const [id, tab] of tabs) {
    const wc = tab.view.webContents;
    list.push({
      id,
      sessionId: tab.sessionId,
      url: wc.getURL(),
      title: wc.getTitle(),
      favicon: favicons.get(id) ?? null,
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    });
  }
  return { tabs: list, activeTabId, sessions };
}

const favicons = new Map<number, string>();

function broadcast(): void {
  if (win && !win.isDestroyed()) win.webContents.send("state", snapshot());
  persistTabs();
}

function persistTabs(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const list = [...tabs.entries()].map(([id, tab]) => ({
      sessionId: tab.sessionId,
      url: tab.view.webContents.getURL(),
    }));
    const activeIndex = Math.max(0, [...tabs.keys()].indexOf(activeTabId));
    saveTabs({ tabs: list, activeIndex });
  }, 300);
}

// --- Tab -------------------------------------------------------------------

function layout(): void {
  if (!win || win.isDestroyed()) return;
  const { width, height } = win.getContentBounds();
  for (const [id, tab] of tabs) {
    const active = id === activeTabId;
    tab.view.setVisible(active);
    if (active) {
      tab.view.setBounds({
        x: 0,
        y: metrics.top,
        width: width - metrics.panel,
        height: Math.max(0, height - metrics.top),
      });
    }
  }
}

function createTab(sessionId: string | null, url: string, activate = true): number {
  const id = nextTabId++;
  const ses = partitionSession(partitionFor(sessionId));
  const view = new WebContentsView({
    webPreferences: { session: ses, sandbox: true, contextIsolation: true },
  });
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: popupUrl }) => {
    // Popup (mis. OAuth) lahir sebagai tab baru di partisi yang sama.
    createTab(sessionId, popupUrl);
    return { action: "deny" };
  });
  wc.on("did-navigate", broadcast);
  wc.on("did-navigate-in-page", broadcast);
  wc.on("did-start-loading", broadcast);
  wc.on("did-stop-loading", broadcast);
  wc.on("page-title-updated", broadcast);
  wc.on("page-favicon-updated", (_e, favs) => {
    if (favs[0]) favicons.set(id, favs[0]);
    broadcast();
  });
  tabs.set(id, { view, sessionId });
  win.contentView.addChildView(view);
  if (activate) activeTabId = id;
  layout();
  void wc.loadURL(url);
  broadcast();
  return id;
}

function closeTab(id: number): void {
  const tab = tabs.get(id);
  if (!tab) return;
  win.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  tabs.delete(id);
  favicons.delete(id);
  if (activeTabId === id) {
    const remaining = [...tabs.keys()];
    activeTabId = remaining[remaining.length - 1] ?? 0;
  }
  if (tabs.size === 0) {
    createTab(null, START_PAGE);
    return;
  }
  layout();
  broadcast();
}

function activateTab(id: number): void {
  if (!tabs.has(id)) return;
  activeTabId = id;
  layout();
  broadcast();
}

// --- Sesi ------------------------------------------------------------------

function openSession(sessionId: string): void {
  const existing = [...tabs.entries()].find(([, t]) => t.sessionId === sessionId);
  if (existing) {
    activateTab(existing[0]);
    return;
  }
  const site = sessions.find((s) => s.id === sessionId);
  if (site) createTab(sessionId, site.homeUrl);
}

async function createSessionFromTab(tabId: number, name: string): Promise<string> {
  const tab = tabs.get(tabId);
  if (!tab) throw new Error("Tab tidak ditemukan");
  const url = tab.view.webContents.getURL();
  const host = hostOf(url);
  const id = randomUUID();
  const source = partitionSession(partitionFor(tab.sessionId));
  const target = partitionSession(partitionFor(id));
  const all = await source.cookies.get({});
  const now = Math.floor(Date.now() / 1000);
  for (const cookie of cookiesForHost(all, host)) {
    try {
      await target.cookies.set(cookieToSetDetails(cookie, now));
    } catch {
      // Cookie individual bisa ditolak Chromium (mis. SameSite) — lewati.
    }
  }
  const site: SiteSession = {
    id,
    name: name.trim() || host,
    color: nextColor(sessions.length),
    homeUrl: url,
    host,
    createdAt: Date.now(),
  };
  sessions.push(site);
  saveSessions(sessions);
  openSession(id);
  broadcast();
  return id;
}

function createSessionEmpty(rawUrl: string, name: string): string {
  const homeUrl = normalizeInputUrl(rawUrl);
  const host = hostOf(homeUrl);
  const site: SiteSession = {
    id: randomUUID(),
    name: name.trim() || host,
    color: nextColor(sessions.length),
    homeUrl,
    host,
    createdAt: Date.now(),
  };
  sessions.push(site);
  saveSessions(sessions);
  openSession(site.id);
  broadcast();
  return site.id;
}

async function deleteSession(id: string): Promise<void> {
  for (const [tabId, tab] of [...tabs]) {
    if (tab.sessionId === id) closeTab(tabId);
  }
  sessions = sessions.filter((s) => s.id !== id);
  saveSessions(sessions);
  const ses = partitionSession(partitionFor(id));
  await ses.clearStorageData();
  await ses.clearCache();
  try {
    // Folder partisi persisten: userData/Partitions/<nama tanpa "persist:">
    rmSync(join(app.getPath("userData"), "Partitions", `xob-${id}`), { recursive: true, force: true });
  } catch {
    // Sudah dibersihkan clearStorageData; abaikan.
  }
  broadcast();
}

// --- Jendela & IPC ----------------------------------------------------------

function createWindow(): void {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: "xoBnoisseS",
    backgroundColor: "#1f1f23",
    webPreferences: {
      preload: join(__dirname, "..", "preload", "preload.js"),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.on("resize", layout);
  void win.loadFile(join(__dirname, "..", "renderer", "index.html"));

  const restored = loadTabs();
  let restoredAny = false;
  if (restored && restored.tabs.length > 0) {
    restored.tabs.forEach((t, i) => {
      const valid = t.sessionId === null || sessions.some((s) => s.id === t.sessionId);
      if (!valid || !t.url) return;
      createTab(t.sessionId, t.url, i === restored.activeIndex);
      restoredAny = true;
    });
  }
  if (!restoredAny) createTab(null, START_PAGE);
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => snapshot());
  ipcMain.on("chrome:metrics", (_e, m: { top: number; panel: number }) => {
    metrics = m;
    layout();
  });
  ipcMain.handle("tab:new-main", () => createTab(null, START_PAGE));
  ipcMain.handle("tab:activate", (_e, id: number) => activateTab(id));
  ipcMain.handle("tab:close", (_e, id: number) => closeTab(id));
  ipcMain.handle("tab:navigate", (_e, id: number, input: string) => {
    const tab = tabs.get(id);
    if (tab) void tab.view.webContents.loadURL(normalizeInputUrl(input));
  });
  ipcMain.handle("tab:back", (_e, id: number) => tabs.get(id)?.view.webContents.navigationHistory.goBack());
  ipcMain.handle("tab:forward", (_e, id: number) => tabs.get(id)?.view.webContents.navigationHistory.goForward());
  ipcMain.handle("tab:reload", (_e, id: number) => tabs.get(id)?.view.webContents.reload());
  ipcMain.handle("session:open", (_e, id: string) => openSession(id));
  ipcMain.handle("session:create-empty", (_e, url: string, name: string) => createSessionEmpty(url, name));
  ipcMain.handle("session:create-from-tab", (_e, tabId: number, name: string) => createSessionFromTab(tabId, name));
  ipcMain.handle("session:update", (_e, id: string, patch: { name?: string; color?: string }) => {
    const site = sessions.find((s) => s.id === id);
    if (!site) return;
    if (patch.name?.trim()) site.name = patch.name.trim();
    if (patch.color) site.color = patch.color;
    saveSessions(sessions);
    broadcast();
  });
  ipcMain.handle("session:delete", (_e, id: string) => deleteSession(id));
}

app.whenReady().then(() => {
  sessions = loadSessions();
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
