const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Tes ini menghapus fixture di DB khusus pengujian, tidak pernah database aplikasi.
const target = process.env.TEST_DATABASE_URL;
if (!target) throw new Error('Isi TEST_DATABASE_URL dengan MySQL lokal bernama metrohub_test_*');
const url = new URL(target);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/metrohub_test_[a-z0-9_]+$/i.test(url.pathname)) {
  throw new Error('Pengujian hanya diizinkan pada MySQL loopback dengan nama metrohub_test_*');
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = target;
process.env.JWT_SECRET = 'integration-test-only-secret-at-least-32-characters';
process.env.APP_URL = 'http://127.0.0.1';

test('backend MetroHub dengan MySQL nyata', async (t) => {
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metrohub-test-'));
  process.env.UPLOAD_DIR = uploadDir;
  const prisma = require('../src/config/prisma');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const { hariIni, keTanggalDb } = require('../src/shared/utils/date');
  const { permissionList: core } = require('../src/core/permissions');
  const { permissionList: mg } = require('../src/modules/magang/permissions');
  const { permissionList: ku } = require('../src/modules/keuangan/permissions');
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    if (path.dirname(uploadDir) !== os.tmpdir() || !path.basename(uploadDir).startsWith('metrohub-test-')) {
      throw new Error('Path upload test tidak aman untuk dibersihkan');
    }
    await fs.rm(uploadDir, { recursive: true, force: true });
  });
  await prisma.$connect();
  // Hanya DB test yang lolos guard di atas yang disentuh.
  for (const table of ['coreSession', 'mgTask', 'mgLogbook', 'mgAttendance', 'mgIntern', 'kuTransaction', 'kuCategory', 'coreUser', 'coreRolePermission', 'coreRole', 'coreOfficeSetting']) {
    await prisma[table].deleteMany();
  }
  const adminRole = await prisma.coreRole.create({ data: { nama: 'Admin', permissions: { create: [...core, ...mg, ...ku].filter((p) => p.code !== 'magang:absen').map((p) => ({ permission: p.code })) } } });
  await prisma.coreRole.create({ data: { nama: 'Anak Magang', permissions: { create: { permission: 'magang:absen' } } } });
  const admin = await prisma.coreUser.create({ data: { nama: 'Admin Pengujian', email: 'admin@test.local', password_hash: await bcrypt.hash('admin-test-123', 10), role_id: adminRole.id } });
  await prisma.coreOfficeSetting.create({ data: { id: 1, latitude: 0, longitude: 0, radius_meter: 100 } });
  const app = require('../src/app');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const photo = await fs.readFile(path.join(__dirname, '../docs/postman/foto-uji.jpg'));
  async function call(method, route, body, token, multipart = false) {
    const headers = {};
    if (token) headers.Cookie = `token=${token}`;
    let payload;
    if (multipart) {
      payload = new FormData();
      for (const [key, value] of Object.entries(body ?? {})) payload.set(key, String(value));
      payload.set('foto', new Blob([photo], { type: 'image/jpeg' }), 'foto.jpg');
    } else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const response = await fetch(base + route, { method, headers, body: payload });
    const contentType = response.headers.get('content-type') ?? '';
    const json = contentType.includes('application/json') ? await response.json() : null;
    return { status: response.status, json, response, token: response.headers.get('set-cookie')?.match(/^token=([^;]*)/)?.[1] };
  }
  async function login(email, password) {
    const result = await call('POST', '/auth/login', { email, password });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.ok(result.token); return result.token;
  }
  let adminToken = await login(admin.email, 'admin-test-123');
  let income, expense, internA, internB, tokenA, tokenB, attendance, task;
  const today = hariIni();
  const createIntern = (email, status_kerja = 'ONSITE', tanggal_selesai = '2099-12-31') => call('POST', '/magang/interns', { nama: email, email, password: 'intern-test-123', asal_kampus: 'Kampus Uji', tanggal_mulai: '2020-01-01', tanggal_selesai, status_kerja }, adminToken);
  const upload = (route, token, latitude = 0, longitude = 0) => call('POST', route, { latitude, longitude }, token, true);

  await t.test('health, validasi login, akses anonim, dan token legacy', async () => {
    assert.equal((await call('GET', '/health')).status, 200);
    assert.equal((await call('GET', '/users')).status, 401);
    const bad = await call('POST', '/auth/login', { email: admin.email, password: 'salah' });
    assert.equal(bad.status, 401); assert.equal(bad.json.message, 'Email atau password salah');
    const legacy = jwt.sign({}, process.env.JWT_SECRET, { subject: String(admin.id), expiresIn: '1h' });
    assert.equal((await call('GET', '/auth/me', undefined, legacy)).status, 401);
  });
  await t.test('KU-01 kategori, duplikasi, nominal, dan jenis', async () => {
    let result = await call('POST', '/keuangan/categories', { nama: 'Jasa', jenis: 'PEMASUKAN' }, adminToken);
    assert.equal(result.status, 201); income = result.json.data;
    result = await call('POST', '/keuangan/categories', { nama: 'Operasional', jenis: 'PENGELUARAN' }, adminToken);
    assert.equal(result.status, 201); expense = result.json.data;
    assert.equal((await call('POST', '/keuangan/categories', { nama: 'Jasa', jenis: 'PEMASUKAN' }, adminToken)).status, 409);
    assert.equal((await call('POST', '/keuangan/transactions', { tanggal: today, jenis: 'PEMASUKAN', category_id: income.id, nominal: 0 }, adminToken)).status, 400);
    assert.equal((await call('POST', '/keuangan/transactions', { tanggal: today, jenis: 'PEMASUKAN', category_id: expense.id, nominal: 100 }, adminToken)).status, 400);
  });
  await t.test('KU-04 saldo awal, saldo berjalan, urutan, pecahan dan soft delete', async () => {
    for (const [tanggal, jenis, nominal, deleted] of [
      ['2000-01-31', 'PEMASUKAN', 100.1], ['2000-01-30', 'PEMASUKAN', 5000, true],
      ['2000-02-01', 'PENGELUARAN', 20.05], ['2000-02-01', 'PEMASUKAN', 0.1],
      ['2000-02-01', 'PEMASUKAN', 0.2], ['2000-02-28', 'PEMASUKAN', 30],
      ['2000-02-02', 'PEMASUKAN', 9999, true], ['2000-03-01', 'PEMASUKAN', 999],
    ]) {
      const row = await call('POST', '/keuangan/transactions', { tanggal, jenis, nominal, category_id: jenis === 'PEMASUKAN' ? income.id : expense.id }, adminToken);
      assert.equal(row.status, 201);
      if (deleted) {
        assert.equal((await call('DELETE', `/keuangan/transactions/${row.json.data.id}`, undefined, adminToken)).status, 200);
        assert.ok((await prisma.kuTransaction.findUnique({ where: { id: row.json.data.id } })).deleted_at);
        assert.equal((await call('PATCH', `/keuangan/transactions/${row.json.data.id}`, { nominal: 5 }, adminToken)).status, 404);
      }
    }
    const result = await call('GET', '/keuangan/transactions?bulan=2000-02', undefined, adminToken);
    assert.equal(result.status, 200); const data = result.json.data;
    assert.equal(data.saldo_awal, 100.1); assert.equal(data.total_pemasukan, 30.3);
    assert.equal(data.total_pengeluaran, 20.05); assert.equal(data.saldo_akhir, 110.35);
    assert.deepEqual(data.transaksi.map((r) => r.saldo), [80.05, 80.15, 80.35, 110.35]);
    assert.equal(data.transaksi[0].kredit, 20.05); assert.equal(data.transaksi[1].debit, 0.1);
    assert.equal((await call('DELETE', `/keuangan/categories/${income.id}`, undefined, adminToken)).status, 409);
  });
  await t.test('KU-04 filter kategori/jenis, periode konflik, dan bulan kosong', async () => {
    const result = await call('GET', `/keuangan/transactions?dari=2000-02-01&sampai=2000-02-29&category_id=${income.id}&jenis=PEMASUKAN`, undefined, adminToken);
    assert.equal(result.status, 200); assert.equal(result.json.data.saldo_akhir, 130.4);
    assert.equal(result.json.data.transaksi.length, 3);
    assert.equal((await call('GET', '/keuangan/transactions?bulan=2000-02&dari=2000-02-01', undefined, adminToken)).status, 400);
    assert.equal((await call('GET', '/keuangan/transactions?dari=2000-03-01&sampai=2000-02-01', undefined, adminToken)).status, 400);
    const empty = (await call('GET', '/keuangan/transactions?bulan=1999-01', undefined, adminToken)).json.data;
    assert.deepEqual(empty, { saldo_awal: 0, total_pemasukan: 0, total_pengeluaran: 0, saldo_akhir: 0, transaksi: [] });
    const later = (await call('GET', '/keuangan/transactions?bulan=2000-04', undefined, adminToken)).json.data;
    assert.equal(later.saldo_awal, 1109.35); assert.equal(later.saldo_akhir, 1109.35); assert.deepEqual(later.transaksi, []);
  });
  await t.test('KU-05 total/rincian bulanan, kategori nonaktif, kosong, dan dashboard konsisten', async () => {
    assert.equal((await call('PATCH', `/keuangan/categories/${income.id}`, { aktif: false }, adminToken)).status, 200);
    const result = await call('GET', '/keuangan/summary?bulan=2000-02', undefined, adminToken);
    assert.equal(result.status, 200); const data = result.json.data;
    assert.equal(data.total_pemasukan, 30.3); assert.equal(data.total_pengeluaran, 20.05); assert.equal(data.saldo, 10.25);
    assert.equal(data.per_kategori.length, 2); assert.equal(data.per_kategori.find((c) => c.category_id === income.id).jumlah_transaksi, 3);
    const empty = (await call('GET', '/keuangan/summary?bulan=1999-01', undefined, adminToken)).json.data;
    assert.equal(empty.saldo, 0); assert.deepEqual(empty.per_kategori, []);
    assert.equal((await call('POST', '/keuangan/transactions', { tanggal: today, jenis: 'PENGELUARAN', category_id: expense.id, nominal: 12.34 }, adminToken)).status, 201);
    const summary = (await call('GET', '/keuangan/summary', undefined, adminToken)).json.data;
    assert.equal(summary.total_pengeluaran, 12.34);
    const dashboard = (await call('GET', '/dashboard', undefined, adminToken)).json.data.kartu.find((c) => c.modul === 'keuangan').data;
    const { per_kategori, ...total } = summary; assert.deepEqual(dashboard, total);
  });
  await t.test('MG-01 akun+intern atomik, validasi periode dan MG-02 status kerja', async () => {
    const bad = await call('POST', '/magang/interns', { nama: 'Invalid', email: 'invalid@test.local', password: 'intern-test-123', asal_kampus: 'Kampus', tanggal_mulai: '2026-11-10', tanggal_selesai: '2026-11-01' }, adminToken);
    assert.equal(bad.status, 400); assert.equal(await prisma.coreUser.count({ where: { email: 'invalid@test.local' } }), 0);
    let result = await createIntern('intern-a@test.local'); assert.equal(result.status, 201); internA = result.json.data;
    result = await createIntern('intern-b@test.local', 'REMOTE'); assert.equal(result.status, 201); internB = result.json.data;
    tokenA = await login('intern-a@test.local', 'intern-test-123'); tokenB = await login('intern-b@test.local', 'intern-test-123');
    assert.equal((await call('GET', '/keuangan/summary', undefined, tokenA)).status, 403);
    assert.equal((await call('PATCH', `/magang/interns/${internA.id}/status-kerja`, { status_kerja: 'REMOTE' }, tokenA)).status, 403);
    assert.equal((await call('GET', '/magang/interns/me', undefined, tokenA)).json.data.sisa_hari > 0, true);
  });
  await t.test('MG-03 checkin foto/lokasi, radius, dan request checkin paralel', async () => {
    assert.equal((await call('POST', '/magang/attendances/checkin', { latitude: 0, longitude: 0 }, tokenA)).status, 400);
    assert.equal((await upload('/magang/attendances/checkin', tokenA, 10, 10)).status, 400);
    const results = await Promise.all([upload('/magang/attendances/checkin', tokenA), upload('/magang/attendances/checkin', tokenA)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    attendance = results.find((r) => r.status === 201).json.data;
    assert.equal(await prisma.mgAttendance.count({ where: { intern_id: internA.id, tanggal: keTanggalDb(today) } }), 1);
  });
  await t.test('NF-06 foto hanya pengelola dan tidak tersedia melalui static URL', async () => {
    const route = `/magang/attendances/photos/${attendance.foto_checkin}`;
    assert.equal((await call('GET', route)).status, 401);
    assert.equal((await call('GET', route, undefined, tokenA)).status, 403);
    assert.equal((await call('GET', route, undefined, adminToken)).status, 200);
    assert.equal((await fetch(base.replace('/api/v1', '') + '/uploads/attendances/' + attendance.foto_checkin)).status, 404);
  });
  await t.test('MG-04/05 logbook wajib dan hanya satu checkout pada request paralel', async () => {
    assert.equal((await upload('/magang/attendances/checkout', tokenA)).status, 400);
    assert.equal((await call('PUT', '/magang/logbooks/today', { isi: ' ' }, tokenA)).status, 400);
    assert.equal((await call('PUT', '/magang/logbooks/today', { isi: 'Pekerjaan hari ini' }, tokenA)).status, 200);
    const results = await Promise.all([upload('/magang/attendances/checkout', tokenA), upload('/magang/attendances/checkout', tokenA)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await call('PUT', '/magang/logbooks/today', { isi: 'Setelah checkout' }, tokenA)).status, 400);
  });
  await t.test('BR-02 remote di luar radius diterima dan BR-07 masa lewat ditolak', async () => {
    assert.equal((await upload('/magang/attendances/checkin', tokenB, 10, 10)).status, 201);
    await createIntern('expired@test.local', 'REMOTE', '2020-01-02');
    const expired = await login('expired@test.local', 'intern-test-123');
    assert.equal((await upload('/magang/attendances/checkin', expired, 10, 10)).status, 400);
  });
  await t.test('logbook menunggu lock absensi lalu menolak checkout yang sudah commit', async () => {
    let pending;
    const b = await prisma.mgAttendance.findUnique({ where: { intern_id_tanggal: { intern_id: internB.id, tanggal: keTanggalDb(today) } } });
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM mg_attendances WHERE id = ${b.id} FOR UPDATE`;
      pending = call('PUT', '/magang/logbooks/today', { isi: 'Tidak boleh tersimpan setelah checkout' }, tokenB);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await tx.mgAttendance.update({ where: { id: b.id }, data: { jam_checkout: new Date() } });
    });
    assert.equal((await pending).status, 400);
    assert.equal(await prisma.mgLogbook.count({ where: { intern_id: internB.id } }), 0);
  });
  await t.test('MG-09/10 rekap filter, koreksi, identitas pengoreksi dan validasi', async () => {
    const result = await call('PATCH', `/magang/attendances/${attendance.id}`, { keterangan_koreksi: 'Jam diperiksa admin' }, adminToken);
    assert.equal(result.status, 200); assert.equal(result.json.data.dikoreksi_oleh, admin.id); assert.equal(result.json.data.nama_admin_koreksi, admin.nama);
    const rekap = await call('GET', `/magang/attendances?intern_id=${internA.id}&dari=${today}&sampai=${today}`, undefined, adminToken);
    assert.equal(rekap.json.data.length, 1); assert.equal(rekap.json.data[0].nama_admin_koreksi, admin.nama);
    assert.equal((await call('PATCH', `/magang/attendances/${attendance.id}`, { jam_checkout: '2000-01-01T00:00:00Z', keterangan_koreksi: 'Invalid' }, adminToken)).status, 400);
    assert.equal((await call('PATCH', `/magang/attendances/${attendance.id}`, { keterangan_koreksi: '' }, adminToken)).status, 400);
  });
  await t.test('MG-06/07/08 tugas terlambat, ownership, format tenggat dan progres', async () => {
    const created = await call('POST', '/magang/tasks', { intern_id: internA.id, judul: 'Uji tugas', deskripsi: 'Selesaikan tugas', tenggat: '2000-01-01' }, adminToken);
    assert.equal(created.status, 201); task = created.json.data; assert.equal(task.terlambat, true);
    const own = await call('GET', '/magang/tasks/me', undefined, tokenA);
    assert.equal(own.json.data[0].tenggat, '2000-01-01');
    assert.equal((await call('PATCH', `/magang/tasks/${task.id}/progress`, { status: 'SELESAI' }, tokenB)).status, 404);
    const updated = await call('PATCH', `/magang/tasks/${task.id}/progress`, { status: 'SELESAI', catatan_progres: 'Selesai' }, tokenA);
    assert.equal(updated.status, 200); assert.equal(updated.json.data.terlambat, false);
  });
  await t.test('logout mencabut cookie/Bearer, idempotent, sesi lain tetap aktif', async () => {
    const first = await login(admin.email, 'admin-test-123'); const second = await login(admin.email, 'admin-test-123');
    assert.notEqual(first, second);
    assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${first}` } })).status, 200);
    assert.equal((await call('GET', '/auth/me', undefined, first)).status, 401);
    assert.equal((await fetch(base + '/auth/me', { headers: { Authorization: `Bearer ${first}` } })).status, 401);
    assert.equal((await call('GET', '/auth/me', undefined, second)).status, 200);
    assert.equal((await call('POST', '/auth/logout', undefined, first)).status, 200);
    assert.equal((await call('POST', '/auth/logout')).status, 200);
    assert.equal(await prisma.coreSession.count({ where: { id: jwt.decode(first).jti } }), 0);
    assert.equal((await call('POST', '/auth/logout', undefined, second)).status, 200);
    assert.equal((await call('GET', '/auth/me', undefined, second)).status, 401);
  });
  await t.test('ubah password memeriksa password lama dan mencabut semua sesi akun', async () => {
    const another = await login('intern-a@test.local', 'intern-test-123');
    assert.equal((await call('PATCH', '/auth/password', { password_lama: 'salah', password_baru: 'new-password-123' }, tokenA)).status, 400);
    assert.equal((await call('GET', '/auth/me', undefined, tokenA)).status, 200);
    const result = await call('PATCH', '/auth/password', { password_lama: 'intern-test-123', password_baru: 'new-password-123' }, tokenA);
    assert.equal(result.status, 200); assert.equal(result.token, '');
    assert.equal((await call('GET', '/auth/me', undefined, tokenA)).status, 401);
    assert.equal((await call('GET', '/auth/me', undefined, another)).status, 401);
    assert.equal((await call('POST', '/auth/login', { email: 'intern-a@test.local', password: 'intern-test-123' })).status, 401);
    tokenA = await login('intern-a@test.local', 'new-password-123');
  });
  await t.test('reset password admin dan nonaktif/aktif kembali tidak menghidupkan sesi lama', async () => {
    assert.equal((await call('PATCH', `/users/${internA.user_id}`, { password: 'reset-password-123' }, adminToken)).status, 200);
    assert.equal((await call('GET', '/auth/me', undefined, tokenA)).status, 401);
    const token = await login('intern-a@test.local', 'reset-password-123');
    assert.equal((await call('PATCH', `/users/${internA.user_id}/status`, { aktif: false }, adminToken)).status, 200);
    assert.equal((await call('POST', '/auth/login', { email: 'intern-a@test.local', password: 'reset-password-123' })).status, 401);
    assert.equal((await call('PATCH', `/users/${internA.user_id}/status`, { aktif: true }, adminToken)).status, 200);
    assert.equal((await call('GET', '/auth/me', undefined, token)).status, 401);
  });
  await t.test('sesi kadaluwarsa server dan perubahan permission segera berlaku', async () => {
    const token = await login(admin.email, 'admin-test-123');
    await prisma.coreSession.update({ where: { id: jwt.decode(token).jti }, data: { expires_at: new Date('2000-01-01') } });
    assert.equal((await call('GET', '/auth/me', undefined, token)).status, 401);
    const role = await prisma.coreRole.create({ data: { nama: 'Viewer', permissions: { create: { permission: 'keuangan:lihat' } } } });
    await call('POST', '/users', { nama: 'Viewer', email: 'viewer@test.local', password: 'viewer-test-123', role_id: role.id }, adminToken);
    const viewer = await login('viewer@test.local', 'viewer-test-123');
    assert.equal((await call('GET', '/keuangan/summary', undefined, viewer)).status, 200);
    assert.equal((await call('PUT', `/roles/${role.id}/permissions`, { permissions: [] }, adminToken)).status, 200);
    assert.equal((await call('GET', '/keuangan/summary', undefined, viewer)).status, 403);
  });
});
