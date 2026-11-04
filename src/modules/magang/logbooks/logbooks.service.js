const prisma = require('../../../config/prisma');
const internsService = require('../interns/interns.service');
const { hariIni, keTanggalDb, dariTanggalDb } = require('../../../shared/utils/date');
const { AppError, notImplemented } = require('../../../shared/utils/AppError');

function toLogbookResponse(logbook) {
  if (!logbook) return null;
  return { ...logbook, tanggal: dariTanggalDb(logbook.tanggal) };
}

async function getHariIni(userId) {
  const intern = await internsService.getByUserId(userId);
  const logbook = await prisma.mgLogbook.findUnique({
    where: {
      intern_id_tanggal: {
        intern_id: intern.id,
        tanggal: keTanggalDb(hariIni()),
      },
    },
  });
  return toLogbookResponse(logbook);
}

// MG-04: upsert berdasarkan (intern_id, tanggal hari ini)
async function simpanHariIni(userId, isi) {
  const intern = await internsService.getByUserId(userId);
  const tanggalHariIni = keTanggalDb(hariIni());
  const attendance = await prisma.mgAttendance.findUnique({
    where: {
      intern_id_tanggal: {
        intern_id: intern.id,
        tanggal: tanggalHariIni,
      },
    },
    select: { jam_checkout: true },
  });

  if (!attendance) throw new AppError(409, 'Logbook hanya dapat disimpan setelah check-in hari ini');
  if (attendance.jam_checkout) throw new AppError(409, 'Logbook tidak dapat diubah setelah check-out');

  const logbook = await prisma.mgLogbook.upsert({
    where: {
      intern_id_tanggal: {
        intern_id: intern.id,
        tanggal: tanggalHariIni,
      },
    },
    create: {
      intern_id: intern.id,
      tanggal: tanggalHariIni,
      isi,
    },
    update: { isi },
  });
  return toLogbookResponse(logbook);
}

async function riwayatSaya(userId, periode) {
  const intern = await internsService.getByUserId(userId);
  const tanggal = {};
  if (periode.dari) tanggal.gte = keTanggalDb(periode.dari);
  if (periode.sampai) tanggal.lte = keTanggalDb(periode.sampai);

  const logbooks = await prisma.mgLogbook.findMany({
    where: {
      intern_id: intern.id,
      ...(Object.keys(tanggal).length > 0 && { tanggal }),
    },
    orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
  });
  return logbooks.map(toLogbookResponse);
}

// MG-09: semua logbook, filter intern_id dan periode
async function list(filter) {
  // TODO MG-09
  throw notImplemented('MG-09');
}

module.exports = { getHariIni, simpanHariIni, riwayatSaya, list };
