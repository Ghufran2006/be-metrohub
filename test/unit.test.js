const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mysql://unused:unused@127.0.0.1:3307/metrohub_test_unit';
process.env.JWT_SECRET = 'unit-test-only-secret-at-least-32-characters';
process.env.APP_URL = 'http://localhost:3000';
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const { listQuery, createSchema } = require('../src/modules/keuangan/transactions/transactions.schema');
const { verifikasiToken, ambilToken } = require('../src/core/auth/session');
const { rentangBulan, keTanggalDb, selisihHari } = require('../src/shared/utils/date');

test('filter periode menolak tanggal terbalik dan kombinasi bulan/rentang', () => {
  assert.equal(listQuery.safeParse({ dari: '2026-11-10', sampai: '2026-11-01' }).success, false);
  assert.equal(listQuery.safeParse({ bulan: '2026-11', dari: '2026-11-01' }).success, false);
  assert.equal(listQuery.safeParse({ bulan: '2026-13' }).success, false);
  assert.equal(listQuery.safeParse({ bulan: '2026-11', jenis: 'PEMASUKAN' }).success, true);
});

test('nominal menolak nol, negatif, pecahan lebih dari dua digit, dan overflow DB', () => {
  const input = { tanggal: '2026-11-01', jenis: 'PEMASUKAN', category_id: 1 };
  for (const nominal of [0, -1, 1.001, 10000000000000]) assert.equal(createSchema.safeParse({ ...input, nominal }).success, false);
  for (const nominal of [0.1, 0.2, 100.01]) assert.equal(createSchema.safeParse({ ...input, nominal }).success, true);
});

test('tanggal akhir bulan menangani tahun kabisat dan pergantian tahun', () => {
  assert.equal(rentangBulan('2024-02').akhir.toISOString().slice(0, 10), '2024-02-29');
  assert.equal(rentangBulan('2026-02').akhir.toISOString().slice(0, 10), '2026-02-28');
  assert.equal(rentangBulan('2026-12').akhir.toISOString().slice(0, 10), '2026-12-31');
  assert.equal(selisihHari('2026-12-31', '2027-01-01'), 1);
  assert.equal(keTanggalDb('2026-11-01').toISOString(), '2026-11-01T00:00:00.000Z');
});

test('JWT wajib punya subject, jti, expiry, dan algoritme yang benar', () => {
  const sign = (payload, options = {}) => jwt.sign(payload, process.env.JWT_SECRET, options);
  const options = { subject: '1', jwtid: randomUUID(), expiresIn: '1h' };
  assert.equal(verifikasiToken(sign({}, options)).sub, '1');
  assert.throws(() => verifikasiToken(sign({}, { subject: '1', expiresIn: '1h' })));
  assert.throws(() => verifikasiToken(sign({}, { ...options, algorithm: 'HS384' })));
  assert.throws(() => verifikasiToken(sign({}, { ...options, subject: 'NaN' })));
  assert.throws(() => verifikasiToken(sign({}, { ...options, expiresIn: '-1s' })));
});

test('cookie dan Bearer dipakai secara konsisten saat authenticate dan logout', () => {
  assert.equal(ambilToken({ cookies: { token: 'cookie' }, headers: { authorization: 'Bearer header' } }), 'cookie');
  assert.equal(ambilToken({ headers: { authorization: 'Bearer header' } }), 'header');
  assert.equal(ambilToken({ headers: {} }), null);
});

test('OpenAPI menampilkan kontrak keuangan dan tidak menandai fitur sebagai 501', () => {
  const spec = require('../src/docs/openapi');
  assert.ok(spec.components.schemas.Ledger);
  assert.ok(spec.components.schemas.FinancialSummary);
  assert.deepEqual(spec.paths['/keuangan/transactions'].get.parameters.map((p) => p.name).sort(), ['bulan', 'category_id', 'dari', 'jenis', 'sampai']);
  assert.deepEqual(spec.paths['/magang/attendances'].get.parameters.map((p) => p.name).sort(), ['dari', 'intern_id', 'sampai']);
  for (const path of Object.values(spec.paths)) {
    for (const operation of Object.values(path)) assert.equal(operation.responses[501], undefined);
  }
});

test('backup gagal tidak meninggalkan file parsial atau menampilkan password', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'metrohub-backup-test-'));
  try {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/backup.cjs')], {
      env: { ...process.env, DATABASE_URL: 'mysql://user:password-not-in-log@127.0.0.1/metrohub_test_backup', BACKUP_DIR: folder, MYSQLDUMP_BIN: path.join(folder, 'missing-mysqldump') },
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    });
    assert.equal(result.status, 1); assert.deepEqual(fs.readdirSync(folder), []);
    assert.equal((result.stdout + result.stderr).includes('password-not-in-log'), false);
  } finally {
    if (path.dirname(folder) !== os.tmpdir() || !path.basename(folder).startsWith('metrohub-backup-test-')) throw new Error('Path test tidak aman');
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
