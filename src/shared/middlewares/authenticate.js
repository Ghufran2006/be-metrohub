const prisma = require('../../config/prisma');
const { AppError } = require('../utils/AppError');
const { ambilToken, verifikasiToken } = require('../../core/auth/session');

// Memastikan request berasal dari pengguna yang login dan akunnya masih aktif.
// User dan permission dibaca ulang dari database setiap request, sehingga
// akun yang dinonaktifkan (CR-02) atau hak akses yang diubah (CR-03) langsung berlaku.
async function authenticate(req, res, next) {
  const token = ambilToken(req);
  if (!token) throw new AppError(401, 'Silakan login terlebih dahulu');

  let payload;
  try {
    payload = verifikasiToken(token);
  } catch {
    throw new AppError(401, 'Sesi tidak valid atau sudah berakhir');
  }

  const session = await prisma.coreSession.findUnique({
    where: { id: payload.jti },
    include: { user: { include: { role: { include: { permissions: true } } } } },
  });
  const user = session?.user;

  if (!user?.aktif || session.user_id !== Number(payload.sub) || session.expires_at <= new Date()) {
    throw new AppError(401, 'Sesi tidak valid atau sudah berakhir');
  }

  req.user = {
    id: user.id,
    nama: user.nama,
    email: user.email,
    role: user.role.nama,
    permissions: user.role.permissions.map((p) => p.permission),
  };
  next();
}

module.exports = authenticate;
