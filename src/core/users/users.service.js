const bcrypt = require('bcryptjs');
const prisma = require('../../config/prisma');
const { AppError } = require('../../shared/utils/AppError');

// Service ini juga dipakai modul lain (misalnya Magang saat MG-01 membuat akun anak magang).
// Jangan pernah mengembalikan password_hash ke luar service.

const SALT_ROUNDS = 10;

const userSelect = {
  id: true,
  nama: true,
  email: true,
  role_id: true,
  aktif: true,
  created_at: true,
  updated_at: true,
  role: { select: { nama: true } },
};

function formatUser({ role, ...user }) {
  return { ...user, role: role.nama };
}

async function pastikanEmailUnik(email, kecualiId, tx) {
  const pemilik = await tx.coreUser.findUnique({ where: { email }, select: { id: true } });
  if (pemilik && pemilik.id !== kecualiId) throw new AppError(409, 'Email sudah dipakai akun lain');
}

async function pastikanRoleAda(roleId, tx) {
  const role = await tx.coreRole.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw new AppError(400, 'Role tidak ditemukan');
}

// CR-02: daftar pengguna + nama role, filter q (nama/email), role_id, aktif
async function list({ q, role_id, aktif } = {}) {
  const users = await prisma.coreUser.findMany({
    where: {
      ...(q && { OR: [{ nama: { contains: q } }, { email: { contains: q } }] }),
      ...(role_id && { role_id }),
      ...(aktif !== undefined && { aktif }),
    },
    select: userSelect,
    orderBy: { nama: 'asc' },
  });
  return users.map(formatUser);
}

async function getById(id, tx = prisma) {
  const user = await tx.coreUser.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new AppError(404, 'Pengguna tidak ditemukan');
  return formatUser(user);
}

// Pembacaan identitas audit oleh modul tanpa query langsung ke tabel core.
async function getNamesByIds(ids) {
  const unik = [...new Set(ids.filter((id) => id != null))];
  return unik.length ? prisma.coreUser.findMany({
    where: { id: { in: unik } }, select: { id: true, nama: true },
  }) : [];
}

// Dipakai modul lain yang perlu membuat akun dengan role bawaan (misalnya Anak Magang)
async function getRoleIdByNama(nama, tx = prisma) {
  const role = await tx.coreRole.findUnique({ where: { nama }, select: { id: true } });
  if (!role) throw new AppError(500, `Role "${nama}" belum ada, jalankan seed`);
  return role.id;
}

// Parameter tx opsional agar bisa dipanggil di dalam prisma.$transaction milik modul lain
async function create({ nama, email, password, role_id }, tx = prisma) {
  await pastikanEmailUnik(email, null, tx);
  await pastikanRoleAda(role_id, tx);

  const user = await tx.coreUser.create({
    data: {
      nama,
      email,
      role_id,
      // NF-04: password disimpan sebagai hash bcrypt
      password_hash: await bcrypt.hash(password, SALT_ROUNDS),
    },
    select: userSelect,
  });
  return formatUser(user);
}

async function update(id, { password, ...data }, tx = prisma) {
  if (tx === prisma) return prisma.$transaction((db) => update(id, { password, ...data }, db));
  await getById(id, tx);
  if (data.email) await pastikanEmailUnik(data.email, id, tx);
  if (data.role_id) await pastikanRoleAda(data.role_id, tx);

  const user = await tx.coreUser.update({
    where: { id },
    data: {
      ...data,
      ...(password && { password_hash: await bcrypt.hash(password, SALT_ROUNDS) }),
    },
    select: userSelect,
  });
  if (password) await tx.coreSession.deleteMany({ where: { user_id: id } });
  return formatUser(user);
}

// Akun nonaktif tidak bisa login (dicek di auth.service & authenticate)
async function setStatus(id, aktif, penggunaId) {
  if (id === penggunaId && !aktif) throw new AppError(400, 'Anda tidak bisa menonaktifkan akun sendiri');
  await getById(id);
  const user = await prisma.$transaction(async (tx) => {
    const hasil = await tx.coreUser.update({ where: { id }, data: { aktif }, select: userSelect });
    if (!aktif) await tx.coreSession.deleteMany({ where: { user_id: id } });
    return hasil;
  });
  return formatUser(user);
}

module.exports = { list, getById, getNamesByIds, getRoleIdByNama, create, update, setStatus };
