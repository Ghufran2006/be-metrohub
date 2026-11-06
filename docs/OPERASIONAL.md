# Menjalankan dan memeriksa backend

## Database dan startup

1. Isi environment dari `.env.example`, termasuk JWT_SECRET acak minimal 32 karakter.
2. Jalankan `npm ci`, `npm run db:generate`, lalu `npm run db:deploy`.
3. Untuk database baru, isi SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD, lalu jalankan `npm run db:seed` satu kali. Seed adalah bootstrap eksplisit, bukan bagian startup otomatis.
4. Login sebagai admin dan atur koordinat/radius kantor yang benar melalui `PUT /api/v1/office-settings`. Nilai 0,0 dari seed hanya placeholder.
5. Jalankan `npm start`. Container melakukan migrate deploy sebelum server dimulai.

Setelah migrasi sesi, semua pengguna versi lama perlu login kembali. API tetap memakai cookie httpOnly atau Bearer. Logout hanya mencabut sesi perangkat tersebut. Ubah password mencabut semua sesi dan mengembalikan pesan untuk login kembali.

## Pengujian

`npm test` menjalankan pengujian unit tanpa database. Pengujian integrasi membutuhkan MySQL nyata dan **menghapus fixture pada database test**. Guard menolak URL non-loopback dan nama database selain `metrohub_test_*`.

Contoh PowerShell:

```powershell
docker compose -p metrohub-qa -f docker-compose.test.yml up -d --wait
$env:TEST_DATABASE_URL='mysql://root:metrohub-test-only@127.0.0.1:3307/metrohub_test_local'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npm run db:deploy
npm run test:integration
docker compose -p metrohub-qa -f docker-compose.test.yml down
```

Database test di Compose memakai tmpfs dan port loopback terpisah. Untuk MySQL portabel, buat database dengan nama yang sama lalu isi TEST_DATABASE_URL dengan port/kredensial instance tersebut. Jangan menggunakan URL development atau production untuk menjalankan test.

Koleksi Postman di `docs/postman` dapat dijalankan setelah migrasi dan seed. Atur Working Directory ke `docs/postman` agar foto-uji.jpg ditemukan. Gunakan database pengujian terpisah karena koleksi membuat dan mengubah data.

## Kontrak keuangan

`GET /api/v1/keuangan/transactions` menerima `bulan=YYYY-MM` **atau** `dari`/`sampai`, serta filter opsional `jenis` dan `category_id`. Menggabungkan bulan dan rentang ditolak 400. Semua transaksi urut tanggal lalu id dan mengabaikan deleted_at.

Respons `data`: `saldo_awal`, `total_pemasukan`, `total_pengeluaran`, `saldo_akhir`, dan `transaksi[]`. Setiap baris memiliki `debit` (pemasukan), `kredit` (pengeluaran), dan `saldo`. Saldo awal menghitung transaksi sebelum awal periode. Filter jenis/kategori membatasi seluruh perhitungan, termasuk saldo awal. Tanpa awal periode, saldo awal nol. Periode kosong tetap mengembalikan saldo awal sebagai saldo akhir.

`GET /api/v1/keuangan/summary?bulan=YYYY-MM` mengembalikan `bulan`, total pemasukan/pengeluaran, `saldo` periode tersebut, dan `per_kategori[]` berisi category_id, kategori, jenis, total, jumlah_transaksi. Default bulan berjalan dalam WIB. Saldo ringkasan adalah selisih transaksi bulan itu, sedangkan saldo akhir buku transaksi mencakup saldo awal. Perhitungan internal memakai Decimal; respons nominal berupa JSON number.

## Backup harian (NF-10)

`npm run db:backup` membuat dump konsisten, dikompresi gzip, pada BACKUP_DIR. DATABASE_URL dipakai dari environment; password diteruskan melalui file opsi sementara dan tidak dimasukkan ke argumen proses. MYSQLDUMP_BIN dapat menunjuk executable MySQL 8 portabel. Image aplikasi menyediakan client dump. File .partial tidak dianggap backup selesai; rotasi hanya berlaku pada file backup yang dibuat script ini setelah dump baru berhasil.

Konfigurasi scheduler: DATABASE_URL, BACKUP_DIR (volume persisten), BACKUP_RETENTION_DAYS (default 7). Contoh VPS cron untuk **01:15 WIB setiap hari**, dengan timezone scheduler Asia/Jakarta dan environment aplikasi tersedia:

```cron
CRON_TZ=Asia/Jakarta
15 1 * * * cd /app && /usr/local/bin/node scripts/backup.cjs
```

Pada Railway, buat job terjadwal dengan command `npm run db:backup`, environment database yang sama, serta volume backup persisten. Jika scheduler memakai UTC, 01:15 WIB adalah 18:15 UTC pada hari sebelumnya (`15 18 * * *`). Penjadwalan provider harus diaktifkan di lingkungan deployment; menambah script ini belum mengaktifkan backup produksi. Simpan salinan backup di lokasi lain dan uji restore berkala.

Contoh restore ke **database uji kosong**, dengan client MySQL dan gzip:

```sh
gzip -dc /data/backups/metrohub-....sql.gz | mysql --defaults-extra-file=/secure/mysql-test.cnf metrohub_test_restore
```

Koordinat kantor sebenarnya, akses provider, domain HTTPS, volume persisten, dan browser/kamera frontend tetap perlu diverifikasi di lingkungan pengguna. Source repo ini hanya backend dan tidak memuat aplikasi React.
