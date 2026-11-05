# xoBnoisseS

Multi-login ala **SessionBox klasik**: login user berbeda di tab berbeda — tanpa cloud, tanpa fingerprint, tanpa proxy.

Nama adalah "SessionBox" dibalik. Implementasi tulis-ulang bersih (clean-room) berdasarkan peta fitur dari reverse-engineering SessionBox One (lihat `SPEC.md`).

Ada dua cangkang dengan model sesi yang sama:

1. **Ekstensi Chrome (`extension/`)** — bentuk utamanya, persis klasik: ekstensi menumpang di Chrome kamu.
2. **Aplikasi Electron (folder akar)** — browser mandiri dengan isolasi partisi asli Chromium.

## Ekstensi Chrome

### Memasang (Load unpacked, tanpa Web Store)

1. Buka `chrome://extensions`, nyalakan **Developer mode** (kanan atas).
2. Klik **Load unpacked**, pilih folder `extension/` dari repo ini.
3. Sematkan ikon xoBnoisseS di toolbar.

### Cara kerja (mekanisme klasik, apa adanya)

Chrome hanya punya satu cookie jar per profil, jadi ekstensi ini bekerja seperti SessionBox klasik: setiap sesi menyimpan salinan cookie-nya di penyimpanan ekstensi, dan **saat tab sebuah sesi menjadi aktif, isi cookie jar browser untuk host itu ditukar** dengan milik sesi tersebut (isi lama disimpan kembali ke pemilik sebelumnya). Sesi utama = jar asli browser.

Konsekuensi jujurnya:

- Hanya sesi pada **tab yang sedang aktif** yang "hidup" pada satu saat; tab latar dari sesi lain tidak mengirim cookie-nya sampai tab itu diaktifkan. Persis keterbatasan versi klasik.
- Sesi dikunci ke host situsnya; cookie domain induk (mis. `.google.com`) ikut terbawa antar sesi subdomain yang berbagi domain induk yang sama.

### Pakai

Klik ikon ekstensi → popup berisi: tab saat ini + tombol **Simpan tab ini sebagai sesi**, **+ Sesi kosong baru**, dan daftar sesi berkelompok per situs. Klik sesi untuk membukanya (tab yang sudah ada akan difokuskan). ✎ ganti nama/warna, 🗑 hapus sesi.

## Aplikasi Electron

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
