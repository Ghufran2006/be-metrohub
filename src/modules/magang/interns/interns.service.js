const prisma = require('../../../config/prisma');
const usersService = require('../../../core/users/users.service');
const rolesService = require('../../../core/roles/roles.service');
const { ROLES } = require('../../../core/permissions');
const { AppError, notImplemented } = require('../../../shared/utils/AppError');
const { hariIni, keTanggalDb, dariTanggalDb, selisihHari } = require('../../../shared/utils/date');

const internSelect = {
  id: true,
  user_id: true,
  asal_kampus: true,
  tanggal_mulai: true,
  tanggal_selesai: true,
  status_kerja: true,
  user: {
    select: {
      nama: true,
      email: true,
      aktif: true,
    },
  },
};

function toInternResponse(intern) {
  return {
    id: intern.id,
    user_id: intern.user_id,
    nama: intern.user.nama,
    email: intern.user.email,
    asal_kampus: intern.asal_kampus,
    tanggal_mulai: dariTanggalDb(intern.tanggal_mulai),
    tanggal_selesai: dariTanggalDb(intern.tanggal_selesai),
    status_kerja: intern.status_kerja,
    aktif: intern.user.aktif,
  };
}

function assertPeriodeValid(tanggalMulai, tanggalSelesai) {
  if (tanggalSelesai < tanggalMulai) {
    throw new AppError(400, 'Tanggal selesai tidak boleh sebelum tanggal mulai');
  }
}

// Menunggu BE-1 menyediakan rolesService.getByNama untuk lookup role tanpa ID tetap.
async function getRoleAnakMagangId() {
  if (typeof rolesService.getByNama !== 'function') {
    throw new AppError(501, 'Lookup role Anak Magang menunggu implementasi BE-1');
  }

  const role = await rolesService.getByNama(ROLES.ANAK_MAGANG);
  if (!role) throw new AppError(404, 'Role Anak Magang tidak ditemukan');
  return role.id;
}

// Data magang milik pengguna yang sedang login. Dipakai fitur absensi, logbook, dan tugas.
async function getByUserId(userId) {
  const intern = await prisma.mgIntern.findUnique({
    where: { user_id: userId },
    include: {
      user: {
        select: {
          nama: true,
          email: true,
          aktif: true,
        },
      },
    },
  });
  if (!intern) throw new AppError(404, 'Data anak magang untuk akun ini tidak ditemukan');
  return intern;
}

async function list(filter) {
  const userWhere = {};
  if (filter.aktif !== undefined) userWhere.aktif = filter.aktif;
  if (filter.q) {
    userWhere.OR = [
      { nama: { contains: filter.q } },
      { email: { contains: filter.q } },
    ];
  }

  const where = {};
  if (filter.status_kerja) where.status_kerja = filter.status_kerja;
  if (Object.keys(userWhere).length > 0) where.user = { is: userWhere };

  const interns = await prisma.mgIntern.findMany({
    where,
    select: internSelect,
    orderBy: { id: 'desc' },
  });
  return interns.map(toInternResponse);
}

async function getById(id) {
  const intern = await prisma.mgIntern.findUnique({ where: { id }, select: internSelect });
  if (!intern) throw new AppError(404, 'Data anak magang tidak ditemukan');
  return toInternResponse(intern);
}

// MG-08: profil sendiri + sisa hari masa magang (pakai selisihHari dari shared/utils/date)
async function getProfilSaya(userId) {
  const intern = await getByUserId(userId);
  return {
    ...toInternResponse(intern),
    sisa_hari: Math.max(0, selisihHari(hariIni(), dariTanggalDb(intern.tanggal_selesai))),
  };
}

async function create(data) {
  assertPeriodeValid(data.tanggal_mulai, data.tanggal_selesai);
  const roleId = await getRoleAnakMagangId();

  return prisma.$transaction(async (tx) => {
    // Pembuatan akun menunggu BE-1 menuntaskan usersService.create.
    const user = await usersService.create(
      {
        nama: data.nama,
        email: data.email,
        password: data.password,
        role_id: roleId,
      },
      tx,
    );
    const intern = await tx.mgIntern.create({
      data: {
        user_id: user.id,
        asal_kampus: data.asal_kampus,
        tanggal_mulai: keTanggalDb(data.tanggal_mulai),
        tanggal_selesai: keTanggalDb(data.tanggal_selesai),
        status_kerja: data.status_kerja,
      },
      select: internSelect,
    });
    return toInternResponse(intern);
  });
}

async function update(id, data) {
  const existing = await prisma.mgIntern.findUnique({
    where: { id },
    select: { user_id: true, tanggal_mulai: true, tanggal_selesai: true },
  });
  if (!existing) throw new AppError(404, 'Data anak magang tidak ditemukan');

  const tanggalMulai = data.tanggal_mulai ?? dariTanggalDb(existing.tanggal_mulai);
  const tanggalSelesai = data.tanggal_selesai ?? dariTanggalDb(existing.tanggal_selesai);
  assertPeriodeValid(tanggalMulai, tanggalSelesai);

  const userData = {};
  if (data.nama !== undefined) userData.nama = data.nama;
  if (data.email !== undefined) userData.email = data.email;

  if (Object.keys(userData).length > 0) {
    // Jalankan dahulu sampai usersService.update mendukung tx, agar kegagalan akun tidak meninggalkan perubahan magang.
    await usersService.update(existing.user_id, userData);
  }

  const internData = {};
  if (data.asal_kampus !== undefined) internData.asal_kampus = data.asal_kampus;
  if (data.tanggal_mulai !== undefined) internData.tanggal_mulai = keTanggalDb(data.tanggal_mulai);
  if (data.tanggal_selesai !== undefined) internData.tanggal_selesai = keTanggalDb(data.tanggal_selesai);

  if (Object.keys(internData).length === 0) return getById(id);

  const intern = await prisma.mgIntern.update({
    where: { id },
    data: internData,
    select: internSelect,
  });
  return toInternResponse(intern);
}

// MG-02 / BR-06: hanya admin (route sudah dibatasi permission magang:kelola)
async function setStatusKerja(id, statusKerja) {
  const result = await prisma.mgIntern.updateMany({
    where: { id },
    data: { status_kerja: statusKerja },
  });
  if (result.count === 0) throw new AppError(404, 'Data anak magang tidak ditemukan');
  return getById(id);
}

module.exports = { getByUserId, list, getById, getProfilSaya, create, update, setStatusKerja };
