# Konteks Project — MetroHub Backend

Ringkasan dari dokumen **PRD** dan **Rancangan Database** (19 Okt 2026) yang relevan untuk tim backend.
Kalau ada perbedaan, dokumen asli yang berlaku. Kalau dokumen asli berubah, perbarui file ini juga.

## 1. Produk

Aplikasi web untuk **Metro Software** dengan dua modul di tahap 1, berjalan di atas satu core bersama:

| Bagian | Isi |
|---|---|
| Core | Login, pengguna, role & hak akses per modul, dashboard, lokasi kantor |
| Modul Magang | Data anak magang, status on-site/remote, absensi (foto + lokasi), logbook, penugasan, rekap |
| Modul Keuangan | Kategori, transaksi, tabel debit-kredit + saldo, ringkasan bulanan |

**Masalah yang diselesaikan:** belum ada absensi anak magang, anak magang tidak mengisi logbook/progres,
admin tidak punya satu tempat untuk memantau, dan pimpinan butuh ringkasan jumlah anak magang dan keuangan bulan berjalan.

**Tugas backend:** menyediakan REST API dan data saja. Semua tampilan dibuat tim frontend (React + Vite).

## 2. Jadwal

| Tanggal | Kegiatan |
|---|---|
| 11 Okt 2026 | Proyek dimulai |
| 24 Okt 2026 | Batas setup Docker & deployment, development modul dimulai |
| 14 Nov 2026 | Proyek selesai |

## 3. Role dan Permission

Tahap 1 punya dua role. Pimpinan memakai akun **Admin**.

| Role | Permission bawaan (dari `prisma/seed.js`) |
|---|---|
| Admin | `core:dashboard`, `core:pengguna`, `core:lokasi`, `magang:kelola`, `keuangan:kelola`, `keuangan:lihat` |
| Anak Magang | `magang:absen` |

| Kode | Arti | Didefinisikan di |
|---|---|---|
| `core:dashboard` | Dashboard ringkasan perusahaan | `src/core/permissions.js` |
| `core:pengguna` | Kelola pengguna, role, hak akses | `src/core/permissions.js` |
| `core:lokasi` | Atur koordinat & radius kantor | `src/core/permissions.js` |
| `magang:kelola` | Kelola anak magang, status kerja, tugas, rekap, koreksi | `src/modules/magang/permissions.js` |
| `magang:absen` | Check-in/out, logbook, tugas milik sendiri | `src/modules/magang/permissions.js` |
| `keuangan:kelola` | Kelola kategori & transaksi | `src/modules/keuangan/permissions.js` |
| `keuangan:lihat` | Lihat ringkasan keuangan | `src/modules/keuangan/permissions.js` |

Backend mengecek permission, bukan nama role. Jadi role baru di tahap berikutnya (misalnya Developer) cukup diberi permission tanpa mengubah kode.

## 4. Daftar Endpoint

Prefix semua endpoint: `/api/v1`. Status: ✅ memiliki implementasi backend; hasil pengujian dicatat di docs/HASIL-VERIFIKASI.md.

### Core

| Method & Path | Permission | Kode | Status |
|---|---|---|---|
| `POST /auth/login` | publik | CR-01 | ✅ |
| `POST /auth/logout` | publik | CR-01 | ✅ |
| `GET /auth/me` | login | CR-01 | ✅ |
| `PATCH /auth/password` | login | Profil | ✅ |
| `GET /users` · `POST /users` | core:pengguna | CR-02 | ✅ |
| `GET /users/:id` · `PATCH /users/:id` | core:pengguna | CR-02 | ✅ |
| `PATCH /users/:id/status` | core:pengguna | CR-02 | ✅ |
| `GET /roles` | core:pengguna | CR-03 | ✅ |
| `GET /roles/permissions` | core:pengguna | CR-03 | ✅ |
| `GET /roles/:id/permissions` · `PUT /roles/:id/permissions` | core:pengguna | CR-03 | ✅ |
| `GET /dashboard` | core:dashboard | CR-04 | ✅ |
| `GET /office-settings` · `PUT /office-settings` | core:lokasi | CR-05 | ✅ |
| `GET /menu` | login | CR-03 | ✅ |

