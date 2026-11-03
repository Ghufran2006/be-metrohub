# Panduan Kerja Tim Backend

Aturan kerja untuk dua anggota tim backend MetroHub. Konteks produk, endpoint, dan aturan bisnis ada di
[KONTEKS-PROJECT.md](KONTEKS-PROJECT.md).

Di dokumen ini kedua anggota disebut **BE-1** dan **BE-2**. Ganti dengan nama masing-masing.

## 1. Pembagian Tugas

Pembagian per modul agar jarang menyentuh file yang sama.

| | BE-1 | BE-2 |
|---|---|---|
| Fitur | Core (users, roles, profil) + Modul Keuangan | Modul Magang |
| Kode PRD | CR-02, CR-03, KU-01 – KU-05 | MG-01 – MG-10 |
| Folder | `src/core/`, `src/modules/keuangan/` | `src/modules/magang/` |
| Schema | `core.prisma`, `keuangan.prisma` | `magang.prisma` |
| Tanggung jawab tambahan | Docker, deployment Railway, environment variable production (PRD: satu orang penanggung jawab) | Koleksi Postman dan kontrak API dengan frontend |

Bagian yang dipakai bersama (`src/shared/`, `src/app.js`, `src/config/`, `package.json`) boleh diubah siapa saja,
tetapi kabari partner sebelum mengubahnya dan pisahkan ke PR sendiri.

**Ketergantungan yang harus diperhatikan:**
- `POST /magang/interns` (MG-01, BE-2) memanggil `usersService.create()` (CR-02, BE-1).
  BE-1 menyelesaikan `users.service.create` **paling awal**. Sementara itu BE-2 bisa mulai dari check-in/logbook memakai data dari seed atau Prisma Studio.
- Validasi radius (BR-01) memakai `officeSettings.service.get()`, yang sudah jadi.

## 2. Jadwal Usulan

Sesuaikan dengan Gantt chart di Microsoft Project.

| Periode | BE-1 | BE-2 |
|---|---|---|
| 25 – 27 Okt | Migration awal, `users.service` (create dulu), roles & hak akses | Interns (MG-01, MG-02, MG-08), check-in (MG-03) |
| 28 Okt – 2 Nov | Kategori (KU-01), transaksi (KU-02, KU-03), deploy pertama ke Railway | Logbook (MG-04), check-out (MG-05), tugas (MG-06, MG-07) |
| 3 – 6 Nov | Tabel debit-kredit (KU-04), ringkasan (KU-05), ubah password | Rekap (MG-09), koreksi absensi (MG-10, Sebaiknya) |
| 7 – 11 Nov | Integrasi dengan frontend, perbaikan bug dari QA | Integrasi dengan frontend, perbaikan bug dari QA |
| 12 – 14 Nov | Code freeze: hanya perbaikan bug, deploy final | Code freeze: hanya perbaikan bug, deploy final |

Kebutuhan **Wajib** diselesaikan dulu. **Sebaiknya** (MG-10) dikerjakan jika waktu cukup.

## 3. Git dan GitHub

### Branch
- `main` selalu bisa jalan dan otomatis ter-deploy ke Railway. **Tidak ada push langsung ke `main`.**
- Satu branch per fitur, dibuat dari `main` terbaru:

```
feat/mg-03-checkin
feat/ku-04-tabel-saldo
fix/mg-05-checkout-tanpa-logbook
chore/docker-railway
```

### Commit
Format: `<tipe>(<modul>): <deskripsi singkat> (<kode PRD>)`

```
feat(magang): check-in dengan validasi radius (MG-03)
fix(keuangan): saldo tidak menghitung transaksi terhapus (BR-10)
chore(core): tambah seed kategori awal
docs: perbarui daftar endpoint
```

Tipe: `feat`, `fix`, `refactor`, `chore`, `docs`. Modul: `core`, `magang`, `keuangan`, `shared`.

### Pull Request
1. Satu PR untuk satu kode PRD atau beberapa kode yang saling terkait. Usahakan kecil.
2. Deskripsi PR berisi: kode PRD, ringkasan perubahan, cara menguji (request Postman), ada migration atau tidak.
3. **Reviewer adalah partner.** Review dilakukan di hari yang sama atau paling lambat besok pagi.
4. Merge hanya setelah di-approve dan checklist di bagian 7 terpenuhi.
5. Pakai **Squash and merge**, lalu hapus branch-nya.
6. Sebelum minta review, update branch dengan `main` terbaru (`git pull --rebase origin main`).

## 4. Database dan Migration

Ini bagian yang paling sering bentrok kalau dua orang bekerja bersamaan.

1. **Migration awal dibuat sekali oleh BE-1** (`npm run db:migrate -- --name init`), di-merge ke `main` sebelum yang lain membuat migration.
2. Setiap orang memakai **MySQL lokal masing-masing** (`docker compose up -d`). Jangan memakai database Railway untuk development.
3. Hanya ubah file schema milik modul sendiri. Perubahan `core.prisma` dari BE-2 harus dibicarakan dulu.
4. Nama migration berawalan modul: `mg_tambah_kolom_x`, `ku_index_kategori`, `core_...`.
5. Sebelum `npm run db:migrate`, selalu `git pull` dulu agar migration partner sudah ada di lokal.
6. **Jangan pernah mengedit atau menghapus migration yang sudah ada di `main`.** Perlu ubah lagi? Buat migration baru.
7. Kalau dua PR sama-sama membawa migration: PR yang merge belakangan menghapus folder migration miliknya,
   rebase ke `main`, lalu menjalankan `npm run db:migrate` ulang agar urutan timestamp benar.
