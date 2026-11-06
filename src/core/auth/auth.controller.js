const env = require('../../config/env');
const authService = require('./auth.service');
const { ambilToken } = require('./session');
const { ok } = require('../../shared/utils/response');

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
};

async function login(req, res) {
  const { email, password } = req.validated.body;
  const { token, user } = await authService.login(email, password);
  res.cookie('token', token, cookieOptions);
  ok(res, user, 'Login berhasil');
}

// NF-04: sesi berakhir setelah logout
async function logout(req, res) {
  await authService.logout(ambilToken(req));
  res.clearCookie('token', cookieOptions);
  ok(res, null, 'Logout berhasil');
}

async function me(req, res) {
  ok(res, req.user);
}

async function ubahPassword(req, res) {
  await authService.ubahPassword(req.user.id, req.validated.body);
  res.clearCookie('token', cookieOptions);
  ok(res, null, 'Password berhasil diubah. Silakan login kembali');
}

module.exports = { login, logout, me, ubahPassword };
