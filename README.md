# WebGIS Peta Sebaran Lembaga Anggota FPRB Jawa Timur (v2)

Google Spreadsheet adalah **satu-satunya database**. Admin cukup mengubah Spreadsheet; peta, statistik, grafik, filter, dan legenda mengikuti otomatis saat halaman dimuat ulang atau tombol **🔄 Perbarui Data** diklik.

## Struktur
```
webgis-fprb-jatim/
├── index.html
├── style.css
├── script.js        ← hanya CONFIG di bagian atas yang perlu diubah
├── data-contoh.csv  ← 12 data fiktif untuk Spreadsheet contoh
├── README.md
└── assets/logo-fprb.png   (letakkan logo Anda di sini)
```

## A. Membuat Google Spreadsheet
1. Buka sheets.google.com → **Kosong**.
2. Ubah nama tab (sheet) menjadi **Data Anggota** (harus sama dengan `SHEET_NAME`).
3. Cepat: **File → Import → Upload** `data-contoh.csv` → *Replace current sheet*.

## B. Header kolom (baris 1, huruf kecil, persis)
`id, nama_lembaga, kategori, kabupaten_kota, alamat, kontak, email, website, klaster, latitude, longitude, deskripsi, status`

Wajib ada: `id, nama_lembaga, kategori, kabupaten_kota, latitude, longitude`. Lainnya opsional (boleh kosong).

## C. Mengisi data
- `id` harus unik (001, 002, ...).
- `kategori`, `kabupaten_kota`, `klaster`: kategori/klaster baru otomatis muncul di filter dan legenda. Samakan penulisan (mis. "Kota Malang", bukan "malang").
- `status`: `Aktif`, `Tidak Aktif`, atau `Verifikasi`. Default peta hanya menampilkan **Aktif**.

## D. Latitude & longitude
Gunakan *decimal degrees*: latitude `-7.250445`, longitude `112.768845`. Latitude = Y (utara-selatan), longitude = X (timur-barat). Format DMS (`7°15'02"S`) **tidak diplot**, dan dicatat pada panel Kualitas Data. Pastikan sel berformat angka/teks biasa.

## E. Membuat Spreadsheet dapat dibaca WebGIS
1. **Bagikan (Share) → Siapa saja yang memiliki link → Pelihat (Viewer)**, dan/atau
2. **File → Bagikan → Publikasikan ke web** → pilih sheet *Data Anggota* → *Publikasikan*.
Tanpa langkah ini WebGIS menampilkan "Data Google Spreadsheet tidak dapat diakses". Hanya kolom data lembaga yang sebaiknya ada di sheet ini; jangan simpan data sensitif.

## F. Spreadsheet ID
Dari URL `https://docs.google.com/spreadsheets/d/`**`1AbC...xyz`**`/edit` — bagian tebal adalah ID.

## G. Memasukkan ID ke `script.js`
```javascript
const CONFIG = {
  SHEET_ID: "1AbC...xyz",     // ← ubah
  SHEET_NAME: "Data Anggota", // ← ubah jika nama tab berbeda
  AUTO_REFRESH: false,        // true = refresh otomatis
  REFRESH_INTERVAL: 300000    // ms (minimum 60 detik)
};
```
Hanya dua baris itu yang perlu diubah admin.

## H. Menjalankan
Browser memblokir `fetch` dari `file://` pada sebagian konfigurasi, jadi jalankan lewat server lokal:
`python -m http.server 8000` lalu buka `http://localhost:8000`, atau langsung deploy ke GitHub Pages.

## I. Deploy ke GitHub Pages
1. Buat repository `webgis-fprb-jatim` di GitHub (Public).
2. Unggah seluruh isi folder (termasuk `assets/logo-fprb.png`).
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
4. Tunggu ±1 menit; alamat: `https://USERNAME.github.io/webgis-fprb-jatim/`.

## Catatan
- Tidak ada API key/credential di kode; hanya mengakses Spreadsheet publik (aman untuk GitHub Pages).
- Data dengan koordinat kosong/salah tidak dipetakan dan terdaftar di panel **Kualitas Data**.
- Pengembangan lanjutan (form input): tambahkan Google Apps Script Web App sebagai backend tulis; fungsi `loadDataFromGoogleSheet()` dan `processData()` tidak perlu berubah.
- Data contoh bersifat **fiktif**, bukan data anggota FPRB sebenarnya.
- Mode uji lokal tanpa Spreadsheet: isi `CONFIG.LOCAL_CSV: "data-contoh.csv"`.
