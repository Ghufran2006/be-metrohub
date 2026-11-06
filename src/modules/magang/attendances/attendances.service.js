const path = require('node:path');
const env = require('../../../config/env');
const prisma = require('../../../config/prisma');
const internsService = require('../interns/interns.service');
const officeSettingsService = require('../../../core/office-settings/officeSettings.service');
const usersService = require('../../../core/users/users.service');
const { lockHari } = require('./attendanceLock');
const { hitungJarakMeter } = require('../../../shared/utils/geo');
const { hariIni, keTanggalDb, dariTanggalDb } = require('../../../shared/utils/date');
const { AppError } = require('../../../shared/utils/AppError');

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
    nama_admin_koreksi: null,
  };
}

async function denganNamaPengoreksi(rows) {
  const users = await usersService.getNamesByIds(rows.map((row) => row.dikoreksi_oleh));
  const names = new Map(users.map((user) => [user.id, user.nama]));
  return rows.map((row) => ({ ...row, nama_admin_koreksi: names.get(row.dikoreksi_oleh) ?? null }));
}

function formatRekapAbsensi(attendance) {
  return {
    ...formatAbsensi(attendance),
    checkout_terlambat: !attendance.jam_checkout && dariTanggalDb(attendance.tanggal) < hariIni(),
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

  const tanggal = keTanggalDb(hariIni());
  const jarak = await hitungJarak(intern, latitude, longitude);
  const hasil = await prisma.$transaction(async (tx) => {
    await lockHari(tx, intern.id, tanggal);
    const absensi = await tx.mgAttendance.findUnique({
      where: { intern_id_tanggal: { intern_id: intern.id, tanggal } },
    });
    if (!absensi) throw new AppError(400, 'Anda belum check-in hari ini');
    if (absensi.jam_checkout) throw new AppError(409, 'Anda sudah check-out hari ini');
    const logbook = await tx.mgLogbook.findUnique({
      where: { intern_id_tanggal: { intern_id: intern.id, tanggal } }, select: { id: true },
    });
    if (!logbook) throw new AppError(400, 'Isi logbook hari ini sebelum check-out');
    return tx.mgAttendance.update({
      where: { id: absensi.id },
      data: { jam_checkout: new Date(), foto_checkout: foto.filename, lat_checkout: latitude, lng_checkout: longitude, jarak_checkout_meter: jarak },
    });
  });
  return formatAbsensi(hasil);
}

async function riwayatSaya(userId, periode) {
  const intern = await internsService.getByUserId(userId);
  const { dari, sampai } = periode;
  const attendances = await prisma.mgAttendance.findMany({
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
  return denganNamaPengoreksi(attendances.map(formatRekapAbsensi));
}

// MG-09: jam, foto, lokasi; hari tanpa check-out ditandai (jam_checkout null & tanggal < hari ini)
async function rekap(filter) {
  const { dari, sampai, intern_id } = filter;
  const attendances = await prisma.mgAttendance.findMany({
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
  return denganNamaPengoreksi(attendances.map(({ intern, ...attendance }) => ({
    ...formatRekapAbsensi(attendance),
    nama_anak_magang: intern.user.nama,
    email_anak_magang: intern.user.email,
  })));
}

// MG-10: simpan keterangan_koreksi dan dikoreksi_oleh = adminId
async function koreksi(id, data, adminId) {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM mg_attendances WHERE id = ${id} FOR UPDATE`;
    const attendance = await tx.mgAttendance.findUnique({ where: { id } });
    if (!attendance) throw new AppError(404, 'Data absensi tidak ditemukan');

    const jamCheckin = data.jam_checkin ? new Date(data.jam_checkin) : attendance.jam_checkin;
    const jamCheckout =
      data.jam_checkout === undefined
        ? attendance.jam_checkout
        : data.jam_checkout === null
          ? null
          : new Date(data.jam_checkout);
    if (jamCheckout && jamCheckout < jamCheckin) {
      throw new AppError(400, 'Jam check-out tidak boleh sebelum jam check-in');
    }

    return tx.mgAttendance.update({
      where: { id },
      data: {
        ...(data.jam_checkin && { jam_checkin: new Date(data.jam_checkin) }),
        ...(data.jam_checkout !== undefined && {
          jam_checkout: data.jam_checkout === null ? null : new Date(data.jam_checkout),
        }),
        keterangan_koreksi: data.keterangan_koreksi,
        dikoreksi_oleh: adminId,
      },
    });
  });
  return (await denganNamaPengoreksi([formatAbsensi(updated)]))[0];
}

// NF-06: foto hanya bisa diakses lewat endpoint admin ini, bukan static file
function pathFoto(filename) {
  return { root: FOTO_ROOT, filename };
}

module.exports = { FOTO_DIR, getHariIni, checkIn, checkOut, riwayatSaya, rekap, koreksi, pathFoto };