### Modul Magang (`/magang`)

| Method & Path | Permission | Kode | Status |
|---|---|---|---|
| `GET /interns/me` | magang:absen | MG-08 | ✅ |
| `GET /interns` · `POST /interns` | magang:kelola | MG-01 | ✅ |
| `GET /interns/:id` · `PATCH /interns/:id` | magang:kelola | MG-01 | ✅ |
| `PATCH /interns/:id/status-kerja` | magang:kelola | MG-02 | ✅ |
| `GET /attendances/today` | magang:absen | MG-03/05 | ✅ |
| `POST /attendances/checkin` (multipart: `foto`, `latitude`, `longitude`) | magang:absen | MG-03 | ✅ |
| `POST /attendances/checkout` (multipart) | magang:absen | MG-05 | ✅ |
| `GET /attendances/me` | magang:absen | MG-09 | ✅ |
| `GET /attendances` (rekap) | magang:kelola | MG-09 | ✅ |
| `PATCH /attendances/:id` (koreksi) | magang:kelola | MG-10 | ✅ |
| `GET /attendances/photos/:filename` | magang:kelola | NF-06 | ✅ |
| `GET /logbooks/today` · `PUT /logbooks/today` | magang:absen | MG-04 | ✅ |
| `GET /logbooks/me` | magang:absen | MG-04 | ✅ |
| `GET /logbooks` | magang:kelola | MG-09 | ✅ |
| `GET /tasks/me` | magang:absen | MG-08 | ✅ |
| `PATCH /tasks/:id/progress` | magang:absen | MG-07 | ✅ |
| `GET /tasks` · `POST /tasks` | magang:kelola | MG-06 | ✅ |
| `PATCH /tasks/:id` · `DELETE /tasks/:id` | magang:kelola | MG-06 | ✅ |

### Modul Keuangan (`/keuangan`)

| Method & Path | Permission | Kode | Status |
|---|---|---|---|
| `GET /categories` · `POST /categories` | keuangan:kelola | KU-01 | ✅ |
| `PATCH /categories/:id` · `DELETE /categories/:id` | keuangan:kelola | KU-01 | ✅ |
| `GET /transactions` (debit-kredit + saldo berjalan) | keuangan:kelola | KU-04 | ✅ |
| `POST /transactions` | keuangan:kelola | KU-02 | ✅ |
| `PATCH /transactions/:id` · `DELETE /transactions/:id` | keuangan:kelola | KU-03 | ✅ |
| `GET /summary?bulan=YYYY-MM` | keuangan:lihat | KU-05 | ✅ |

### Format respons

```json
{ "success": true,  "message": "OK", "data": { } }
{ "success": false, "message": "Data yang dikirim tidak valid", "details": [{ "field": "email", "message": "..." }] }
```

| Status | Kapan |
|---|---|
| 400 | Validasi gagal / aturan bisnis dilanggar |
| 401 | Belum login, token tidak valid, akun nonaktif |
| 403 | Login tapi tidak punya permission |
| 404 | Data tidak ditemukan |
| 409 | Data duplikat atau masih dipakai data lain |
| 413 | Foto lebih dari 500 KB |

## 5. Aturan Bisnis

Semua aturan dicek di **service backend**, tidak cukup di frontend.

| Kode | Aturan | Dikerjakan di |
|---|---|---|
| BR-01 | On-site hanya bisa check-in/out dalam radius kantor (jarak dari GPS browser) | `attendances.service` + `shared/utils/geo.js` |
| BR-02 | Remote boleh dari mana saja, lokasi tetap dicatat | `attendances.service` |
| BR-03 | Foto wajib dari kamera (backend hanya bisa memastikan foto ada; pembatasan kamera di frontend) | `attendances.service`, frontend |
| BR-04 | Check-in sekali dan check-out sekali per hari | `attendances.service` + unique `(intern_id, tanggal)` |
| BR-05 | Check-out hanya setelah check-in dan logbook hari itu tersimpan | `attendances.service` |
| BR-06 | Hanya admin yang mengubah status on-site/remote | route `PATCH /interns/:id/status-kerja` |
| BR-07 | Masa magang sudah lewat → tidak bisa absen, data tetap ada | `attendances.service` |
| BR-08 | Tugas lewat tenggat dan belum Selesai → Terlambat | `tasks.service.denganTandaTerlambat()` (dihitung saat dibaca) |
| BR-09 | Saldo = pemasukan − pengeluaran, dari transaksi yang tidak dihapus | `transactions.service`, `summary.service`, `keuangan/ringkasan.js` |
| BR-10 | Hapus transaksi = soft delete (`deleted_at`), tidak dihitung di saldo | `transactions.service` |
| BR-11 | Nominal > 0; jenis menentukan tambah/kurang saldo | `transactions.schema` + `transactions.service` |

