const usersService = require('./users.service');
const { ok, created } = require('../../shared/utils/response');

async function list(req, res) {
  ok(res, await usersService.list(req.validated.query));
}

async function getById(req, res) {
  ok(res, await usersService.getById(req.validated.params.id));
}

async function create(req, res) {
  created(res, await usersService.create(req.validated.body), 'Pengguna berhasil ditambahkan');
}

async function update(req, res) {
  ok(res, await usersService.update(req.validated.params.id, req.validated.body), 'Pengguna berhasil diubah');
}

async function setStatus(req, res) {
  const { id } = req.validated.params;
  ok(res, await usersService.setStatus(id, req.validated.body.aktif, req.user.id), 'Status pengguna berhasil diubah');
}

module.exports = { list, getById, create, update, setStatus };
