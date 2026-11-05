# xoBnoisseS

Ekstensi Chrome untuk multi-login ala **SessionBox klasik**: login sebagai user berbeda pada tab berbeda di Chrome yang sama — tanpa cloud, tanpa fingerprint, dan tanpa proxy.

Nama **xoBnoisseS** adalah “SessionBox” dibalik. Proyek ini merupakan implementasi tulis-ulang bersih (clean-room), bukan salinan kode SessionBox.

## Memasang

Ekstensi ini dipasang sebagai unpacked extension:

1. Clone repo ini atau unduh sebagai ZIP lalu ekstrak.
2. Buka `chrome://extensions`.
3. Nyalakan **Developer mode** di kanan atas.
4. Klik **Load unpacked**.
5. Pilih folder utama repo ini — folder yang berisi `manifest.json`.
6. Sematkan ikon xoBnoisseS di toolbar Chrome.

## Cara Pakai

Alur utamanya persis seperti ini:

1. Buka sebuah situs dan login seperti biasa. Ini adalah **sesi utama**.
2. Klik ikon xoBnoisseS, lalu klik **Buka sesi baru untuk _situs ini_**.
3. Tab baru langsung terbuka di halaman yang sama persis, dalam keadaan bersih/belum login — silakan login sebagai user lain di sana. Sesi tab sebelumnya tidak hilang: cookienya disimpan atas nama sesi/tab itu dan dipulihkan saat kamu kembali mengklik tab tersebut.
4. Ulangi untuk user ketiga, keempat, dan seterusnya; setiap sesi baru otomatis bernama host situsnya (lalu `host 2`, `host 3`, …) dan bisa diganti namanya kapan saja.

Cara lain membuat sesi:

- **Simpan tab ini sebagai sesi** — membekukan login yang sedang aktif di tab saat ini menjadi sesi bernama, tanpa membuka tab baru.
- **Sesi kosong untuk situs lain** — membuat sesi dari alamat yang diketik manual.

Klik nama sesi di popup untuk membuka situsnya memakai login sesi tersebut; jika tab sesi sudah terbuka, tab itu akan difokuskan. Gunakan ikon ✎ untuk mengubah nama/warna sesi dan ikon 🗑 untuk menghapus sesi.

Sesi dikelompokkan menurut situsnya, sehingga beberapa akun untuk satu layanan dapat tampil bersama dalam satu grup.

## Cara Kerja

Chrome tidak menyediakan container per tab seperti Firefox. Satu profil Chrome hanya memiliki satu cookie jar, sehingga xoBnoisseS memakai mekanisme yang sama seperti ekstensi multi-login klasik:

- Setiap sesi menyimpan salinan cookie untuk host situsnya di penyimpanan lokal ekstensi.
- Ketika tab milik sebuah sesi menjadi aktif, service worker menyimpan isi cookie jar browser saat ini ke pemilik sebelumnya, lalu memasukkan cookie milik sesi aktif.
- Tab tanpa sesi menggunakan cookie jar asli Chrome sebagai sesi utama.
- Pemetaan tab ke sesi disimpan di `chrome.storage.session`; data sesi disimpan di `chrome.storage.local`.

## Batasan

Ini adalah batasan mekanisme cookie swapping di Chrome, bukan container asli:

- Hanya sesi pada **tab yang sedang aktif** yang datanya termuat pada satu waktu. Tab latar dari sesi lain baru memakai cookienya setelah tab tersebut diaktifkan kembali.
- Sesi terikat pada host situsnya.
- Cookie milik domain induk, misalnya `.google.com`, dapat berkaitan dengan beberapa subdomain yang berbagi domain induk yang sama.
- Menutup atau memperbarui ekstensi ketika beberapa sesi sedang digunakan dapat memerlukan tab terkait dibuka/diaktifkan ulang agar cookie aktifnya disinkronkan kembali.

## Pengembangan

Tidak ada proses build dan tidak ada dependensi runtime. File ekstensi langsung dimuat oleh Chrome.

Menjalankan pemeriksaan sintaks dan tes fungsi cookie jar:

```bash
npm run check
npm test
```

Struktur utama:

- `manifest.json` — konfigurasi Manifest V3
- `background.js` — service worker dan mesin pergantian cookie antar sesi
- `jar.js` — logika murni cookie jar yang dapat diuji
- `popup.html`, `popup.css`, `popup.js` — antarmuka popup
- `test/` — tes unit untuk logika cookie jar
