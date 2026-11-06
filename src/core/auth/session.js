const jwt = require('jsonwebtoken');
const env = require('../../config/env');

function ambilToken(req) {
  if (req.cookies?.token) return req.cookies.token;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function verifikasiToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (!payload || typeof payload !== 'object' ||
      !Number.isSafeInteger(Number(payload.sub)) || Number(payload.sub) <= 0 ||
      typeof payload.jti !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.jti) ||
      !Number.isFinite(payload.exp)) {
    throw new Error('Token tidak valid');
  }
  return payload;
}

module.exports = { ambilToken, verifikasiToken };
