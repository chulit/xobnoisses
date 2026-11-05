"use strict";
// Renderer chrome xoBnoisseS — vanilla JS, bicara ke main via window.xob (preload).
/* global xob */

const PALETTE = ["#e5484d", "#f76b15", "#ffb224", "#46a758", "#12a594", "#0091ff", "#8e4ec6", "#e93d82"];
const PANEL_WIDTH = 300;

let state = { tabs: [], activeTabId: 0, sessions: [] };
let panelOpen = false;
let addressEditing = false;

const $ = (sel) => document.querySelector(sel);
const tabstrip = $("#tabstrip");
const addressEl = $("#address");
const panelEl = $("#panel");
const listEl = $("#session-list");

function sessionOf(tab) {
  return tab.sessionId ? state.sessions.find((s) => s.id === tab.sessionId) : null;
}
function activeTab() {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}
function displayUrl(url) {
  if (!url || url.startsWith("file:")) return "";
  return url;
}

function render() {
  // --- Tab strip ---
  tabstrip.innerHTML = "";
  for (const tab of state.tabs) {
    const ses = sessionOf(tab);
    const el = document.createElement("div");
    el.className = "tab" + (tab.id === state.activeTabId ? " active" : "");
    el.title = ses ? `${ses.name} — ${tab.title}` : tab.title;
    if (ses) {
      const strip = document.createElement("span");
      strip.className = "strip";
      strip.style.background = ses.color;
      el.appendChild(strip);
    }
    if (tab.favicon) {
      const img = document.createElement("img");
      img.src = tab.favicon;
      img.alt = "";
      el.appendChild(img);
    }
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = tab.loading ? "Memuat…" : tab.title || "Tab baru";
    el.appendChild(title);
    if (ses) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.style.background = ses.color;
      chip.textContent = ses.name;
      el.appendChild(chip);
    }
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      xob.closeTab(tab.id);
    });
    el.appendChild(close);
    el.addEventListener("click", () => xob.activateTab(tab.id));
    tabstrip.appendChild(el);
  }
  const plus = document.createElement("button");
  plus.id = "btn-newtab";
  plus.textContent = "+";
  plus.title = "Tab utama baru";
  plus.addEventListener("click", () => xob.newMainTab());
  tabstrip.appendChild(plus);

  // --- Toolbar ---
  const tab = activeTab();
  $("#btn-back").disabled = !tab || !tab.canGoBack;
  $("#btn-forward").disabled = !tab || !tab.canGoForward;
  $("#btn-reload").disabled = !tab;
  if (!addressEditing && tab) addressEl.value = displayUrl(tab.url);
  $("#btn-panel").classList.toggle("on", panelOpen);

  // --- Panel: tab saat ini ---
  const cur = $("#current-tab");
  const saveBtn = $("#btn-save-tab");
  if (tab && tab.url && !tab.url.startsWith("file:") && !tab.url.startsWith("about:")) {
    let host = tab.url;
    try { host = new URL(tab.url).hostname; } catch { /* abaikan */ }
    cur.textContent = `${tab.title || host} · ${host}${tab.sessionId ? " · sesi tersimpan" : " · sesi utama"}`;
    saveBtn.disabled = false;
  } else {
    cur.textContent = "Halaman awal — buka situs dulu untuk menyimpan sesi.";
    saveBtn.disabled = true;
  }

  // --- Panel: daftar sesi, grup per situs ---
  listEl.innerHTML = "";
  if (state.sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Belum ada sesi. Login ke sebuah situs, lalu simpan tab-nya sebagai sesi — atau buat sesi kosong dan login di dalamnya.";
    listEl.appendChild(empty);
  }
  const groups = new Map();
  for (const s of state.sessions) {
    if (!groups.has(s.host)) groups.set(s.host, []);
    groups.get(s.host).push(s);
  }
  const openSessionIds = new Set(state.tabs.map((t) => t.sessionId).filter(Boolean));
  for (const [host, items] of groups) {
    const group = document.createElement("div");
    group.className = "site-group";
    const head = document.createElement("div");
    head.className = "site-head";
    const fav = document.createElement("img");
    fav.src = `https://${host}/favicon.ico`;
    fav.alt = "";
    fav.addEventListener("error", () => fav.remove());
    head.appendChild(fav);
    const headText = document.createElement("span");
    headText.textContent = host;
    head.appendChild(headText);
    group.appendChild(head);
    for (const s of items) {
      const item = document.createElement("div");
      item.className = "session-item";
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = s.color;
      item.appendChild(dot);
      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = s.name;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = openSessionIds.has(s.id) ? "Sedang terbuka" : "Klik untuk membuka";
      meta.append(name, sub);
      item.appendChild(meta);
      if (openSessionIds.has(s.id)) {
        const od = document.createElement("span");
        od.className = "open-dot";
        item.appendChild(od);
      }
      const edit = document.createElement("button");
      edit.className = "act";
      edit.textContent = "✎";
      edit.title = "Ubah nama / warna";
      edit.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(s);
      });
      item.appendChild(edit);
      const del = document.createElement("button");
      del.className = "act";
      del.textContent = "🗑";
      del.title = "Hapus sesi";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        openDeleteModal(s);
      });
      item.appendChild(del);
      item.addEventListener("click", () => xob.openSession(s.id));
      group.appendChild(item);
    }
    listEl.appendChild(group);
  }
}

// --- Modal -----------------------------------------------------------------

const backdrop = $("#modal-backdrop");
const modal = $("#modal");