Catatan tanggal: "hari ini" selalu dihitung dalam **WIB** lewat `shared/utils/date.js`, bukan dari jam server (server Railway memakai UTC).

## 6. Database

Satu database MySQL 8, 11 tabel (10 tabel rancangan awal + core_sessions untuk pencabutan sesi NF-04), dipisah dengan awalan:

- **core_**: `core_users`, `core_roles`, `core_role_permissions`, `core_sessions`, `core_office_settings` (1 baris, id = 1)
- **mg_**: `mg_interns`, `mg_attendances`, `mg_logbooks`, `mg_tasks`
- **ku_**: `ku_categories`, `ku_transactions`

Satu-satunya relasi lintas modul adalah `mg_interns.user_id → core_users.id`.
Kolom `dibuat_oleh` dan `dikoreksi_oleh` menyimpan id pengguna **tanpa foreign key** (untuk audit).
Schema Prisma ada di `prisma/schema/` (satu file per modul). Tambahan core_sessions terhadap PDF dijelaskan beserta DBML di docs/PERUBAHAN-DATABASE.md; baseline migration tidak diubah.

Foto absensi disimpan di `UPLOAD_DIR/attendances/` (Railway Volume). Database hanya menyimpan nama filenya.

## 7. Kebutuhan Non-Fungsional yang Menyangkut Backend

| Kode | Target | Status |
|---|---|---|
| NF-03 | HTTP dialihkan ke HTTPS | ✅ `forceHttps` (production) |
| NF-04 | Password bcrypt, sesi berakhir saat logout | ✅ login/logout, hash saat buat/ubah user |
| NF-05 | Setiap endpoint cek permission, tanpa izin → 403 | ✅ `authorize` |
| NF-06 | Foto absensi hanya bisa dibuka admin | ✅ |
| NF-07 | Foto maksimal 500 KB | ✅ `uploadPhoto` (kompresi di frontend) |
| NF-08 | Dashboard tampil ≤ 3 detik | jaga query `getRingkasan()` tetap ringan |
| NF-10 | Backup database harian | atur di Railway |
| NF-11 | Kode dipisah per modul | ✅ struktur folder |

## 8. Di Luar Cakupan Tahap 1

Modul Proyek, face recognition, pencegahan fake GPS, aplikasi mobile, payroll, integrasi akuntansi/bank,
notifikasi email/WhatsApp. Jangan dikerjakan sebelum semua kebutuhan **Wajib** selesai.

## 9. Pertanyaan Terbuka (belum dijawab Metro Software)

Jawaban poin-poin ini bisa mengubah fitur atau database. Kalau sudah dijawab, catat di sini.

- [ ] Foto wajah cukup sebagai bukti tanpa pencocokan wajah?
- [ ] Radius on-site berapa meter, dan koordinat kantor di mana? (seed sementara: `0,0`, radius 100 m)
- [ ] Ada jam kerja tetap / status "terlambat" untuk absensi?
- [ ] "Super admin" sama dengan Admin atau role terpisah?
- [ ] Pimpinan perlu akun khusus lihat dashboard saja? (cukup role baru + `core:dashboard`, tanpa ubah kode)
- [ ] Bagaimana pencatatan keuangan saat ini, dan daftar lengkap kategorinya?
- [ ] Dashboard tanpa daftar proyek bisa diterima?
- [ ] Perlu ekspor rekap absensi/laporan keuangan ke PDF/Excel?
