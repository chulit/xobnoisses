"use strict";
// Popup xoBnoisseS — semua mutasi lewat service worker (runtime.sendMessage).

const PALETTE = ["#e5484d", "#f76b15", "#ffb224", "#46a758", "#12a594", "#0091ff", "#8e4ec6", "#e93d82"];
const $ = (sel) => document.querySelector(sel);

let state = { sessions: [], activeTab: null, tabSession: {} };

async function call(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (!res?.ok) throw new Error(res?.error ?? "Gagal");
  return res.result;
}

async function refresh() {
  state = await call({ type: "getState" });
  render();
}

function render() {
  const cur = $("#current");
  const saveBtn = $("#btn-save");
  const newCurrentBtn = $("#btn-new-current");
  const tab = state.activeTab;
  if (tab && tab.host && /^https?:/.test(tab.url)) {
    const owner = tab.sessionId
      ? state.sessions.find((s) => s.id === tab.sessionId)
      : null;
    cur.textContent = `${tab.title || tab.host} · ${tab.host}${owner ? ` · sesi “${owner.name}”` : " · sesi utama"}`;
    saveBtn.disabled = false;
    newCurrentBtn.disabled = false;
    newCurrentBtn.textContent = `Buka sesi baru untuk ${tab.host}`;
  } else {
    cur.textContent = "Buka sebuah situs dulu untuk membuat sesi.";
    saveBtn.disabled = true;
    newCurrentBtn.disabled = true;
    newCurrentBtn.textContent = "Buka sesi baru untuk situs ini";
  }

  const list = $("#list");
  list.innerHTML = "";
  if (state.sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      "Belum ada sesi. Dari sebuah situs, klik “Buka sesi baru” untuk membuka situs yang sama sebagai user lain — atau simpan tab ini sebagai sesi.";
    list.appendChild(empty);
    return;
  }
  const groups = new Map();
  for (const s of state.sessions) {
    if (!groups.has(s.host)) groups.set(s.host, []);
    groups.get(s.host).push(s);
  }
  const openIds = new Set(Object.values(state.tabSession));
  for (const [host, items] of groups) {
    const group = document.createElement("div");
    group.className = "site-group";
    const head = document.createElement("div");
    head.className = "site-head";
    const fav = document.createElement("img");
    fav.src = `https://${host}/favicon.ico`;
    fav.alt = "";
    fav.addEventListener("error", () => fav.remove());
    const headText = document.createElement("span");
    headText.textContent = host;
    head.append(fav, headText);
    group.appendChild(head);
    for (const s of items) {
      const item = document.createElement("div");
      item.className = "session-item";
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = s.color;
      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = s.name;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = openIds.has(s.id) ? "Sedang terbuka" : "Klik untuk membuka";
      meta.append(name, sub);
      item.appendChild(dot);
      item.appendChild(meta);
      if (openIds.has(s.id)) {
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
      const del = document.createElement("button");
      del.className = "act";
      del.textContent = "🗑";
      del.title = "Hapus sesi";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        openDeleteModal(s);
      });
      item.append(edit, del);
      item.addEventListener("click", async () => {
        try {
          await call({ type: "openSession", sessionId: s.id });
          window.close();
        } catch (e) {
          $("#current").textContent = `Error: ${e.message ?? e}`;
        }
      });
      group.appendChild(item);
    }
    list.appendChild(group);
  }
}

// --- Modal -------------------------------------------------------------------

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

function modalButtons(m, submitLabel, onSubmit, danger) {
  const err = document.createElement("div");
  err.className = "error";
  const row = document.createElement("div");
  row.className = "row";
  const cancel = document.createElement("button");
  cancel.textContent = "Batal";
  cancel.addEventListener("click", closeModal);
  const ok = document.createElement("button");
  ok.textContent = submitLabel;
  ok.className = danger ? "danger" : "primary";
  ok.addEventListener("click", async () => {
    try {
      await onSubmit();
      closeModal();
      await refresh();
    } catch (e) {
      err.textContent = String(e.message ?? e);
    }
  });
  row.append(cancel, ok);
  m.append(err, row);
}

function openSaveModal() {
  const tab = state.activeTab;
  openModal((m) => {
    const h = document.createElement("h2");
    h.textContent = "Simpan sebagai sesi";
    const p = document.createElement("p");
    p.textContent = `Cookie login untuk ${tab.host} dari tab ini akan disimpan sebagai sesi baru. Tab ini sendiri tidak berubah.`;
    const label = document.createElement("label");
    label.textContent = "Nama sesi";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = tab.host;
    m.append(h, p, label, input);
    modalButtons(m, "Simpan sesi", async () => {
      await call({ type: "saveCurrentTab", name: input.value });
    });
    setTimeout(() => input.focus(), 30);
  });
}

function openNewModal() {
  openModal((m) => {
    const h = document.createElement("h2");
    h.textContent = "Sesi kosong untuk situs lain";
    const p = document.createElement("p");
    p.textContent = "Tab baru akan terbuka dengan keadaan belum login — silakan login di dalamnya; sesinya tersimpan otomatis.";
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
    modalButtons(m, "Buat sesi", async () => {
      if (!url.value.trim()) throw new Error("Isi alamat situsnya dulu");
      await call({ type: "createEmpty", url: url.value, name: name.value });
      window.close();
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
    modalButtons(m, "Simpan", async () => {
      await call({ type: "updateSession", sessionId: s.id, name: input.value, color });
    });
    setTimeout(() => input.focus(), 30);
  });
}

function openDeleteModal(s) {
  openModal((m) => {
    const h = document.createElement("h2");
    h.textContent = `Hapus sesi “${s.name}”?`;
    const p = document.createElement("p");
    p.textContent = `Data login tersimpan untuk ${s.host} akan dihapus dari ekstensi. Tab yang sedang memakai sesi ini kembali menjadi tab sesi utama.`;
    m.append(h, p);
    modalButtons(
      m,
      "Hapus sesi",
      async () => {
        await call({ type: "deleteSession", sessionId: s.id });
      },
      true,
    );
  });
}

$("#btn-save").addEventListener("click", openSaveModal);
$("#btn-new").addEventListener("click", openNewModal);
$("#btn-new-current").addEventListener("click", async () => {
  const btn = $("#btn-new-current");
  btn.disabled = true;
  try {
    await call({ type: "createNewForCurrentTab" });
    window.close();
  } catch (e) {
    $("#current").textContent = `Error: ${e.message ?? e}`;
    btn.disabled = false;
  }
});

refresh().catch((e) => {
  $("#current").textContent = `Error: ${e.message ?? e}`;
});
