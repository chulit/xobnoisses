// background.js — service worker xoBnoisseS (MV3).
// Mesin tukar cookie ala SessionBox klasik:
// - Chrome punya satu cookie jar per profil; tiap sesi menyimpan salinannya.
// - Saat tab sebuah sesi aktif, jar browser untuk host itu ditukar ke milik
//   sesi tersebut; isi tergeser disimpan kembali ke pemilik sebelumnya.
// - Tab tanpa sesi = sesi utama (jar asli browser).
import {
  computeSwap,
  cookiesForHost,
  cookieUrl,
  hostOf,
  nextColor,
  nextSessionName,
  normalizeSiteUrl,
  toSetDetails,
  toStoredCookie,
} from "./jar.js";

const MAIN = "main";

// --- Penyimpanan ------------------------------------------------------------

async function loadLocal() {
  const data = await chrome.storage.local.get(["xobSessions", "xobMainJars"]);
  return { sessions: data.xobSessions ?? [], mainJars: data.xobMainJars ?? {} };
}
async function saveLocal(sessions, mainJars) {
  await chrome.storage.local.set({ xobSessions: sessions, xobMainJars: mainJars });
}
async function loadRuntime() {
  const data = await chrome.storage.session.get(["xobTabSession", "xobLoadedJar"]);
  return { tabSession: data.xobTabSession ?? {}, loadedJar: data.xobLoadedJar ?? {} };
}
async function saveRuntime(tabSession, loadedJar) {
  await chrome.storage.session.set({ xobTabSession: tabSession, xobLoadedJar: loadedJar });
}

// --- Mesin tukar (disserialkan agar tidak balapan) ---------------------------

let chain = Promise.resolve();
function serialized(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function swapJarTo(host, owner) {
  const { sessions, mainJars } = await loadLocal();
  const runtime = await loadRuntime();
  const loaded = runtime.loadedJar[host];

  const all = await chrome.cookies.getAll({});
  const current = cookiesForHost(all, host).map(toStoredCookie);

  if (loaded === undefined) {
    // Ekstensi baru jalan: jar browser saat ini dianggap milik sesi utama.
    mainJars[host] = current;
    runtime.loadedJar[host] = MAIN;
    await saveLocal(sessions, mainJars);
    await saveRuntime(runtime.tabSession, runtime.loadedJar);
    if (owner === MAIN) return;
  } else if (loaded === owner) {
    return;
  } else {
    // Simpan isi jar sekarang ke pemilik sebelumnya.
    if (loaded === MAIN) {
      mainJars[host] = current;
    } else {
      const prev = sessions.find((s) => s.id === loaded);
      if (prev) prev.cookies = current;
    }
  }

  const target =
    owner === MAIN
      ? (mainJars[host] ?? [])
      : (sessions.find((s) => s.id === owner)?.cookies ?? []);

  const { toRemove, toSet } = computeSwap(current, target);
  for (const c of toRemove) {
    try {
      await chrome.cookies.remove({ url: cookieUrl(c), name: c.name });
    } catch { /* abaikan */ }
  }
  for (const c of toSet) {
    try {
      await chrome.cookies.set(toSetDetails(c));
    } catch { /* cookie individual bisa ditolak Chrome — lewati */ }
  }

  runtime.loadedJar[host] = owner;
  await saveLocal(sessions, mainJars);
  await saveRuntime(runtime.tabSession, runtime.loadedJar);
}

async function ensureJarForTab(tab) {
  if (!tab || !tab.url) return;
  const host = hostOf(tab.url);
  if (!host) return;
  const { tabSession } = await loadRuntime();
  const owner = tabSession[String(tab.id)] ?? MAIN;
  await swapJarTo(host, owner);
}

// --- Aksi dari popup -----------------------------------------------------------

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function openSession(sessionId) {
  const { sessions } = await loadLocal();
  const site = sessions.find((s) => s.id === sessionId);
  if (!site) return;
  // Fokuskan tab sesi yang sudah ada.
  const { tabSession } = await loadRuntime();
  const existingId = Object.keys(tabSession).find((id) => tabSession[id] === sessionId);
  if (existingId) {
    const tabId = Number(existingId);
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      await ensureJarForTab(tab);
      return;
    } catch { /* tab sudah hilang — buat baru */ }
  }
  const tab = await chrome.tabs.create({ url: "about:blank" });
  const runtime = await loadRuntime();
  runtime.tabSession[String(tab.id)] = sessionId;
  await saveRuntime(runtime.tabSession, runtime.loadedJar);
  await swapJarTo(site.host, sessionId);
  await chrome.tabs.update(tab.id, { url: site.homeUrl });
}