function closeModal() {
  backdrop.classList.add("hidden");
  modal.innerHTML = "";
}
function openModal(build) {
  modal.innerHTML = "";
  build(modal);
  backdrop.classList.remove("hidden");
}
backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeModal();
});

function modalButtons(modalEl, submitLabel, onSubmit, danger) {
  const row = document.createElement("div");
  row.className = "row";
  const cancel = document.createElement("button");
  cancel.textContent = "Batal";
  cancel.addEventListener("click", closeModal);
  const ok = document.createElement("button");
  ok.textContent = submitLabel;
  ok.className = danger ? "danger" : "primary";
  ok.addEventListener("click", () => {
    onSubmit();
    closeModal();
  });
  row.append(cancel, ok);
  modalEl.appendChild(row);
}

function openSaveTabModal() {
  const tab = activeTab();
  if (!tab) return;
  let host = "";
  try { host = new URL(tab.url).hostname; } catch { /* abaikan */ }
  openModal((m) => {
    const h = document.createElement("h2");
    h.textContent = "Simpan sebagai sesi";
    const p = document.createElement("p");
    p.textContent = `Cookie login untuk ${host} akan disalin dari tab ini ke sesi baru. Tab ini sendiri tidak berubah.`;
    const label = document.createElement("label");
    label.textContent = "Nama sesi";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = host;
    m.append(h, p, label, input);
    modalButtons(m, "Simpan sesi", () => xob.createFromTab(tab.id, input.value));
    setTimeout(() => input.focus(), 30);
  });
}

function openNewEmptyModal() {
  openModal((m) => {
    const h = document.createElement("h2");
    h.textContent = "Sesi kosong baru";
    const p = document.createElement("p");
    p.textContent = "Tab baru akan terbuka dengan sesi bersih — silakan login di dalamnya.";
    const l1 = document.createElement("label");
    l1.textContent = "Alamat situs";
    const url = document.createElement("input");
    url.type = "text";
    url.placeholder = "mis. mail.google.com";
    const l2 = document.createElement("label");
    l2.textContent = "Nama sesi (opsional)";
    const name = document.createElement("input");
    name.type = "text";
    m.append(h, p, l1, url, l2, name);
    modalButtons(m, "Buat sesi", () => {
      if (url.value.trim()) xob.createEmpty(url.value, name.value);
    });
    setTimeout(() => url.focus(), 30);
  });
}

function openEditModal(s) {
  let color = s.color;
  openModal((m) => {
    const h = document.createElement("h2");
    h.textContent = "Ubah sesi";
    const label = document.createElement("label");
    label.textContent = "Nama sesi";
    const input = document.createElement("input");
    input.type = "text";
    input.value = s.name;
    const l2 = document.createElement("label");
    l2.textContent = "Warna";
    const sw = document.createElement("div");
    sw.className = "swatches";
    for (const c of PALETTE) {
      const b = document.createElement("button");
      b.className = "sw" + (c === color ? " sel" : "");
      b.style.background = c;
      b.addEventListener("click", () => {
        color = c;
        sw.querySelectorAll(".sw").forEach((x) => x.classList.remove("sel"));
        b.classList.add("sel");
      });
      sw.appendChild(b);
    }
    m.append(h, label, input, l2, sw);
    modalButtons(m, "Simpan", () => xob.updateSession(s.id, { name: input.value, color }));
    setTimeout(() => input.focus(), 30);
  });
}

function openDeleteModal(s) {
  openModal((m) => {
    const h = document.createElement("h2");
    h.textContent = `Hapus sesi “${s.name}”?`;
    const p = document.createElement("p");
    p.textContent = `Semua tab sesi ini akan ditutup dan data loginnya untuk ${s.host} dihapus permanen dari perangkat ini.`;
    m.append(h, p);
    modalButtons(m, "Hapus sesi", () => xob.deleteSession(s.id), true);
  });
}

// --- Toolbar & panel --------------------------------------------------------

function sendMetrics() {
  const top = tabstrip.offsetHeight + $("#toolbar").offsetHeight;
  xob.setMetrics(top, panelOpen ? PANEL_WIDTH : 0);
}

$("#btn-panel").addEventListener("click", () => {
  panelOpen = !panelOpen;
  panelEl.classList.toggle("hidden", !panelOpen);
  sendMetrics();
  render();
});
$("#btn-back").addEventListener("click", () => { const t = activeTab(); if (t) xob.back(t.id); });
$("#btn-forward").addEventListener("click", () => { const t = activeTab(); if (t) xob.forward(t.id); });
$("#btn-reload").addEventListener("click", () => { const t = activeTab(); if (t) xob.reload(t.id); });
$("#btn-save-tab").addEventListener("click", openSaveTabModal);
$("#btn-new-empty").addEventListener("click", openNewEmptyModal);

addressEl.addEventListener("focus", () => {
  addressEditing = true;
  addressEl.select();
});
addressEl.addEventListener("blur", () => {
  addressEditing = false;
  render();
});
addressEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const t = activeTab();
    if (t && addressEl.value.trim()) xob.navigate(t.id, addressEl.value);
    addressEl.blur();
  } else if (e.key === "Escape") {
    addressEl.blur();
  }
});

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "t") {
    e.preventDefault();
    xob.newMainTab();
  } else if (mod && e.key.toLowerCase() === "l") {
    e.preventDefault();
    addressEl.focus();
  }
});

window.addEventListener("resize", sendMetrics);

xob.onState((s) => {
  state = s;
  render();
});
xob.getState().then((s) => {
  state = s;
  sendMetrics();
  render();
});
