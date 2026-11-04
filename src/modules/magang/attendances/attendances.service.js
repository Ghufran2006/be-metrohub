const path = require('node:path');
const env = require('../../../config/env');
const prisma = require('../../../config/prisma');
const internsService = require('../interns/interns.service');
const officeSettingsService = require('../../../core/office-settings/officeSettings.service');
const { hitungJarakMeter } = require('../../../shared/utils/geo');
const { hariIni, keTanggalDb, dariTanggalDb } = require('../../../shared/utils/date');
const { AppError, notImplemented } = require('../../../shared/utils/AppError');

const FOTO_DIR = 'attendances'; // subfolder di dalam UPLOAD_DIR
const FOTO_ROOT = path.resolve(env.UPLOAD_DIR, FOTO_DIR);

const attendanceSelect = {
  id: true,
  intern_id: true,
  tanggal: true,
  jam_checkin: true,
  foto_checkin: true,
  lat_checkin: true,
  lng_checkin: true,
  jarak_checkin_meter: true,
  jam_checkout: true,
  foto_checkout: true,
  lat_checkout: true,
  lng_checkout: true,
  jarak_checkout_meter: true,
  keterangan_koreksi: true,
  dikoreksi_oleh: true,
};

function toAttendanceResponse(attendance) {
  if (!attendance) return null;
  return {
    ...attendance,
    tanggal: dariTanggalDb(attendance.tanggal),
    lat_checkin: Number(attendance.lat_checkin),
    lng_checkin: Number(attendance.lng_checkin),
    lat_checkout: attendance.lat_checkout === null ? null : Number(attendance.lat_checkout),
    lng_checkout: attendance.lng_checkout === null ? null : Number(attendance.lng_checkout),
  };
}

// Status absensi hari ini untuk mengunci/membuka tombol di frontend:
// sudah check-in? logbook tersimpan? sudah check-out?
async function getHariIni(userId) {
  const intern = await internsService.getByUserId(userId);
  const tanggal = keTanggalDb(hariIni());

  const [attendance, logbook] = await Promise.all([
    prisma.mgAttendance.findUnique({
      where: { intern_id_tanggal: { intern_id: intern.id, tanggal } },
      select: attendanceSelect,
    }),
    prisma.mgLogbook.findUnique({
      where: { intern_id_tanggal: { intern_id: intern.id, tanggal } },
      select: { id: true },
    }),
  ]);

  return {
    sudah_checkin: Boolean(attendance),
    logbook_tersimpan: Boolean(logbook),
    sudah_checkout: Boolean(attendance?.jam_checkout),
    attendance: toAttendanceResponse(attendance),
  };
}

// MG-03. foto = req.file dari multer (nama file yang disimpan ke DB: foto.filename)
async function checkIn(userId, { latitude, longitude }, foto) {
  if (!foto?.filename) throw new AppError(400, 'Foto check-in wajib diunggah');

  const intern = await internsService.getByUserId(userId);
  const tanggalHariIni = hariIni();
  if (dariTanggalDb(intern.tanggal_selesai) < tanggalHariIni) {
    throw new AppError(400, 'Masa magang sudah berakhir, check-in tidak dapat dilakukan');
  }

  const tanggal = keTanggalDb(tanggalHariIni);
  const attendanceHariIni = await prisma.mgAttendance.findUnique({
    where: { intern_id_tanggal: { intern_id: intern.id, tanggal } },
    select: { id: true },
  });
  if (attendanceHariIni) throw new AppError(409, 'Anda sudah melakukan check-in hari ini');

  let jarakCheckinMeter = null;
  if (intern.status_kerja === 'ONSITE') {
    const kantor = await officeSettingsService.get();
    jarakCheckinMeter = hitungJarakMeter(latitude, longitude, kantor.latitude, kantor.longitude);
    if (jarakCheckinMeter > kantor.radius_meter) {
      throw new AppError(
        400,
        `Check-in ditolak: jarak Anda ${jarakCheckinMeter} meter dari kantor, melebihi radius ${kantor.radius_meter} meter`,
      );
    }
  }

  const attendance = await prisma.mgAttendance.create({
    data: {
      intern_id: intern.id,
      tanggal,
      jam_checkin: new Date(),
      foto_checkin: foto.filename,
      lat_checkin: latitude,
      lng_checkin: longitude,
      jarak_checkin_meter: jarakCheckinMeter,
    },
    select: attendanceSelect,
  });
  return toAttendanceResponse(attendance);
}

// MG-05
async function checkOut(userId, { latitude, longitude }, foto) {
  // TODO MG-05: sudah check-in, belum check-out (BR-04),
  // logbook hari ini sudah tersimpan (BR-05), radius sama dengan check-in (BR-01)
  throw notImplemented('MG-05');
}

async function riwayatSaya(userId, periode) {
  // TODO MG-09 (versi anak magang)
  throw notImplemented('MG-09');
}

// MG-09: jam, foto, lokasi; hari tanpa check-out ditandai (jam_checkout null & tanggal < hari ini)
async function rekap(filter) {
  // TODO MG-09
  throw notImplemented('MG-09');
}

// MG-10: simpan keterangan_koreksi dan dikoreksi_oleh = adminId
async function koreksi(id, data, adminId) {
  // TODO MG-10
  throw notImplemented('MG-10');
}

// NF-06: foto hanya bisa diakses lewat endpoint admin ini, bukan static file
function pathFoto(filename) {
  return { root: FOTO_ROOT, filename };
}

module.exports = { FOTO_DIR, getHariIni, checkIn, checkOut, riwayatSaya, rekap, koreksi, pathFoto };
