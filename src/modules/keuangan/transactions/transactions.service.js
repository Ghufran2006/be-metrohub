const prisma = require('../../../config/prisma');
const { Prisma } = require('@prisma/client');
const { keTanggalDb, dariTanggalDb, rentangBulan } = require('../../../shared/utils/date');
const { AppError } = require('../../../shared/utils/AppError');

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
async function list({ bulan, dari, sampai, jenis, category_id } = {}) {
  if (bulan && (dari || sampai)) throw new AppError(400, 'Pilih filter bulan atau rentang tanggal');
  const rentang = bulan ? rentangBulan(bulan) : null;
  const awal = rentang?.awal ?? (dari ? keTanggalDb(dari) : null);
  const akhir = rentang?.akhir ?? (sampai ? keTanggalDb(sampai) : null);
  const filter = { deleted_at: null, ...(jenis && { jenis }), ...(category_id && { category_id }) };
  // Satu snapshot agar saldo awal dan isi buku tidak berbeda saat ada transaksi baru.
  return prisma.$transaction(async (tx) => {
    const sebelum = awal ? await tx.kuTransaction.groupBy({
      by: ['jenis'], where: { ...filter, tanggal: { lt: awal } }, _sum: { nominal: true },
    }) : [];
    let saldo = new Prisma.Decimal(0);
    for (const row of sebelum) {
      saldo = row.jenis === 'PEMASUKAN' ? saldo.plus(row._sum.nominal ?? 0) : saldo.minus(row._sum.nominal ?? 0);
    }
    const saldoAwal = saldo;
    const rows = await tx.kuTransaction.findMany({
      where: { ...filter, ...((awal || akhir) && { tanggal: { ...(awal && { gte: awal }), ...(akhir && { lte: akhir }) } }) },
      include: { category: true }, orderBy: [{ tanggal: 'asc' }, { id: 'asc' }],
    });
    let pemasukan = new Prisma.Decimal(0);
    let pengeluaran = new Prisma.Decimal(0);
    const transaksi = rows.map((row) => {
      const nominal = new Prisma.Decimal(row.nominal);
      const masuk = row.jenis === 'PEMASUKAN';
      if (masuk) { pemasukan = pemasukan.plus(nominal); saldo = saldo.plus(nominal); }
      else { pengeluaran = pengeluaran.plus(nominal); saldo = saldo.minus(nominal); }
      return { ...formatTransaksi(row), debit: masuk ? nominal.toNumber() : 0, kredit: masuk ? 0 : nominal.toNumber(), saldo: saldo.toNumber() };
    });
    return { saldo_awal: saldoAwal.toNumber(), total_pemasukan: pemasukan.toNumber(), total_pengeluaran: pengeluaran.toNumber(), saldo_akhir: saldo.toNumber(), transaksi };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
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
