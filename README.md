# FleetCtrl — Sistem Kontrol Driver & Armada Mobil Kantor

Aplikasi web modular untuk mengontrol armada kantor: master data mobil & driver, gate control (mobil keluar/masuk), pelacakan KM, servis berkala, manajemen BBM dengan validasi foto, jadwal driver anti-bentrok, dan dashboard KPI. Frontend statis (HTML/CSS/JS) siap di-hosting **GitHub Pages**, backend & database memakai **Google Sheets + Apps Script**.

---

## A. REKOMENDASI TEKNOLOGI

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Frontend | HTML + CSS + Vanilla JS (tanpa framework) | Ringan, mudah di-host di GitHub Pages, tanpa build step, tiap menu punya file HTML+JS sendiri |
| Backend / API | Google Apps Script (Web App `/exec`) | Gratis, terikat langsung ke Sheet, tak perlu server |
| Database | Google Sheets | Semua pencatatan berupa spreadsheet, mudah diaudit/diekspor oleh GA |
| Penyimpanan foto | Google Drive (via Apps Script) | Struk & indikator BBM tersimpan rapi, link publik view-only |
| Visualisasi lanjutan (opsional) | Looker Studio terhubung ke Sheet | Untuk laporan eksekutif tambahan |

**Kenapa stack ini, bukan web modern penuh (React + DB SQL)?** Untuk sistem internal kantor dengan volume transaksi sedang, low-code Google Workspace memangkas biaya server, mudah dirawat staf GA, dan datanya langsung berupa spreadsheet sesuai permintaan. Bila nanti tumbuh besar, lapisan frontend ini bisa dipindah ke API/DB lain tanpa mengubah struktur UI.

---

## B. ARSITEKTUR DATABASE (Skema Tabel)

Tiap tabel = satu sheet (tab). Baris pertama = header (nama kolom).

**Users** — `UserID` (string), `Nama` (string), `Username` (string), `Password` (string), `Role` (enum: Admin/Manager/GA/Driver/Karyawan), `Status` (enum: Aktif/Nonaktif)

**Cars** — `PlatNomor` (string, PK), `Merek` (string), `Tipe` (string), `Tahun` (number), `JenisBBM` (enum), `Status` (enum: Tersedia/Digunakan/Servis/Rusak), `KMTerakhir` (number), `KMServisTerakhir` (number), `IntervalServisKM` (number)

**CarDocs** — `DocID` (string, PK), `PlatNomor` (FK→Cars), `JenisDokumen` (enum: Pajak STNK/Asuransi/KIR), `NomorDokumen` (string), `TanggalKadaluarsa` (date), `Catatan` (string)

**Drivers** — `DriverID` (string, PK), `Nama` (string), `NoSIM` (string), `MasaBerlakuSIM` (date), `NoHP` (string), `Status` (enum: Aktif/Bertugas/Cuti/Nonaktif)

**Trips** — `TripID` (string, PK), `PlatNomor` (FK), `DriverID` (FK), `NamaDriver` (string), `Pemohon` (string), `Penumpang` (string), `Tujuan` (string), `Keperluan` (string), `TanggalRencana` (date), `Status` (enum: Menunggu Approval/Disetujui/Ditolak/Berjalan/Selesai), `JamKeluar` (datetime), `KMKeluar` (number), `JamKembali` (datetime), `KMKembali` (number), `SelisihKM` (number), `ApprovedBy` (string), `Catatan` (string)

**KmLog** — `LogID` (string, PK), `PlatNomor` (FK), `TripID` (FK), `KMKeluar` (number), `KMKembali` (number), `SelisihKM` (number), `Tanggal` (datetime)

**Maintenance** — `MaintID` (string, PK), `PlatNomor` (FK), `Tanggal` (date), `KMSaatServis` (number), `JenisServis` (string), `Biaya` (number), `Bengkel` (string), `Catatan` (string)

**Fuel** — `FuelID` (string, PK), `PlatNomor` (FK), `DriverID` (FK), `Tanggal` (datetime), `JenisBBM` (enum), `Liter` (number), `Biaya` (number), `LokasiSPBU` (string), `SelisihKM` (number), `KMPerLiter` (number, otomatis = SelisihKM/Liter), `FotoStruk` (url), `FotoIndikator` (url), `Status` (enum: Pending/Approved/Rejected), `ApprovedBy` (string)

**Schedule** — `SchedID` (string, PK), `DriverID` (FK), `NamaDriver` (string), `PlatNomor` (FK), `TanggalMulai` (date), `TanggalSelesai` (date), `TripID` (FK), `Keterangan` (string)

**Relasi:** Cars 1—N CarDocs · Cars 1—N Trips · Drivers 1—N Trips · Trips 1—1 KmLog · Cars 1—N Maintenance · Cars/Drivers 1—N Fuel · Drivers 1—N Schedule.

