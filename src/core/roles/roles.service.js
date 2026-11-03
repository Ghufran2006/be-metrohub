const prisma = require('../../config/prisma');
const modules = require('../../modules');
const { CORE, permissionList: corePermissions } = require('../permissions');
const { AppError } = require('../../shared/utils/AppError');

// CR-03: daftar role beserta jumlah pengguna
async function list() {
  const roles = await prisma.coreRole.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { id: 'asc' },
  });
  return roles.map((r) => ({ id: r.id, nama: r.nama, jumlah_pengguna: r._count.users }));
}

// Semua permission yang tersedia = milik core + yang didaftarkan setiap modul
function daftarPermission() {
  return [
    { modul: 'core', permissions: corePermissions },
    ...modules.map((m) => ({ modul: m.key, permissions: m.permissions })),
  ];
}

async function getRole(roleId) {
  const role = await prisma.coreRole.findUnique({ where: { id: roleId } });
  if (!role) throw new AppError(404, 'Role tidak ditemukan');
  return role;
}

async function getPermissions(roleId) {
  const role = await getRole(roleId);
  const permissions = await prisma.coreRolePermission.findMany({
    where: { role_id: roleId },
    orderBy: { permission: 'asc' },
  });
  return { role_id: role.id, nama: role.nama, permissions: permissions.map((p) => p.permission) };
}

async function setPermissions(roleId, permissions) {
  await getRole(roleId);

  const tersedia = new Set(daftarPermission().flatMap((m) => m.permissions.map((p) => p.code)));
  const tidakDikenal = permissions.filter((p) => !tersedia.has(p));
  if (tidakDikenal.length) {
    throw new AppError(
      400,
      'Kode permission tidak dikenal',
      tidakDikenal.map((p) => ({ field: 'permissions', message: `"${p}" tidak terdaftar` })),
    );
  }

  const unik = [...new Set(permissions)];

  // Cegah semua admin terkunci: harus tetap ada role lain dengan pengguna aktif yang memegang core:pengguna
  if (!unik.includes(CORE.PENGGUNA)) {
    const pengelolaLain = await prisma.coreUser.count({
      where: {
        aktif: true,
        role_id: { not: roleId },
        role: { permissions: { some: { permission: CORE.PENGGUNA } } },
      },
    });
    if (pengelolaLain === 0) {
      throw new AppError(400, `Harus ada minimal satu role aktif dengan permission ${CORE.PENGGUNA}`);
    }
  }

  await prisma.$transaction([
    prisma.coreRolePermission.deleteMany({ where: { role_id: roleId } }),
    prisma.coreRolePermission.createMany({
      data: unik.map((permission) => ({ role_id: roleId, permission })),
    }),
  ]);

  return getPermissions(roleId);
}

module.exports = { list, daftarPermission, getPermissions, setPermissions };