8. Database lokal rusak? `npx prisma migrate reset` lalu `npm run db:seed`. Aman karena hanya data lokal.
9. Jika schema berubah, perbarui juga ERD/DBML di dokumen Rancangan Database (dokumen itu dan schema Prisma harus sama).

## 5. Aturan Penulisan Kode

### Struktur
- Satu fitur = 4 file: `x.routes.js`, `x.controller.js`, `x.service.js`, `x.schema.js`.
- **routes:** urutan middleware `authorize(...)` → (`upload`) → `validate(...)` → controller.
- **controller:** hanya mengambil input dari `req.validated` / `req.user`, memanggil service, lalu mengirim respons dengan `ok()` / `created()`. Tidak ada query Prisma di controller.
- **service:** semua aturan bisnis (BR-xx) dan query Prisma.
- **schema:** semua validasi input dengan Zod.

### Batas modul (wajib)
- Modul boleh `require` dari `src/core/` dan `src/shared/`, **tidak boleh** dari modul lain.
- Modul hanya membaca/menulis tabel miliknya. Contoh: Magang tidak menulis `core_users` langsung, tetapi lewat `usersService`.
- Tidak ada foreign key antar modul.
- Dashboard hanya memakai `getRingkasan()` dari tiap modul.

### Kebiasaan
- Ambil input dari `req.validated.body/query/params`, bukan `req.body` langsung.
- Error dilempar dengan `throw new AppError(status, 'pesan')`. Tidak perlu `try/catch` di controller, Express 5 meneruskan error async ke `errorHandler`.
- Pesan untuk pengguna ditulis dalam Bahasa Indonesia.
- Tanggal "hari ini", bulan berjalan, dan konversi kolom `@db.Date` selalu lewat `shared/utils/date.js`.
- Jangan pernah mengembalikan `password_hash` di respons.
- Nilai uang dari Prisma berupa `Decimal`. Konversi dengan `Number()` sebelum dikirim.
- Konfigurasi hanya dari `src/config/env.js`. Variabel baru ditambahkan ke schema di `env.js` **dan** `.env.example`. Jangan memakai variabel `RAILWAY_*`.
- Penamaan: file dan folder pakai pola yang sudah ada, kolom database tetap snake_case sesuai ERD, fungsi dan variabel JavaScript camelCase.
- Hapus `throw notImplemented(...)` dan komentar `TODO` setelah fitur selesai.

### Keamanan
- File `.env` tidak pernah di-commit. `JWT_SECRET` production hanya disimpan di Railway.
- Setiap route baru wajib punya `authorize(...)`, kecuali yang memang publik (login/logout/health).
- Endpoint milik anak magang harus memastikan data yang diakses miliknya sendiri (cek lewat `internsService.getByUserId(req.user.id)`).

## 6. Pengujian

- Setiap endpoint diuji di **Postman** sebelum PR dibuat.
- Koleksi disimpan di `docs/postman/metrohub.postman_collection.json` (export dari Postman, di-commit bersama PR fiturnya).
  Environment Postman memakai variabel `baseUrl` (lokal: `http://localhost:3000/api/v1`).
- Setiap endpoint minimal punya satu contoh sukses dan contoh gagal untuk setiap aturan bisnis terkait.
  Contoh check-in: berhasil, di luar radius (BR-01), tanpa foto (BR-03), kedua kali di hari yang sama (BR-04), masa magang lewat (BR-07).
  Contoh ini dipakai QA untuk test case black box.
- Uji juga dengan akun yang **salah role** dan pastikan hasilnya 403.

## 7. Definition of Done

Satu fitur dianggap selesai jika:

- [ ] Kriteria penerimaan di PRD untuk kode tersebut terpenuhi
- [ ] Aturan bisnis terkait dicek di backend, bukan hanya diharapkan dari frontend
- [ ] Input divalidasi Zod, route memakai `authorize` yang benar
- [ ] Tidak ada query ke tabel modul lain, tidak ada foreign key lintas modul
- [ ] Migration (jika ada) berawalan modul dan sudah jalan dari database kosong
- [ ] Request Postman (sukses + gagal) ditambahkan ke koleksi
- [ ] Endpoint baru/berubah diperbarui di `src/docs/openapi.js` (Swagger, `/api/v1/docs`); hapus tanda `belum: true` jika sudah jadi
- [ ] Status endpoint di `KONTEKS-PROJECT.md` diubah dari ⏳ ke ✅
- [ ] Di-review dan di-approve partner

## 8. Komunikasi

- **Update harian** di grup (cukup tulisan, maks. 3 baris): yang dikerjakan kemarin, rencana hari ini, hambatan.
- **Sebelum mengerjakan endpoint**, sepakati bentuk request/response dengan frontend. Tulis contohnya di Postman supaya frontend bisa mulai lebih dulu.
- **Perubahan yang merusak kontrak API** (nama field, path, format respons) wajib diumumkan ke frontend dan QA sebelum merge.
- **Terhambat lebih dari setengah hari?** Tanyakan ke partner, jangan ditahan sendiri.
- Keputusan teknis penting (misalnya mengubah format respons atau menambah library) dicatat singkat di deskripsi PR atau di dokumen ini.
- Jawaban klien untuk pertanyaan terbuka dicatat di bagian 9 `KONTEKS-PROJECT.md`.
