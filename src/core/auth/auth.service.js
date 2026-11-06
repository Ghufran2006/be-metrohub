const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const env = require('../../config/env');
const prisma = require('../../config/prisma');
const { AppError } = require('../../shared/utils/AppError');
const { verifikasiToken } = require('./session');

// CR-01: login dengan email dan password
async function login(email, password) {
  const user = await prisma.coreUser.findUnique({
    where: { email },
    include: { role: true },
  });

  const valid = user && user.aktif && (await bcrypt.compare(password, user.password_hash));
  // Pesan sengaja tidak menyebut bagian mana yang salah (CR-01)
  if (!valid) throw new AppError(401, 'Email atau password salah');

  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: String(user.id),
    jwtid: randomUUID(),
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  });
  const payload = verifikasiToken(token);
  // Cek ulang hash/aktif dalam transaksi agar login yang bersamaan dengan
  // perubahan password/nonaktivasi tidak membuat sesi dengan kredensial lama.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM core_users WHERE id = ${user.id} FOR UPDATE`;
    const terkini = await tx.coreUser.findUnique({ where: { id: user.id } });
    if (!terkini?.aktif || terkini.password_hash !== user.password_hash) {
      throw new AppError(401, 'Email atau password salah');
    }
    await tx.coreSession.deleteMany({ where: { user_id: user.id, expires_at: { lte: new Date() } } });
    await tx.coreSession.create({
      data: { id: payload.jti, user_id: user.id, expires_at: new Date(payload.exp * 1000) },
    });
  });

  return {
    token,
    user: { id: user.id, nama: user.nama, email: user.email, role: user.role.nama },
  };
}

async function ubahPassword(userId, { password_lama, password_baru }) {
  const user = await prisma.coreUser.findUnique({ where: { id: userId } });
  if (!user?.aktif) throw new AppError(401, 'Sesi tidak valid atau sudah berakhir');
  if (!(await bcrypt.compare(password_lama, user.password_hash))) {
    throw new AppError(400, 'Password lama salah');
  }
  const hash = await bcrypt.hash(password_baru, 10);
  await prisma.$transaction(async (tx) => {
    const hasil = await tx.coreUser.updateMany({
      where: { id: userId, aktif: true, password_hash: user.password_hash },
      data: { password_hash: hash },
    });
    if (!hasil.count) throw new AppError(409, 'Akun berubah. Silakan login kembali');
    await tx.coreSession.deleteMany({ where: { user_id: userId } });
  });
}

// Logout tetap idempotent untuk cookie kosong/kedaluwarsa. JWT bertanda tangan
// valid dicabut dari DB; kegagalan DB tidak boleh dilaporkan sebagai logout sukses.
async function logout(token) {
  if (!token) return;
  let payload;
  try { payload = verifikasiToken(token); } catch { return; }
  await prisma.coreSession.deleteMany({ where: { id: payload.jti, user_id: Number(payload.sub) } });
}

module.exports = { login, logout, ubahPassword };
