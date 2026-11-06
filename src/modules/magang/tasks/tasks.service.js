const prisma = require('../../../config/prisma');
const internsService = require('../interns/interns.service');
const { hariIni, keTanggalDb, dariTanggalDb } = require('../../../shared/utils/date');
const { AppError } = require('../../../shared/utils/AppError');

// BR-08: "Terlambat" dihitung saat dibaca, bukan disimpan sebagai status.
// Pakai fungsi ini di setiap respons tugas.
function denganTandaTerlambat(task) {
  const terlambat = task.status !== 'SELESAI' && dariTanggalDb(task.tenggat) < hariIni();
  return { ...task, terlambat };
}

function formatTugas({ intern, ...task }) {
  return {
    ...denganTandaTerlambat(task),
    tenggat: dariTanggalDb(task.tenggat),
    ...(intern && { nama_anak_magang: intern.user.nama }),
  };
}

// Kondisi Prisma yang setara dengan denganTandaTerlambat(), untuk filter ?terlambat=
function filterTerlambat(terlambat) {
  const kondisi = { status: { not: 'SELESAI' }, tenggat: { lt: keTanggalDb(hariIni()) } };
  return terlambat ? kondisi : { NOT: kondisi };
}

async function getById(id) {
  const task = await prisma.mgTask.findUnique({ where: { id } });
  if (!task) throw new AppError(404, 'Tugas tidak ditemukan');
  return task;
}

// MG-06: semua tugas, filter intern_id, status, terlambat
async function list({ intern_id, status, terlambat } = {}) {
  const tasks = await prisma.mgTask.findMany({
    where: {
      ...(intern_id && { intern_id }),
      ...(status && { status }),
      ...(terlambat !== undefined && filterTerlambat(terlambat)),
    },
    include: { intern: { select: { user: { select: { nama: true } } } } },
    orderBy: [{ tenggat: 'asc' }, { id: 'asc' }],
  });
  return tasks.map(formatTugas);
}

// MG-08: tugas milik anak magang yang login
async function listSaya(userId) {
  const intern = await internsService.getByUserId(userId);
  const tasks = await prisma.mgTask.findMany({
    where: { intern_id: intern.id },
    orderBy: { tenggat: 'asc' },
  });
  return tasks.map(formatTugas);
}

// MG-06: tugas langsung muncul di halaman anak magang yang dituju
async function create({ tenggat, ...data }, adminId) {
  const intern = await prisma.mgIntern.findUnique({ where: { id: data.intern_id }, select: { id: true } });
  if (!intern) throw new AppError(400, 'Anak magang tidak ditemukan');

  const task = await prisma.mgTask.create({
    data: { ...data, tenggat: keTanggalDb(tenggat), dibuat_oleh: adminId },
  });
  return formatTugas(task);
}

async function update(id, { tenggat, ...data }) {
  await getById(id);
  const task = await prisma.mgTask.update({
    where: { id },
    data: { ...data, ...(tenggat && { tenggat: keTanggalDb(tenggat) }) },
  });
  return formatTugas(task);
}

async function remove(id) {
  await getById(id);
  await prisma.mgTask.delete({ where: { id } });
}

// MG-07: anak magang hanya boleh memperbarui tugas miliknya sendiri
async function updateProgress(id, userId, data) {
  const intern = await internsService.getByUserId(userId);
  const task = await prisma.mgTask.findFirst({ where: { id, intern_id: intern.id }, select: { id: true } });
  if (!task) throw new AppError(404, 'Tugas tidak ditemukan');

  const hasil = await prisma.mgTask.update({ where: { id }, data });
  return formatTugas(hasil);
}

module.exports = { denganTandaTerlambat, list, listSaya, create, update, remove, updateProgress };
