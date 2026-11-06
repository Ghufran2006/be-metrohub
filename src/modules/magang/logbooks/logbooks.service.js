const prisma = require('../../../config/prisma');
const internsService = require('../interns/interns.service');
const { hariIni, keTanggalDb, dariTanggalDb } = require('../../../shared/utils/date');
const { AppError } = require('../../../shared/utils/AppError');
const { lockHari } = require('../attendances/attendanceLock');

const formatLogbook = (logbook) => ({ ...logbook, tanggal: dariTanggalDb(logbook.tanggal) });

// MG-04: logbook hari ini milik pengguna (null jika belum ada)
async function getHariIni(userId) {
  const intern = await internsService.getByUserId(userId);
  const logbook = await prisma.mgLogbook.findUnique({
    where: { intern_id_tanggal: { intern_id: intern.id, tanggal: keTanggalDb(hariIni()) } },
  });
  return logbook ? formatLogbook(logbook) : null;
}

// MG-04: upsert berdasarkan (intern_id, tanggal hari ini)
async function simpanHariIni(userId, isi) {
  const intern = await internsService.getByUserId(userId);
  const tanggal = keTanggalDb(hariIni());

  const logbook = await prisma.$transaction(async (tx) => {
    await lockHari(tx, intern.id, tanggal);
    const absensi = await tx.mgAttendance.findUnique({
      where: { intern_id_tanggal: { intern_id: intern.id, tanggal } },
      select: { jam_checkout: true },
    });
    if (!absensi) throw new AppError(400, 'Lakukan check-in terlebih dahulu sebelum mengisi logbook');
    if (absensi.jam_checkout) throw new AppError(400, 'Logbook tidak bisa diubah setelah check-out');

    return tx.mgLogbook.upsert({
      where: { intern_id_tanggal: { intern_id: intern.id, tanggal } },
      create: { intern_id: intern.id, tanggal, isi },
      update: { isi },
    });
  });
  return formatLogbook(logbook);
}

async function riwayatSaya(userId, { dari, sampai } = {}) {
  const intern = await internsService.getByUserId(userId);
  const logbooks = await prisma.mgLogbook.findMany({
    where: {
      intern_id: intern.id,
      ...((dari || sampai) && {
        tanggal: {
          ...(dari && { gte: keTanggalDb(dari) }),
          ...(sampai && { lte: keTanggalDb(sampai) }),
        },
      }),
    },
    orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
  });
  return logbooks.map(formatLogbook);
}

// MG-09: semua logbook, filter intern_id dan periode
async function list(filter) {
  const { dari, sampai, intern_id } = filter;
  const logbooks = await prisma.mgLogbook.findMany({
    where: {
      ...(intern_id && { intern_id }),
      ...((dari || sampai) && {
        tanggal: {
          ...(dari && { gte: keTanggalDb(dari) }),
          ...(sampai && { lte: keTanggalDb(sampai) }),
        },
      }),
    },
    include: { intern: { select: { user: { select: { nama: true, email: true } } } } },
    orderBy: [{ tanggal: 'desc' }, { intern_id: 'asc' }, { id: 'desc' }],
  });
  return logbooks.map(({ intern, ...logbook }) => ({
    ...formatLogbook(logbook),
    nama_anak_magang: intern.user.nama,
    email_anak_magang: intern.user.email,
  }));
}

module.exports = { getHariIni, simpanHariIni, riwayatSaya, list };
