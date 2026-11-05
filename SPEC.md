# xoBnoisseS — Spesifikasi v1

Browser multi-login ala SessionBox klasik: login user berbeda di tab berbeda, dalam satu jendela.
Nama: **xoBnoisseS** ("SessionBox" dibalik — diputuskan user 2026-11-05).
Bundle ID usulan: `id.chulit.xobnoisses` (bisa diveto).
Platform: Electron + TypeScript, target pertama macOS arm64 (DMG). Tanpa tanda tangan Apple di v1.

## Keputusan desain (hasil diskusi 2026-11-05, semua atas tap user)

1. **Satu jendela, semua akun berdampingan sebagai tab.** Tidak ada konsep akun aktif global; tiap tab memikul identitas sesinya (strip warna + nama sesi).
2. **Ada sesi utama + sesi tambahan (persis klasik).** Sesi utama = partisi default, penjelajahan biasa. Sesi tambahan = partisi persisten sendiri (`persist:xob-<sessionId>`).
3. **Sesi terikat satu situs (persis klasik).** Satu sesi = {id, nama, warna, host situs + URL rumah, favicon, partisi}. Daftar sesi dikelompokkan per situs (kasus utama: banyak akun di situs yang sama). Klik sesi → buka URL rumahnya dengan login sesi itu; bila tab sesi itu sudah terbuka → fokus ke tab tersebut.
4. **Dua jalur pembuatan sesi:**
   - *Simpan dari tab saat ini*: cookie domain situs tab aktif disalin dari partisi sumber (utama/sesi lain) ke partisi sesi baru, lalu diberi nama + warna. (Di Electron: `session.cookies.get` → `cookies.set` antar-partisi.)
   - *Sesi kosong baru*: dialog URL situs + nama → tab terbuka di partisi baru, user login fresh di dalamnya.
5. **Daftar sesi = panel samping** yang bisa dibuka-tutup dari toolbar (padanan popup ekstensi klasik). Isi: grup per situs, favicon, nama, warna; aksi: buka, ganti nama, ganti warna, hapus (hapus = partisi ikut dibersihkan, pakai konfirmasi).

## Perilaku tab & jendela

- Tab bar gaya Chrome: buka/tutup/pindah/urutan tab; tombol "+" = tab baru di **sesi utama**.
- Satu sesi boleh punya banyak tab (berbagi login yang sama).
- Popup (`window.open`, mis. OAuth) → tab baru **di partisi yang sama** dengan tab asal — wajib, agar login pihak ketiga tidak putus.
- Address bar tunggal mengikuti tab aktif; back/forward/reload per tab.
- Restart aplikasi: tab yang terbuka dipulihkan beserta ikatan sesinya (default keputusan Muse, bisa diveto).
- Unduhan: dialog simpan standar Electron. Izin kamera/mikrofon/notifikasi: ditolak default di v1.
- Menutup tab sesi tidak menghapus sesi; sesi tetap di panel.

## Data & penyimpanan

- `sessions.json` di `userData`: daftar sesi (id, nama, warna, host, URL rumah, favicon cache, urutan, waktu buat).
- Cookie/localStorage/indexedDB per partisi disimpan Chromium sendiri di folder Partitions userData — tidak ada database tambahan, tidak ada cloud.

## Di luar cakupan v1 (kandidat modul lanjutan)

Proxy per sesi · fingerprint/anti-detect · sinkronisasi cloud · berbagi sesi/tim · brankas password & autofill kredensial · ekstensi pendamping untuk Chrome/Firefox asli · sesi sementara (sekali pakai) · build Windows/Linux · mirror DOM/streaming ala SessionBox One · Widevine/DRM.

## Tonggak pembangunan

- **M1 — Kerangka**: jendela + tab bar + address bar + WebContentsView per tab + partisi per sesi (utama + sesi contoh tertanam), navigasi & popup separtisi.
- **M2 — Sesi**: model data + panel samping (grup per situs) + CRUD sesi + dua jalur pembuatan (termasuk salin cookie antar-partisi) + lencana warna/nama di tab.
- **M3 — Pulih & kemas**: pemulihan tab saat restart, unduhan, favicon, DMG arm64 via electron-builder, uji manual di Mac user.

## Latar teknis (dari REA SessionBox One, 2026-11-05)

- Chrome tidak punya container per tab (cookie store per profil saja); ekstensi klasik memakai trik tukar cookie. Partisi Electron (`session.fromPartition('persist:…')`) adalah padanan container Firefox di level sesi Chromium — isolasi asli, banyak sesi situs yang sama bisa aktif bersamaan.
- Pola partisi + Redux-nya terverifikasi dari bedahan SessionBox One (`~/workspace/downloads/sessionbox/REA-REPORT*.md`); implementasi xoBnoisseS adalah tulis-ulang bersih, bukan salinan kode.
