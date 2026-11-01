const prisma = require('../../../config/prisma');
const internsService = require('../interns/interns.service');
const { hariIni, dariTanggalDb } = require('../../../shared/utils/date');
const { notImplemented } = require('../../../shared/utils/AppError');

// BR-08: "Terlambat" dihitung saat dibaca, bukan disimpan sebagai status.
// Pakai fungsi ini di setiap respons tugas.
function denganTandaTerlambat(task) {
  const terlambat = task.status !== 'SELESAI' && dariTanggalDb(task.tenggat) < hariIni();
  return { ...task, terlambat };
}

async function list(filter) {
  // TODO MG-06: semua tugas, filter intern_id, status, terlambat
  throw notImplemented('MG-06');
}

// MG-08: tugas milik anak magang yang login
async function listSaya(userId) {
  const intern = await internsService.getByUserId(userId);
  const tasks = await prisma.mgTask.findMany({
    where: { intern_id: intern.id },
    orderBy: { tenggat: 'asc' },
  });
  return tasks.map(denganTandaTerlambat);
}

async function create(data, adminId) {
  // TODO MG-06: dibuat_oleh = adminId; pastikan intern_id ada
  throw notImplemented('MG-06');
}

async function update(id, data) {
  // TODO MG-06
  throw notImplemented('MG-06');
}

async function remove(id) {
  // TODO MG-06
  throw notImplemented('MG-06');
}

// MG-07: anak magang hanya boleh memperbarui tugas miliknya sendiri
async function updateProgress(id, userId, data) {
  // TODO MG-07: cek task.intern_id === intern milik userId, jika tidak 404
  throw notImplemented('MG-07');
}

module.exports = { denganTandaTerlambat, list, listSaya, create, update, remove, updateProgress };
