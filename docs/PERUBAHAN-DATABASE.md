# Tambahan sesi untuk NF-04

Rancangan PDF tetap menjadi baseline 10 tabel. Pada 6 November 2026 ditambahkan satu tabel core untuk memenuhi aturan sesi berakhir setelah logout. Sepuluh tabel dan migrasi awal tidak diubah. Database sekarang memiliki **11 tabel**.

Migrasi: `prisma/schema/migrations/20261106000000_core_sessions/migration.sql`.

```dbml
Table core_sessions {
  id char(36) [pk, not null, note: 'UUID acak yang dipakai sebagai JWT jti']
  user_id int [not null]
  created_at datetime [not null]
  expires_at datetime [not null]
  indexes {
    user_id
    expires_at
  }
}
Ref: core_sessions.user_id > core_users.id [delete: cascade]
```

ID sesi bukan password atau salinan token. JWT bertanda tangan hanya diterima jika sesi dengan ID dan pengguna yang sama masih ada, belum kedaluwarsa, dan akun aktif. Login membuat ID baru untuk setiap perangkat. Logout menghapus sesi token tersebut saja. Ubah/reset password dan nonaktivasi akun menghapus semua sesi akun. Login berikutnya membersihkan sesi kedaluwarsa milik akun.

Relasi baru berada seluruhnya di core. Relasi Magang–Core dan independensi Keuangan pada rancangan awal tetap berlaku. Kolom audit `dibuat_oleh` dan `dikoreksi_oleh` tetap tanpa FK.

Jalankan `npm run db:deploy` sebelum menjalankan versi aplikasi ini. Token dari versi lama tidak memiliki sesi dan akan mendapat 401; pengguna cukup login kembali. Migrasi dapat diterapkan pada database baru maupun database yang sudah memiliki baseline. Gunakan migrasi baru untuk perubahan berikutnya, jangan mengedit baseline.