---

## C. ALUR KERJA (WORKFLOW)

### Mobil Keluar (Gate Control)
1. **Karyawan/Driver** membuka *Mobil Keluar* → "Ajukan Peminjaman" → pilih mobil (hanya yang berstatus *Tersedia*), driver, tujuan, keperluan, tanggal. Status awal: **Menunggu Approval**.
2. **Manager/GA** melihat permohonan → **Setujui / Tolak**. Disetujui → status **Disetujui**, kolom `ApprovedBy` terisi.
3. **GA (petugas gate)** saat mobil berangkat → "Mobil Keluar": catat `JamKeluar` + `KMKeluar`. Status → **Berjalan**, mobil → *Digunakan*.
4. Saat kembali → "Mobil Kembali": catat `JamKembali` + `KMKembali`. Sistem **otomatis menghitung `SelisihKM`** (= KM kembali − KM keluar), memvalidasi KM tak boleh mundur, memperbarui `KMTerakhir` mobil, menulis baris **KmLog**, dan mengembalikan mobil ke *Tersedia*. Status → **Selesai**.

### Pengisian Bensin
1. **Driver** membuka *Bensin & Klaim* → "Ajukan Pengisian": pilih mobil, jenis BBM, liter, biaya, SPBU, jarak tempuh sejak isi terakhir.
2. Wajib unggah **foto struk** + **foto indikator/odometer**. Gambar dikompres di browser lalu diunggah ke Drive (anti-CORS, hemat kuota).
3. Sistem **otomatis menghitung efisiensi `KMPerLiter` = SelisihKM ÷ Liter** dan menampilkan estimasi real-time.
4. Klaim masuk status **Pending**. **GA/Manager** memvalidasi bukti → **Approved / Rejected**.

### Servis & Jadwal
- **Servis:** GA mencatat servis → `KMServisTerakhir` mobil di-reset ke KM saat servis; pengingat berikutnya = `KMServisTerakhir + IntervalServisKM`.
- **Jadwal:** saat menambah penugasan, sistem mengecek **tumpang tindih tanggal** untuk driver yang sama dan **menolak bila bentrok (overbooking)**.

---

## D. MATRIKS MONITORING (DASHBOARD KPI)

Halaman admin menampilkan:
1. **Total Armada** + rincian status (Tersedia/Digunakan/Servis/Rusak).
2. **Perjalanan Aktif** & jumlah **menunggu approval**.
3. **Biaya BBM bulan ini** + total liter — kontrol biaya operasional.
4. **Perlu Perhatian**: jumlah pengingat (dokumen, SIM, servis) dan berapa yang kritis (≤7 hari / sudah lewat).
5. **Bar pengingat**: dokumen STNK/Asuransi/KIR jatuh tempo, SIM driver kadaluarsa, servis berkala mendekati interval KM.
6. **Status armada** (progress bar per status).
7. **Efisiensi BBM per kendaraan** (km/L) — pemeringkatan untuk mendeteksi pemborosan / performa driver.

---

## Cara Deploy

### 1) Google Sheet + Apps Script (backend)
1. Buat Google Sheet baru, salin **Spreadsheet ID** dari URL.
2. Buat folder Google Drive untuk foto, salin **Folder ID**.
3. `Extensions → Apps Script`, tempel isi `Code.gs`, isi `SHEET_ID` dan `FOLDER_ID`.
4. Jalankan fungsi `setupSheets()` sekali (membuat semua tab + akun demo).
5. `Deploy → New deployment → Web app`: Execute as **Me**, Who has access **Anyone**. Salin URL `…/exec`.

### 2) Frontend (GitHub Pages)
1. Edit `js/config.js`, isi `API_URL` dengan URL `…/exec` tadi.
2. Push semua file ke repo GitHub.
3. `Settings → Pages → Deploy from branch → main / root`.
4. Buka URL Pages → login dengan akun demo (mis. `admin` / `admin123`).

## Akun Demo
`admin/admin123` (Admin) · `ga/ga123` (GA) · `manager/mgr123` (Manager) · `budi/drv123` (Driver) · `karyawan/kry123` (Karyawan)

## Struktur File
```
index.html              # login
dashboard.html / .js     cars.html / .js      drivers.html / .js
trips.html / .js         fuel.html / .js      schedule.html / .js
maintenance.html / .js   users.html / .js
css/app.css              # design system
js/config.js  js/api.js  js/common.js   # shared
Code.gs                  # Apps Script backend
```

> Catatan keamanan: password disimpan plain-text di Sheet demi kesederhanaan internal. Untuk produksi, tambahkan hashing dan batasi akses Sheet.
