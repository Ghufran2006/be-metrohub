const prisma = require('../../../config/prisma');
const usersService = require('../../../core/users/users.service');
const { ROLES } = require('../../../core/permissions');
const { hariIni, keTanggalDb, dariTanggalDb, selisihHari } = require('../../../shared/utils/date');
const { AppError } = require('../../../shared/utils/AppError');

// Nama/email/status akun dibaca lewat relasi mg_interns.user_id (satu-satunya relasi lintas modul).
// Penulisan ke core_users selalu lewat usersService.
const includeUser = { user: { select: { nama: true, email: true, aktif: true } } };

function formatIntern({ user, ...intern }) {
  const hari = hariIni();
  const tanggalMulai = dariTanggalDb(intern.tanggal_mulai);
  const tanggalSelesai = dariTanggalDb(intern.tanggal_selesai);
  return {
    ...intern,
    nama: user.nama,
    email: user.email,
    akun_aktif: user.aktif,
    tanggal_mulai: tanggalMulai,
    tanggal_selesai: tanggalSelesai,
    masa_magang_aktif: tanggalMulai <= hari && hari <= tanggalSelesai,
  };
}

// Data magang milik pengguna yang sedang login. Dipakai fitur absensi, logbook, dan tugas.
async function getByUserId(userId) {
  const intern = await prisma.mgIntern.findUnique({ where: { user_id: userId } });
  if (!intern) throw new AppError(404, 'Data anak magang untuk akun ini tidak ditemukan');
  return intern;
}

// Filter aktif = masa magang mencakup hari ini dan akunnya aktif (sama dengan kartu dashboard)
function filterAktif(aktif) {
  const hari = keTanggalDb(hariIni());
  if (aktif) {
    return { tanggal_mulai: { lte: hari }, tanggal_selesai: { gte: hari }, user: { aktif: true } };
  }
  return {
    OR: [{ tanggal_mulai: { gt: hari } }, { tanggal_selesai: { lt: hari } }, { user: { aktif: false } }],
  };
}

// MG-01: daftar anak magang + nama/email dari relasi user, filter q, status_kerja, aktif
async function list({ q, status_kerja, aktif } = {}) {
  const interns = await prisma.mgIntern.findMany({
    where: {
      AND: [
        q ? { user: { OR: [{ nama: { contains: q } }, { email: { contains: q } }] } } : {},
        status_kerja ? { status_kerja } : {},
        aktif !== undefined ? filterAktif(aktif) : {},
      ],
    },
    include: includeUser,
    orderBy: { tanggal_mulai: 'desc' },
  });
  return interns.map(formatIntern);
}

async function getById(id) {
  const intern = await prisma.mgIntern.findUnique({ where: { id }, include: includeUser });
  if (!intern) throw new AppError(404, 'Anak magang tidak ditemukan');
  return formatIntern(intern);
}

// MG-08: profil sendiri + sisa hari masa magang
async function getProfilSaya(userId) {
  const { id } = await getByUserId(userId);
  const intern = await getById(id);
  return { ...intern, sisa_hari: Math.max(0, selisihHari(hariIni(), intern.tanggal_selesai)) };
}

// MG-01: menambah anak magang sekaligus membuat akun loginnya
async function create({ nama, email, password, asal_kampus, tanggal_mulai, tanggal_selesai, status_kerja }) {
  const { id } = await prisma.$transaction(async (tx) => {
    const roleId = await usersService.getRoleIdByNama(ROLES.ANAK_MAGANG, tx);
    const user = await usersService.create({ nama, email, password, role_id: roleId }, tx);
    return tx.mgIntern.create({
      data: {
        user_id: user.id,
        asal_kampus,
        tanggal_mulai: keTanggalDb(tanggal_mulai),
        tanggal_selesai: keTanggalDb(tanggal_selesai),
        status_kerja,
      },
    });
  });
  return getById(id);
}

async function update(id, { nama, email, ...data }) {
  const lama = await getById(id);

  const tanggalMulai = data.tanggal_mulai ?? lama.tanggal_mulai;
  const tanggalSelesai = data.tanggal_selesai ?? lama.tanggal_selesai;
  if (tanggalSelesai < tanggalMulai) {
    throw new AppError(400, 'Tanggal selesai tidak boleh sebelum tanggal mulai');
  }

  await prisma.$transaction(async (tx) => {
    if (nama || email) await usersService.update(lama.user_id, { nama, email }, tx);
    await tx.mgIntern.update({
      where: { id },
      data: {
        ...data,
        ...(data.tanggal_mulai && { tanggal_mulai: keTanggalDb(data.tanggal_mulai) }),
        ...(data.tanggal_selesai && { tanggal_selesai: keTanggalDb(data.tanggal_selesai) }),
      },
    });
  });
  return getById(id);
}

// MG-02 / BR-06: hanya admin (route sudah dibatasi permission magang:kelola)
async function setStatusKerja(id, statusKerja) {
  await getById(id);
  await prisma.mgIntern.update({ where: { id }, data: { status_kerja: statusKerja } });
  return getById(id);
}

module.exports = { getByUserId, list, getById, getProfilSaya, create, update, setStatusKerja };
