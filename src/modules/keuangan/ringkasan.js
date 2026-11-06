const { getRingkasanBulan } = require('./summary/summary.service');

// Dipanggil dashboard core (CR-04): total pemasukan & pengeluaran bulan berjalan.
// Transaksi yang dihapus (soft delete) tidak dihitung (BR-09, BR-10).
async function getRingkasanKeuangan() {
  const { per_kategori, ...total } = await getRingkasanBulan();
  return total;
}

module.exports = { getRingkasanKeuangan };
