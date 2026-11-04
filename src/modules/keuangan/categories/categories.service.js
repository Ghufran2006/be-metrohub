const prisma = require('../../../config/prisma');
const { AppError } = require('../../../shared/utils/AppError');

async function pastikanNamaUnik(nama, jenis, kecualiId) {
  const ada = await prisma.kuCategory.findUnique({ where: { nama_jenis: { nama, jenis } } });
  if (ada && ada.id !== kecualiId) throw new AppError(409, 'Kategori dengan nama dan jenis ini sudah ada');
}

async function getById(id) {
  const kategori = await prisma.kuCategory.findUnique({ where: { id } });
  if (!kategori) throw new AppError(404, 'Kategori tidak ditemukan');
  return kategori;
}

// KU-01: filter jenis dan aktif
async function list({ jenis, aktif } = {}) {
  return prisma.kuCategory.findMany({
    where: {
      ...(jenis && { jenis }),
      ...(aktif !== undefined && { aktif }),
    },
    orderBy: [{ jenis: 'asc' }, { nama: 'asc' }],
  });
}

async function create({ nama, jenis }) {
  await pastikanNamaUnik(nama, jenis);
  return prisma.kuCategory.create({ data: { nama, jenis } });
}

// Jenis kategori sengaja tidak bisa diubah agar transaksi lama tetap konsisten
async function update(id, data) {
  const kategori = await getById(id);
  if (data.nama) await pastikanNamaUnik(data.nama, kategori.jenis, id);
  return prisma.kuCategory.update({ where: { id }, data });
}

// KU-01: kategori yang sudah dipakai transaksi (termasuk yang soft delete) hanya bisa dinonaktifkan
async function remove(id) {
  await getById(id);
  const dipakai = await prisma.kuTransaction.count({ where: { category_id: id } });
  if (dipakai > 0) {
    throw new AppError(409, 'Kategori sudah dipakai transaksi dan tidak bisa dihapus. Nonaktifkan kategori ini.');
  }
  await prisma.kuCategory.delete({ where: { id } });
}

module.exports = { list, create, update, remove };
