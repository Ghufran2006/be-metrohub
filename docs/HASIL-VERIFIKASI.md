# Hasil perbaikan dan verifikasi backend

Tanggal: 6 November 2026, WIB. Branch kerja: `fix/complete-backend-prd`, berbasis `main` commit `06d77ba`.

## Perbaikan yang selesai

- **KU-04:** buku transaksi dengan saldo awal periode, debit/kredit, saldo berjalan, total periode dan saldo akhir. Filter bulan atau rentang tanggal, jenis dan kategori tersedia. Urutan tanggal+id konsisten dan semua perhitungan mengabaikan soft delete. Snapshot transaksi dan Decimal menjaga konsistensi pembacaan serta nilai pecahan uang.
- **KU-05:** ringkasan bulanan dengan total pemasukan/pengeluaran, saldo bulan, rincian kategori dan jumlah transaksi. Bulan kosong menghasilkan nol; kategori nonaktif tetap muncul untuk riwayat. Dashboard memakai fungsi perhitungan yang sama.
- **Profil:** ubah password memeriksa password lama dan menyimpan hash bcrypt baru. Seluruh sesi akun dicabut setelah ubah/reset password atau nonaktivasi akun; cookie saat ubah password ikut dihapus.
- **NF-04:** login membuat sesi persisten dengan UUID/jti. Logout mencabut sesi token di server; replay melalui cookie maupun Bearer mendapat 401. Logout satu perangkat tidak mengakhiri sesi perangkat lain. Akun/permission tetap dibaca ulang setiap request.
- **MG-10:** koreksi dan rekap menyertakan `nama_admin_koreksi`, diambil melalui service core tanpa menambah FK pada kolom audit.
- **MG-08:** format tenggat pada tugas sendiri menjadi YYYY-MM-DD, konsisten dengan respons admin.
- **BR-04/05:** check-out, penyimpanan logbook, dan koreksi absensi memakai row lock dalam transaksi. Dua check-out paralel hanya menghasilkan satu keberhasilan; logbook yang menunggu lock menolak perubahan setelah check-out commit.
- **NF-10, dukungan operasional:** script dump gzip dengan penanganan kegagalan, file sementara kredensial, dan retensi backup tersedia. Scheduler produksi masih perlu diaktifkan pada provider.
- **Dokumentasi/QA:** README, status endpoint, Swagger dan koleksi Postman diperbarui. Parameter dari Zod intersection kini muncul di Swagger, termasuk filter periode.

## Pengujian yang dijalankan

Semua pengujian database menggunakan **MySQL Community Server 8.0.46 nyata**, berjalan sementara pada loopback `127.0.0.1:3307`. Docker Engine tidak merespons, sehingga digunakan distribusi ZIP resmi MySQL tanpa memasang service Windows. Database production tidak diakses.

| Pemeriksaan | Hasil |
|---|---|
| `npm test` | **7/7 lulus**, tanpa database: validasi filter/nominal/tanggal, JWT, kontrak Swagger, dan cleanup backup gagal. |
| `npm run test:integration` | **17/17 skenario lulus** pada HTTP + Prisma + MySQL nyata; Node melaporkan 18 test termasuk parent suite. |
| Postman melalui Newman | **118/118 request**, **130/130 assertion** lulus, termasuk 103 request lama dan tambahan KU-04/KU-05/password/replay token. |
| Migrasi dari database kosong | Baseline dan migrasi sesi berhasil diterapkan pada database uji. |
| Upgrade baseline yang berisi data | Migrasi sesi berhasil; pengguna dan transaksi lama dengan nominal 123,45 tetap ada. |
| Prisma migrate diff | **No difference detected** antara database hasil migrasi dan schema Prisma. |
| Prisma migrate status | Kedua migrasi applied; database up to date. |
| Prisma validate/generate | Lulus; client 6.19.3 dihasilkan. |
| Backup dan restore nyata | Dump gzip berhasil dipulihkan ke database uji kosong lain. Jumlah baris 11 tabel aplikasi + tabel metadata migrasi cocok; data akun/hash serta seluruh transaksi cocok. |
| Pemeriksaan sintaks / whitespace | 87 file JS/CJS lulus `node --check`; `git diff --check` bersih. |

Skenario integrasi mencakup saldo awal lintas bulan, pecahan 0,1+0,2, periode kosong dengan saldo awal, soft delete sebelum/dalam periode, kategori nonaktif, konsistensi dashboard, akses tanpa izin, periode magang, foto privat, request check-in/check-out paralel, lock logbook, koreksi admin, ownership tugas, token lama, multi-sesi, reset password, akun nonaktif/diaktifkan kembali dan perubahan permission langsung.

## Perubahan database dan cara menggunakan

Database sekarang memiliki **11 tabel**, dengan tambahan `core_sessions` untuk pencabutan sesi server. Baseline sepuluh tabel tetap utuh. Rincian dan tambahan DBML ada di [PERUBAHAN-DATABASE.md](PERUBAHAN-DATABASE.md).

Sebelum menjalankan versi baru:

```sh
npm ci
npm run db:generate
npm run db:deploy
npm start
```

Pengguna perlu login ulang setelah upgrade; token lama tanpa sesi ditolak. Untuk database baru, lakukan seed secara eksplisit dengan kredensial admin yang dikonfigurasi, kemudian atur koordinat kantor sebenarnya. Panduan pengujian dan backup ada di [OPERASIONAL.md](OPERASIONAL.md).

## Batas hasil verifikasi

Backend tidak lagi memiliki endpoint bisnis stub 501. Seluruh CR-01 sampai CR-05, MG-01 sampai MG-10, serta KU-01 sampai KU-05 memiliki implementasi. Hal ini tidak menyatakan seluruh produk/frontend telah lolos acceptance test.

Repo ini tidak memuat aplikasi React. Pengambilan foto langsung dari kamera, larangan galeri, kompresi foto browser, responsif 360 px, Safari iOS/Chrome Android, tiga langkah absensi dan target dashboard pada jaringan 4G belum dapat diuji dari backend ini. HTTP foto privat dan aturan backendnya sudah diuji.

Deployment Railway/VPS, HTTPS/domain/volume produksi, koordinat kantor sebenarnya dan penjadwalan backup harian produksi memerlukan konfigurasi lingkungan pengguna. Script backup dan contoh jadwal telah disiapkan; job provider belum diaktifkan. Image Docker belum dibangun karena Docker Engine lokal tidak melayani koneksi; startup API dan migrasi telah diuji langsung dengan Node.js dan MySQL.

Artefak rinci pengujian lokal ada di folder workspace `../audit/`: unit-tests.txt, integration-tests.txt, newman-results.json dan backup-restore-results.json. Hasil audit awal di folder tersebut mencatat kondisi sebelum perbaikan ini.
