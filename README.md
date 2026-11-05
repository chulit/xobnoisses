# xoBnoisseS

Browser multi-login ala **SessionBox klasik**: login user berbeda di tab berbeda, dalam satu jendela — tanpa cloud, tanpa fingerprint, tanpa proxy. Yang dipakai hanya isolasi sesi asli Chromium: setiap sesi punya partisi persistennya sendiri.

Nama adalah "SessionBox" dibalik. Implementasi tulis-ulang bersih (clean-room) berdasarkan peta fitur dari reverse-engineering SessionBox One (lihat `SPEC.md`).

## Model

- **Sesi utama** — penjelajahan biasa (partisi `persist:xob-main`).
- **Sesi tambahan** — terikat satu situs, persis klasik: {nama, warna, URL rumah, partisi sendiri}. Dikelompokkan per situs di panel samping.
- **Dua jalur membuat sesi**: (1) *Simpan tab ini sebagai sesi* — cookie domain situs tab aktif disalin dari partisi sumber ke partisi sesi baru; (2) *Sesi kosong baru* — tab bersih untuk login fresh.
- Popup (mis. OAuth) lahir sebagai tab baru **di partisi yang sama**.
- Tab dipulihkan saat aplikasi dibuka kembali.

## Menjalankan (pengembangan)

```bash
npm install
npm start        # build + jalankan Electron
npm test         # typecheck + tes unit fungsi murni (node --test)
npm run dist:mac # paket macOS arm64 (.zip berisi .app)
```

## Memasang di Mac

Unzip `xoBnoisseS-0.1.0-arm64-mac.zip`, pindahkan `xoBnoisseS.app` ke Applications, lalu buka lewat **klik kanan → Open** (aplikasi belum ditandatangani Apple, jadi Gatekeeper menolak buka biasa pertama kali).

Data tersimpan lokal di `~/Library/Application Support/xobnoisses/` (`sessions.json`, `tabs.json`, folder `Partitions/` per sesi).

## Keterbatasan v1 (disengaja)

- Ikon aplikasi masih ikon bawaan Electron; belum ada ikon kustom.
- Izin kamera/mikrofon/notifikasi ditolak semua.
- `Cmd+W` masih perilaku bawaan menu macOS (tutup jendela), belum dialihkan ke tutup tab.
- Di luar cakupan: proxy per sesi, fingerprint, sinkronisasi cloud, ekstensi pendamping, sesi sementara, build Windows/Linux. Lihat `SPEC.md` untuk rancangan lengkapnya.