async function saveCurrentTabAsSession(name) {
  const tab = await activeTab();
  if (!tab || !tab.url) throw new Error("Tidak ada tab aktif");
  const host = hostOf(tab.url);
  if (!host) throw new Error("Halaman ini tidak bisa disimpan sebagai sesi");
  await ensureJarForTab(tab); // pastikan jar browser == pemilik tab ini
  const all = await chrome.cookies.getAll({});
  const cookies = cookiesForHost(all, host).map(toStoredCookie);
  const { sessions, mainJars } = await loadLocal();
  const site = {
    id: crypto.randomUUID(),
    name: (name ?? "").trim() || host,
    color: nextColor(sessions.length),
    homeUrl: tab.url,
    host,
    cookies,
    createdAt: Date.now(),
  };
  sessions.push(site);
  await saveLocal(sessions, mainJars);
  return site.id;
}

/**
 * Alur utama klasik: dari tab situs A yang sedang aktif, lahirkan sesi baru
 * untuk situs yang sama. Cookie tab lama disimpan dulu ke pemiliknya oleh
 * swapJarTo, jadi sesi tab sebelumnya tidak hilang; tab baru dibuka di URL
 * yang sama persis dengan jar kosong untuk login sebagai user lain.
 */
async function createNewSessionForCurrentTab() {
  const tab = await activeTab();
  if (!tab || !tab.url) throw new Error("Tidak ada tab aktif");
  const host = hostOf(tab.url);
  if (!host || !/^https?:$/.test(new URL(tab.url).protocol)) {
    throw new Error("Sesi baru hanya bisa dibuat dari halaman web (http/https)");
  }
  await ensureJarForTab(tab); // samakan jar browser dengan pemilik tab ini dulu
  const { sessions, mainJars } = await loadLocal();
  const site = {
    id: crypto.randomUUID(),
    name: nextSessionName(sessions, host),
    color: nextColor(sessions.length),
    homeUrl: tab.url,
    host,
    cookies: [],
    createdAt: Date.now(),
  };
  sessions.push(site);
  await saveLocal(sessions, mainJars);
  await openSession(site.id);
  return site.id;
}

async function createEmptySession(rawUrl, name) {
  const homeUrl = normalizeSiteUrl(rawUrl);
  const host = hostOf(homeUrl);
  if (!host) throw new Error("Alamat situs tidak valid");
  const { sessions, mainJars } = await loadLocal();
  const site = {
    id: crypto.randomUUID(),
    name: (name ?? "").trim() || host,
    color: nextColor(sessions.length),
    homeUrl,
    host,
    cookies: [],
    createdAt: Date.now(),
  };
  sessions.push(site);
  await saveLocal(sessions, mainJars);
  await openSession(site.id);
  return site.id;
}

async function deleteSession(sessionId) {
  const { sessions, mainJars } = await loadLocal();
  const site = sessions.find((s) => s.id === sessionId);
  const rest = sessions.filter((s) => s.id !== sessionId);
  await saveLocal(rest, mainJars);
  const runtime = await loadRuntime();
  let changed = false;
  for (const id of Object.keys(runtime.tabSession)) {
    if (runtime.tabSession[id] === sessionId) {
      delete runtime.tabSession[id];
      changed = true;
    }
  }
  if (changed) await saveRuntime(runtime.tabSession, runtime.loadedJar);
  // Bila jar sesi ini sedang termuat, kembalikan jar browser ke sesi utama.
  if (site && runtime.loadedJar[site.host] === sessionId) {
    await swapJarTo(site.host, MAIN);
  }
}

async function getState() {
  const { sessions } = await loadLocal();
  const { tabSession } = await loadRuntime();
  const tab = await activeTab();
  return {
    sessions: sessions.map(({ cookies, ...meta }) => meta),
    activeTab: tab
      ? {
          id: tab.id,
          url: tab.url ?? "",
          title: tab.title ?? "",
          host: hostOf(tab.url ?? ""),
          sessionId: tabSession[String(tab.id)] ?? null,
        }
      : null,
    tabSession,
  };
}

// --- Peristiwa -----------------------------------------------------------------

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await serialized(() => ensureJarForTab(tab));
  } catch { /* abaikan */ }
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    void serialized(() => ensureJarForTab(tab));
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab) await serialized(() => ensureJarForTab(tab));
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const runtime = await loadRuntime();
  if (runtime.tabSession[String(tabId)]) {
    delete runtime.tabSession[String(tabId)];
    await saveRuntime(runtime.tabSession, runtime.loadedJar);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const run = async () => {
    switch (msg?.type) {
      case "getState":
        return getState();
      case "openSession":
        return serialized(() => openSession(msg.sessionId));
      case "saveCurrentTab":
        return serialized(() => saveCurrentTabAsSession(msg.name));
      case "createEmpty":
        return serialized(() => createEmptySession(msg.url, msg.name));
      case "createNewForCurrentTab":
        return serialized(() => createNewSessionForCurrentTab());
      case "updateSession": {
        const { sessions, mainJars } = await loadLocal();
        const site = sessions.find((s) => s.id === msg.sessionId);
        if (site) {
          if (msg.name?.trim()) site.name = msg.name.trim();
          if (msg.color) site.color = msg.color;
          await saveLocal(sessions, mainJars);
        }
        return undefined;
      }
      case "deleteSession":
        return serialized(() => deleteSession(msg.sessionId));
      default:
        return undefined;
    }
  };
  run().then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }),
  );
  return true; // respons asinkron
});
