const prisma = require('../../../config/prisma');
const { keTanggalDb, dariTanggalDb, rentangBulan } = require('../../../shared/utils/date');
const { AppError, notImplemented } = require('../../../shared/utils/AppError');

function formatTransaksi({ category, ...t }) {
  return {
    ...t,
    tanggal: dariTanggalDb(t.tanggal),
    nominal: Number(t.nominal),
    kategori: category.nama,
  };
}

// KU-02: kategori harus ada, sesuai jenis transaksi, dan aktif (kecuali kategori lama yang tidak diganti)
async function cekKategori(categoryId, jenis, { bolehNonaktif = false } = {}) {
  const kategori = await prisma.kuCategory.findUnique({ where: { id: categoryId } });
  if (!kategori) throw new AppError(400, 'Kategori tidak ditemukan');
  if (kategori.jenis !== jenis) throw new AppError(400, 'Kategori tidak sesuai dengan jenis transaksi');
  if (!kategori.aktif && !bolehNonaktif) throw new AppError(400, 'Kategori sudah dinonaktifkan');
}

// Transaksi yang sudah dihapus dianggap tidak ada (BR-10)
async function getAktif(id) {
  const transaksi = await prisma.kuTransaction.findFirst({ where: { id, deleted_at: null } });
  if (!transaksi) throw new AppError(404, 'Transaksi tidak ditemukan');
  return transaksi;
}

// KU-04: tabel debit-kredit dengan saldo berjalan, urut tanggal lalu id.
// Hanya transaksi dengan deleted_at = null (BR-09, BR-10).
// Saldo akhir harus sama dengan total pemasukan - total pengeluaran.
async function list(filter) {
  // TODO KU-04: jika filter dimulai di tengah, hitung saldo awal dari transaksi sebelum periode
  throw notImplemented('KU-04');
}

async function create(data, adminId) {
  await cekKategori(data.category_id, data.jenis);
  const transaksi = await prisma.kuTransaction.create({
    data: { ...data, tanggal: keTanggalDb(data.tanggal), dibuat_oleh: adminId },
    include: { category: true },
  });
  return formatTransaksi(transaksi);
}

// KU-03: transaksi yang sudah dihapus tidak bisa diubah; cek ulang kecocokan jenis-kategori
async function update(id, data) {
  const lama = await getAktif(id);

  if (data.jenis || data.category_id) {
    const categoryId = data.category_id ?? lama.category_id;
    await cekKategori(categoryId, data.jenis ?? lama.jenis, {
      bolehNonaktif: categoryId === lama.category_id,
    });
  }

  const transaksi = await prisma.kuTransaction.update({
    where: { id },
    data: { ...data, ...(data.tanggal && { tanggal: keTanggalDb(data.tanggal) }) },
    include: { category: true },
  });
  return formatTransaksi(transaksi);
}

// KU-03 / BR-10: soft delete, isi deleted_at, jangan hapus baris
async function remove(id) {
  await getAktif(id);
  await prisma.kuTransaction.update({ where: { id }, data: { deleted_at: new Date() } });
}

module.exports = { list, create, update, remove };
