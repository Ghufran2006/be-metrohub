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

const desimal = (nilai) => (nilai === null ? null : Number(nilai));

function formatAbsensi(a) {
  return {
    ...a,
    tanggal: dariTanggalDb(a.tanggal),
    lat_checkin: desimal(a.lat_checkin),
    lng_checkin: desimal(a.lng_checkin),
    lat_checkout: desimal(a.lat_checkout),
    lng_checkout: desimal(a.lng_checkout),
  };
}

// BR-07: absensi hanya dalam masa magang (data lama tetap tersimpan untuk rekap)
function cekMasaMagang(intern) {
  const hari = hariIni();
  if (hari < dariTanggalDb(intern.tanggal_mulai)) throw new AppError(400, 'Masa magang Anda belum dimulai');
  if (hari > dariTanggalDb(intern.tanggal_selesai)) throw new AppError(400, 'Masa magang Anda sudah berakhir');
}

// BR-01 & BR-02: jarak selalu dihitung dan dicatat; on-site ditolak jika di luar radius
async function hitungJarak(intern, latitude, longitude) {
  const kantor = await officeSettingsService.get();
  const jarak = hitungJarakMeter(latitude, longitude, kantor.latitude, kantor.longitude);
  if (intern.status_kerja === 'ONSITE' && jarak > kantor.radius_meter) {
    throw new AppError(
      400,
      `Anda berada ${jarak} meter dari kantor. Absensi on-site hanya bisa dalam radius ${kantor.radius_meter} meter.`,
    );
  }
  return jarak;
}

function cekFoto(foto) {
  if (!foto) throw new AppError(400, 'Foto wajah wajib diambil'); // BR-03
}

const absensiHariIni = (internId) =>
  prisma.mgAttendance.findUnique({
    where: { intern_id_tanggal: { intern_id: internId, tanggal: keTanggalDb(hariIni()) } },
  });

// Status absensi hari ini untuk mengunci/membuka tombol di frontend:
// sudah check-in? logbook tersimpan? sudah check-out?
async function getHariIni(userId) {
  const intern = await internsService.getByUserId(userId);
  const hari = hariIni();
  const [absensi, logbook] = await Promise.all([
    absensiHariIni(intern.id),
    prisma.mgLogbook.findUnique({
      where: { intern_id_tanggal: { intern_id: intern.id, tanggal: keTanggalDb(hari) } },
      select: { id: true },
    }),
  ]);
  const dalamMasaMagang =
    dariTanggalDb(intern.tanggal_mulai) <= hari && hari <= dariTanggalDb(intern.tanggal_selesai);

  const sudahCheckin = Boolean(absensi);
  const sudahCheckout = Boolean(absensi?.jam_checkout);
  const logbookTersimpan = Boolean(logbook);

  return {
    tanggal: hari,
    status_kerja: intern.status_kerja,
    dalam_masa_magang: dalamMasaMagang,
    sudah_checkin: sudahCheckin,
    logbook_tersimpan: logbookTersimpan,
    sudah_checkout: sudahCheckout,
    bisa_checkin: dalamMasaMagang && !sudahCheckin,
    bisa_checkout: dalamMasaMagang && sudahCheckin && logbookTersimpan && !sudahCheckout,
    absensi: absensi && formatAbsensi(absensi),
  };
}

// MG-03. foto = req.file dari multer (nama file yang disimpan ke DB: foto.filename)
async function checkIn(userId, { latitude, longitude }, foto) {
  cekFoto(foto);
  const intern = await internsService.getByUserId(userId);
  cekMasaMagang(intern);
  if (await absensiHariIni(intern.id)) throw new AppError(409, 'Anda sudah check-in hari ini'); // BR-04
  const jarak = await hitungJarak(intern, latitude, longitude);

  const absensi = await prisma.mgAttendance.create({
    data: {
      intern_id: intern.id,
      tanggal: keTanggalDb(hariIni()),
      jam_checkin: new Date(),
      foto_checkin: foto.filename,
      lat_checkin: latitude,
      lng_checkin: longitude,
      jarak_checkin_meter: jarak,
    },
  });
  return formatAbsensi(absensi);
}

// MG-05
async function checkOut(userId, { latitude, longitude }, foto) {
  cekFoto(foto);
  const intern = await internsService.getByUserId(userId);
  cekMasaMagang(intern);

  const absensi = await absensiHariIni(intern.id);
  if (!absensi) throw new AppError(400, 'Anda belum check-in hari ini'); // BR-05
  if (absensi.jam_checkout) throw new AppError(409, 'Anda sudah check-out hari ini'); // BR-04

  const logbook = await prisma.mgLogbook.findUnique({
    where: { intern_id_tanggal: { intern_id: intern.id, tanggal: absensi.tanggal } },
    select: { id: true },
  });
  if (!logbook) throw new AppError(400, 'Isi logbook hari ini sebelum check-out'); // BR-05

  const jarak = await hitungJarak(intern, latitude, longitude);

  const hasil = await prisma.mgAttendance.update({
    where: { id: absensi.id },
    data: {
      jam_checkout: new Date(),
      foto_checkout: foto.filename,
      lat_checkout: latitude,
      lng_checkout: longitude,
      jarak_checkout_meter: jarak,
    },
  });
  return formatAbsensi(hasil);
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
