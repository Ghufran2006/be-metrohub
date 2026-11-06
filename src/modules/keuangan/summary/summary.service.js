const prisma = require('../../../config/prisma');
const { Prisma } = require('@prisma/client');
const { bulanIni, rentangBulan } = require('../../../shared/utils/date');

// KU-05: total pemasukan, total pengeluaran, saldo, dan rincian per kategori untuk satu bulan.
// Contoh query total ada di ../ringkasan.js; rincian per kategori pakai groupBy category_id.
async function getRingkasanBulan(bulan = bulanIni()) {
  const { awal, akhir } = rentangBulan(bulan);
  return prisma.$transaction(async (tx) => {
    const groups = await tx.kuTransaction.groupBy({
      by: ['category_id', 'jenis'],
      where: { deleted_at: null, tanggal: { gte: awal, lte: akhir } },
      _sum: { nominal: true }, _count: { _all: true },
    });
    const categories = groups.length ? await tx.kuCategory.findMany({
      where: { id: { in: [...new Set(groups.map((g) => g.category_id))] } },
      select: { id: true, nama: true },
    }) : [];
    const names = new Map(categories.map((c) => [c.id, c.nama]));
    let pemasukan = new Prisma.Decimal(0);
    let pengeluaran = new Prisma.Decimal(0);
    const perKategori = groups.map((g) => {
      const total = new Prisma.Decimal(g._sum.nominal ?? 0);
      if (g.jenis === 'PEMASUKAN') pemasukan = pemasukan.plus(total);
      else pengeluaran = pengeluaran.plus(total);
      return { category_id: g.category_id, kategori: names.get(g.category_id), jenis: g.jenis, total: total.toNumber(), jumlah_transaksi: g._count._all };
    }).sort((a, b) => a.jenis.localeCompare(b.jenis) || a.kategori.localeCompare(b.kategori) || a.category_id - b.category_id);
    return { bulan, total_pemasukan: pemasukan.toNumber(), total_pengeluaran: pengeluaran.toNumber(), saldo: pemasukan.minus(pengeluaran).toNumber(), per_kategori: perKategori };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

module.exports = { getRingkasanBulan };
