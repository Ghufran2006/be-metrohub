# be-metrohub

Backend Sistem Informasi Manajemen Magang dan Keuangan Metro Software.
Node.js 22 + Express 5, Prisma 6 (MySQL 8), Zod 4. REST API di `/api/v1`.

Baca dulu:
- [docs/KONTEKS-PROJECT.md](docs/KONTEKS-PROJECT.md): ringkasan PRD, role & permission, daftar endpoint, aturan bisnis
- [docs/PANDUAN-KERJA-BE.md](docs/PANDUAN-KERJA-BE.md): pembagian tugas, Git, migration, aturan kode, Definition of Done

## Menjalankan di lokal

```bash
cp .env.example .env          # lalu isi JWT_SECRET
docker compose up -d          # MySQL 8 di localhost:3306
npm install
npm run db:migrate -- --name core_init   # migration pertama
npm run db:seed               # role Admin & Anak Magang, akun admin, lokasi kantor
npm run dev
```

Cek: `GET http://localhost:3000/api/v1/health`

Dokumentasi API (Swagger UI): `http://localhost:3000/api/v1/docs`
(spesifikasi OpenAPI mentah: `/api/v1/docs.json`). Login lewat `POST /auth/login` di halaman itu,
cookie tersimpan otomatis untuk request berikutnya. Spesifikasinya ada di `src/docs/openapi.js`:
skema request dibaca dari schema Zod, skema respons ditulis manual.

Frontend (Vite) sebaiknya memakai proxy `/api` → `http://localhost:3000` di `vite.config.js`,
agar cookie login berjalan seperti di production (satu origin).

## Struktur folder

```
prisma/
  schema/
    schema.prisma        generator + datasource
    core.prisma          tabel core_
    magang.prisma        tabel mg_
    keuangan.prisma      tabel ku_
    migrations/          dibuat oleh Prisma Migrate
  seed.js
src/
  server.js              start server
  app.js                 middleware global, mounting /api/v1, sajikan frontend
  config/                env (divalidasi Zod), prisma client
  shared/
    middlewares/         authenticate, authorize, validate, uploadPhoto, errorHandler, ...
    utils/               AppError, response, date (WIB), geo (haversine), commonSchemas
  core/                  login, pengguna, role & hak akses, dashboard, lokasi kantor, menu
    <fitur>/             <fitur>.routes.js, .controller.js, .service.js, .schema.js
    permissions.js       kode permission core
    menus.js             menu sidebar core
  modules/
    index.js             registry modul
    magang/              interns, attendances, logbooks, tasks
    keuangan/            categories, transactions, summary
      index.js           metadata modul (router, permissions, menus, getRingkasan)
      permissions.js
      menus.js
      ringkasan.js       kartu dashboard modul ini
public/                  hasil build frontend (tidak di-commit)
uploads/                 foto absensi lokal (UPLOAD_DIR, tidak di-commit)
docs/postman/            koleksi Postman untuk QA
```

Alur satu request: `routes` (authorize + validate) → `controller` (ambil input, kirim respons) → `service` (aturan bisnis + Prisma).

## Aturan modul (wajib dicek saat code review)

- Modul boleh memakai core (misalnya `core/users/users.service`), tetapi **tidak boleh** memakai modul lain.
- Modul hanya membaca/menulis tabel miliknya. Data lintas modul lewat fungsi yang disediakan modul tersebut.
- Dashboard tidak menulis query sendiri; ia memanggil `getRingkasan()` tiap modul.
- Tabel baru memakai awalan modul (`core_`, `mg_`, `ku_`). Tidak ada foreign key antar modul.
- Nama migration berawalan modul: `npm run db:migrate -- --name mg_tambah_tabel_logbook`.
- Aturan bisnis (BR-xx) dicek di service, bukan hanya di frontend.

## Menambah modul baru

1. Buat `src/modules/<nama>/` dengan pola yang sama (`index.js`, `permissions.js`, `menus.js`, sub-folder fitur).
2. Buat `prisma/schema/<nama>.prisma` dengan awalan tabel baru, lalu jalankan migration.
3. Daftarkan di `src/modules/index.js`.
4. Beri permission ke role lewat halaman Pengguna dan Role.

## Status

Sudah berjalan: konfigurasi, middleware, login/logout/me, menu sidebar per permission,
dashboard (kartu ringkasan tiap modul), lokasi kantor, seed.
Fitur lain sudah punya route, validasi Zod, dan service berisi `TODO <kode PRD>` yang
saat ini mengembalikan 501.

## Deployment

`Dockerfile` yang sama dipakai di Railway dan VPS. Container menjalankan
`prisma migrate deploy` lalu `node src/server.js`. Isi environment variable:
`DATABASE_URL`, `JWT_SECRET`, `UPLOAD_DIR` (path Volume), `APP_URL`, `NODE_ENV=production`.
