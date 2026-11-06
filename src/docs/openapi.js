const { z } = require('zod');
const { idParam } = require('../shared/utils/commonSchemas');
const { CORE } = require('../core/permissions');
const { MAGANG } = require('../modules/magang/permissions');
const { KEUANGAN } = require('../modules/keuangan/permissions');

const authSchema = require('../core/auth/auth.schema');
const usersSchema = require('../core/users/users.schema');
const rolesSchema = require('../core/roles/roles.schema');
const officeSchema = require('../core/office-settings/officeSettings.schema');
const internsSchema = require('../modules/magang/interns/interns.schema');
const attendancesSchema = require('../modules/magang/attendances/attendances.schema');
const logbooksSchema = require('../modules/magang/logbooks/logbooks.schema');
const tasksSchema = require('../modules/magang/tasks/tasks.schema');
const categoriesSchema = require('../modules/keuangan/categories/categories.schema');
const transactionsSchema = require('../modules/keuangan/transactions/transactions.schema');
const summarySchema = require('../modules/keuangan/summary/summary.schema');

// Dokumentasi OpenAPI 3.1 untuk Swagger UI (/api/v1/docs).
// Skema request diambil langsung dari schema Zod agar selalu sama dengan validasi.
// Skema respons ditulis manual: kalau bentuk respons service berubah, ubah juga di sini.

// ===== Konversi Zod -> JSON Schema =====
function bersihkan(node) {
  if (Array.isArray(node)) return node.map(bersihkan);
  if (!node || typeof node !== 'object') return node;
  const hasil = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue;
    if (key === 'maximum' && value === Number.MAX_SAFE_INTEGER) continue;
    // Regex panjang bawaan z.email()/z.iso.date() tidak perlu ditampilkan jika format sudah ada
    if (key === 'pattern' && node.format) continue;
    hasil[key] = bersihkan(value);
  }
  return hasil;
}

const jsonSchema = (schema) => bersihkan(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }));

// Ubah schema Zod object (query/params) menjadi daftar parameter OpenAPI
function parameters(schema, lokasi) {
  // Zod intersection memakai allOf; parameter periode harus tetap muncul di Swagger.
  function fields(node) {
    const properties = { ...node.properties };
    const required = new Set(node.required ?? []);
    for (const part of node.allOf ?? []) {
      const child = fields(part);
      Object.assign(properties, child.properties);
      for (const key of child.required) required.add(key);
    }
    return { properties, required: [...required] };
  }
  const { properties, required } = fields(jsonSchema(schema));
  return Object.entries(properties).map(([name, s]) => ({
    name,
    in: lokasi,
    required: lokasi === 'path' || required.includes(name),
    schema: s,
  }));
}

// ===== Skema respons =====
const str = { type: 'string' };
const int = { type: 'integer' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const tgl = { type: 'string', format: 'date', example: '2026-11-03' };
const waktu = { type: 'string', format: 'date-time' };
const nullable = (s) => ({ ...s, type: [s.type, 'null'] });
const ref = (nama) => ({ $ref: `#/components/schemas/${nama}` });
const obj = (properties) => ({ type: 'object', properties });

const schemas = {
  Error: obj({
    success: { type: 'boolean', const: false },
    message: { ...str, example: 'Data yang dikirim tidak valid' },
    details: {
      type: 'array',
      items: obj({ field: { ...str, example: 'email' }, message: { ...str, example: 'Format email tidak valid' } }),
    },
  }),
  LoginResult: obj({ id: int, nama: str, email: str, role: { ...str, example: 'Admin' } }),
  Me: obj({
    id: int,
    nama: str,
    email: str,
    role: str,
    permissions: { type: 'array', items: str, example: ['core:dashboard', 'magang:kelola'] },
  }),
  Menu: {
    type: 'array',
    items: obj({ group: { ...str, example: 'Manajemen Magang' }, items: { type: 'array', items: obj({ label: str, path: str }) } }),
  },
  User: obj({
    id: int,
    nama: str,
    email: str,
    role_id: int,
    role: { ...str, example: 'Anak Magang' },
    aktif: bool,
    created_at: waktu,
    updated_at: waktu,
  }),
  Role: obj({ id: int, nama: str, jumlah_pengguna: int }),
  PermissionGroup: obj({
    modul: { ...str, example: 'magang' },
    permissions: { type: 'array', items: obj({ code: { ...str, example: 'magang:absen' }, deskripsi: str }) },
  }),
  RolePermissions: obj({ role_id: int, nama: str, permissions: { type: 'array', items: str } }),
  Dashboard: obj({
    kartu: {
      type: 'array',
      items: obj({ modul: str, nama: str, data: { type: 'object', additionalProperties: true } }),
      example: [
        { modul: 'magang', nama: 'Manajemen Magang', data: { anak_magang_aktif: 2 } },
        {
          modul: 'keuangan',
          nama: 'Manajemen Keuangan',
          data: { bulan: '2026-11', total_pemasukan: 1500000, total_pengeluaran: 500000, saldo: 1000000 },
        },
      ],
    },
  }),
  OfficeSetting: obj({ latitude: { ...num, example: -0.9145 }, longitude: { ...num, example: 100.46 }, radius_meter: { ...int, example: 100 } }),

  Intern: obj({
    id: int,
    user_id: int,
    nama: str,
    email: str,
    akun_aktif: bool,
    asal_kampus: str,
    tanggal_mulai: tgl,
    tanggal_selesai: tgl,
    status_kerja: { type: 'string', enum: ['ONSITE', 'REMOTE'] },
    masa_magang_aktif: { ...bool, description: 'Hari ini berada di antara tanggal mulai dan selesai' },
  }),
  InternSaya: {
    allOf: [ref('Intern'), obj({ sisa_hari: { ...int, description: 'Sisa hari masa magang (MG-08)', example: 30 } })],
  },
  Attendance: obj({
    id: int,
    intern_id: int,
    tanggal: tgl,
    jam_checkin: waktu,
    foto_checkin: { ...str, description: 'Nama file, buka lewat /magang/attendances/photos/{filename}' },
    lat_checkin: num,
    lng_checkin: num,
    jarak_checkin_meter: nullable(int),
    jam_checkout: nullable(waktu),
    foto_checkout: nullable(str),
    lat_checkout: nullable(num),
    lng_checkout: nullable(num),
    jarak_checkout_meter: nullable(int),
    keterangan_koreksi: nullable(str),
    dikoreksi_oleh: nullable(int),
    nama_admin_koreksi: nullable(str),
  }),
  StatusHariIni: obj({
    tanggal: tgl,
    status_kerja: { type: 'string', enum: ['ONSITE', 'REMOTE'] },
    dalam_masa_magang: bool,
    sudah_checkin: bool,
    logbook_tersimpan: bool,
    sudah_checkout: bool,
    bisa_checkin: { ...bool, description: 'Untuk membuka tombol check-in' },
    bisa_checkout: { ...bool, description: 'Untuk membuka tombol check-out (BR-05)' },
    absensi: { oneOf: [ref('Attendance'), { type: 'null' }] },
  }),
  AttendanceRecap: { allOf: [ref('Attendance'), obj({ checkout_terlambat: bool, nama_anak_magang: str, email_anak_magang: str })] },
  LogbookRecap: { allOf: [ref('Logbook'), obj({ nama_anak_magang: str, email_anak_magang: str })] },
  Logbook: obj({ id: int, intern_id: int, tanggal: tgl, isi: str, updated_at: waktu }),
  Task: obj({
    id: int,
    intern_id: int,
    nama_anak_magang: { ...str, description: 'Hanya ada di GET /magang/tasks (admin)' },
    judul: str,
    deskripsi: str,
    tenggat: tgl,
    status: { type: 'string', enum: ['BELUM_DIKERJAKAN', 'DIKERJAKAN', 'SELESAI'] },
    catatan_progres: nullable(str),
    terlambat: { ...bool, description: 'BR-08: lewat tenggat dan belum Selesai (dihitung saat dibaca)' },
    dibuat_oleh: int,
    created_at: waktu,
    updated_at: waktu,
  }),
  Category: obj({ id: int, nama: str, jenis: { type: 'string', enum: ['PEMASUKAN', 'PENGELUARAN'] }, aktif: bool }),
  Transaction: obj({
    id: int,
    tanggal: tgl,
    jenis: { type: 'string', enum: ['PEMASUKAN', 'PENGELUARAN'] },
    category_id: int,
    kategori: { ...str, description: 'Nama kategori' },
    nominal: { ...num, example: 1500000 },
    keterangan: nullable(str),
    dibuat_oleh: int,
    created_at: waktu,
    updated_at: waktu,
    deleted_at: nullable(waktu),
  }),
  Ledger: obj({
    saldo_awal: num, total_pemasukan: num, total_pengeluaran: num, saldo_akhir: num,
    transaksi: { type: 'array', items: { allOf: [ref('Transaction'), obj({ debit: num, kredit: num, saldo: num })] } },
  }),
  FinancialSummary: obj({
    bulan: { type: 'string', example: '2026-11' },
    total_pemasukan: num, total_pengeluaran: num, saldo: num,
    per_kategori: { type: 'array', items: obj({ category_id: int, kategori: str, jenis: { type: 'string', enum: ['PEMASUKAN', 'PENGELUARAN'] }, total: num, jumlah_transaksi: int }) },
  }),
};

// ===== Respons =====
const PESAN_ERROR = {
  400: 'Validasi gagal / aturan bisnis dilanggar',
  401: 'Belum login, token tidak valid, atau akun nonaktif',
  403: 'Login tetapi tidak punya permission',
  404: 'Data tidak ditemukan',
  409: 'Data duplikat atau masih dipakai data lain',
  413: 'Foto lebih dari 500 KB',
};

function sukses(data, message) {
  return {
    description: message,
    content: {
      'application/json': {
        schema: obj({
          success: { type: 'boolean', const: true },
          message: { ...str, example: message },
          data: data ?? { type: 'null' },
        }),
      },
    },
  };
}

const error = (status, keterangan) => ({
  description: keterangan ? `${PESAN_ERROR[status]}. ${keterangan}` : PESAN_ERROR[status],
  content: { 'application/json': { schema: ref('Error') } },
});

// ===== Definisi endpoint =====
const paths = {};

// Satu endpoint. errors: { kode: 'keterangan' } untuk error selain 400/401/403 yang otomatis.
function route(method, path, opsi) {
  const {
    tag,
    summary,
    kode,
    permission,
    publik = false,
    params,
    query,
    body,
    multipart,
    data,
    status = 200,
    message = 'OK',
    errors = {},
    description,
  } = opsi;

  const keterangan = [
    kode && `**Kode PRD:** ${kode}`,
    permission && `**Permission:** \`${permission}\``,
    publik && '**Publik** (tanpa login)',
    !publik && !permission && '**Login** (semua role)',
    description,
  ]
    .filter(Boolean)
    .join('\n\n');

  const responses = { [status]: sukses(data, message) };
  if (params || query || body || multipart) responses[400] = error(400, errors[400]);
  if (!publik) responses[401] = error(401);
  if (permission) responses[403] = error(403);
  for (const [kodeStatus, ket] of Object.entries(errors)) {
    if (kodeStatus !== '400') responses[kodeStatus] = error(Number(kodeStatus), ket);
  }

  // Contoh: PATCH /magang/interns/:id/status-kerja -> patchMagangInternsIdStatusKerja
  const operationId = [method, ...path.split(/[/:-]/)]
    .filter(Boolean)
    .map((kata, i) => (i === 0 ? kata : kata[0].toUpperCase() + kata.slice(1)))
    .join('');

  const operasi = {
    operationId,
    tags: [tag],
    summary,
    description: keterangan,
    parameters: [...(params ? parameters(params, 'path') : []), ...(query ? parameters(query, 'query') : [])],
    ...(publik && { security: [] }),
    responses,
  };

  if (body) {
    operasi.requestBody = { required: true, content: { 'application/json': { schema: jsonSchema(body) } } };
  }
  if (multipart) {
    const s = jsonSchema(multipart);
    operasi.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            ...s,
            properties: {
              foto: { type: 'string', format: 'binary', description: 'Foto dari kamera, JPG/PNG/WEBP, maks. 500 KB' },
              ...s.properties,
            },
            required: ['foto', ...(s.required ?? [])],
          },
        },
      },
    };
  }

  const openapiPath = path.replace(/:(\w+)/g, '{$1}');
  paths[openapiPath] ??= {};
  paths[openapiPath][method] = operasi;
}

const daftar = (nama) => ({ type: 'array', items: ref(nama) });

// ----- Auth -----
route('get', '/health', { tag: 'Auth', summary: 'Cek server', publik: true, data: null });
route('post', '/auth/login', {
  tag: 'Auth',
  summary: 'Login',
  kode: 'CR-01',
  publik: true,
  body: authSchema.loginSchema,
  data: ref('LoginResult'),
  message: 'Login berhasil',
  description: 'Token disimpan di cookie httpOnly `token`. Pesan gagal tidak menyebut bagian mana yang salah.',
  errors: { 401: 'Email/password salah atau akun nonaktif' },
});
route('post', '/auth/logout', { tag: 'Auth', summary: 'Logout', kode: 'CR-01', publik: true, message: 'Logout berhasil', description: 'Mencabut sesi token dari cookie atau Bearer header di server. Pemanggilan berulang tetap berhasil. Sesi perangkat lain tetap aktif.' });
route('get', '/auth/me', { tag: 'Auth', summary: 'Pengguna yang sedang login', kode: 'CR-01', data: ref('Me') });
route('patch', '/auth/password', {
  tag: 'Auth',
  summary: 'Ubah password sendiri',
  kode: 'Profil',
  body: authSchema.ubahPasswordSchema,
  description: 'Memeriksa password lama, mengganti hash bcrypt, lalu mencabut seluruh sesi akun dan menghapus cookie. Setelah berhasil, login kembali.',
  message: 'Password berhasil diubah. Silakan login kembali',
});
route('get', '/menu', { tag: 'Auth', summary: 'Menu sidebar sesuai permission', kode: 'CR-03', data: ref('Menu') });

// ----- Pengguna -----
route('get', '/users', {
  tag: 'Pengguna',
  summary: 'Daftar pengguna',
  kode: 'CR-02',
  permission: CORE.PENGGUNA,
  query: usersSchema.listQuery,
  data: daftar('User'),
});
route('post', '/users', {
  tag: 'Pengguna',
  summary: 'Tambah pengguna',
  kode: 'CR-02',
  permission: CORE.PENGGUNA,
  body: usersSchema.createSchema,
  data: ref('User'),
  status: 201,
  message: 'Pengguna berhasil ditambahkan',
  errors: { 400: 'Termasuk role tidak ditemukan', 409: 'Email sudah dipakai akun lain' },
});
route('get', '/users/:id', {
  tag: 'Pengguna',
  summary: 'Detail pengguna',
  kode: 'CR-02',
  permission: CORE.PENGGUNA,
  params: idParam,
  data: ref('User'),
  errors: { 404: '' },
});
route('patch', '/users/:id', {
  tag: 'Pengguna',
  summary: 'Ubah pengguna',
  kode: 'CR-02',
  permission: CORE.PENGGUNA,
  params: idParam,
  body: usersSchema.updateSchema,
  data: ref('User'),
  message: 'Pengguna berhasil diubah',
  description: 'Semua field opsional. Jika `password` diisi, password di-hash ulang.',
  errors: { 404: '', 409: 'Email sudah dipakai akun lain' },
});
route('patch', '/users/:id/status', {
  tag: 'Pengguna',
  summary: 'Aktifkan / nonaktifkan pengguna',
  kode: 'CR-02',
  permission: CORE.PENGGUNA,
  params: idParam,
  body: usersSchema.statusSchema,
  data: ref('User'),
  message: 'Status pengguna berhasil diubah',
  description: 'Akun nonaktif tidak bisa login dan sesinya langsung tidak berlaku.',
  errors: { 400: 'Termasuk menonaktifkan akun sendiri', 404: '' },
});

// ----- Role & Hak Akses -----
route('get', '/roles', {
  tag: 'Role & Hak Akses',
  summary: 'Daftar role + jumlah pengguna',
  kode: 'CR-03',
  permission: CORE.PENGGUNA,
  data: daftar('Role'),
});
route('get', '/roles/permissions', {
  tag: 'Role & Hak Akses',
  summary: 'Semua permission yang tersedia per modul',
  kode: 'CR-03',
  permission: CORE.PENGGUNA,
  data: daftar('PermissionGroup'),
});
route('get', '/roles/:id/permissions', {
  tag: 'Role & Hak Akses',
  summary: 'Permission milik role',
  kode: 'CR-03',
  permission: CORE.PENGGUNA,
  params: idParam,
  data: ref('RolePermissions'),
  errors: { 404: '' },
});
route('put', '/roles/:id/permissions', {
  tag: 'Role & Hak Akses',
  summary: 'Simpan permission role',
  kode: 'CR-03',
  permission: CORE.PENGGUNA,
  params: idParam,
  body: rolesSchema.setPermissionsSchema,
  data: ref('RolePermissions'),
  message: 'Hak akses berhasil disimpan',
  description: 'Mengganti seluruh permission role. Kode harus ada di `GET /roles/permissions`.',
  errors: {
    400: 'Termasuk kode permission tidak dikenal, atau tidak ada lagi role aktif yang memegang core:pengguna',
    404: '',
  },
});

// ----- Dashboard & Lokasi -----
route('get', '/dashboard', {
  tag: 'Dashboard & Lokasi',
  summary: 'Kartu ringkasan tiap modul',
  kode: 'CR-04',
  permission: CORE.DASHBOARD,
  data: ref('Dashboard'),
});
route('get', '/office-settings', {
  tag: 'Dashboard & Lokasi',
  summary: 'Lokasi dan radius kantor',
  kode: 'CR-05',
  permission: CORE.LOKASI,
  data: ref('OfficeSetting'),
  errors: { 404: 'Lokasi kantor belum diatur' },
});
route('put', '/office-settings', {
  tag: 'Dashboard & Lokasi',
  summary: 'Simpan lokasi dan radius kantor',
  kode: 'CR-05',
  permission: CORE.LOKASI,
  body: officeSchema.updateSchema,
  data: ref('OfficeSetting'),
  message: 'Lokasi kantor berhasil disimpan',
});

// ----- Magang: Anak Magang -----
const TAG_INTERN = 'Magang - Anak Magang';
route('get', '/magang/interns/me', {
  tag: TAG_INTERN,
  summary: 'Profil magang saya + sisa hari',
  kode: 'MG-08',
  permission: MAGANG.ABSEN,
  data: ref('InternSaya'),
  errors: { 404: 'Akun ini bukan anak magang' },
});
route('get', '/magang/interns', {
  tag: TAG_INTERN,
  summary: 'Daftar anak magang',
  kode: 'MG-01',
  permission: MAGANG.KELOLA,
  query: internsSchema.listQuery,
  data: daftar('Intern'),
  description: '`aktif=true`: masa magang mencakup hari ini dan akun aktif (sama dengan kartu dashboard).',
});
route('post', '/magang/interns', {
  tag: TAG_INTERN,
  summary: 'Tambah anak magang + akun login',
  kode: 'MG-01',
  permission: MAGANG.KELOLA,
  body: internsSchema.createSchema,
  data: ref('Intern'),
  status: 201,
  message: 'Anak magang berhasil ditambahkan',
  errors: { 400: 'Termasuk tanggal selesai sebelum tanggal mulai', 409: 'Email sudah dipakai akun lain' },
});
route('get', '/magang/interns/:id', {
  tag: TAG_INTERN,
  summary: 'Detail anak magang',
  kode: 'MG-01',
  permission: MAGANG.KELOLA,
  params: idParam,
  data: ref('Intern'),
  errors: { 404: '' },
});
route('patch', '/magang/interns/:id', {
  tag: TAG_INTERN,
  summary: 'Ubah data anak magang',
  kode: 'MG-01',
  permission: MAGANG.KELOLA,
  params: idParam,
  body: internsSchema.updateSchema,
  data: ref('Intern'),
  message: 'Data anak magang berhasil diubah',
  description: 'Semua field opsional. Tanggal dibandingkan dengan data yang tersimpan.',
  errors: { 404: '', 409: 'Email sudah dipakai akun lain' },
});
route('patch', '/magang/interns/:id/status-kerja', {
  tag: TAG_INTERN,
  summary: 'Ubah status kerja on-site/remote',
  kode: 'MG-02, BR-06',
  permission: MAGANG.KELOLA,
  params: idParam,
  body: internsSchema.statusKerjaSchema,
  data: ref('Intern'),
  message: 'Status kerja berhasil diubah',
  errors: { 404: '' },
});

// ----- Magang: Absensi -----
const TAG_ABSEN = 'Magang - Absensi';
route('get', '/magang/attendances/today', {
  tag: TAG_ABSEN,
  summary: 'Status absensi saya hari ini',
  kode: 'MG-03, MG-05',
  permission: MAGANG.ABSEN,
  data: ref('StatusHariIni'),
  description: 'Dipakai frontend untuk mengunci/membuka tombol check-in, logbook, dan check-out. Tanggal dalam WIB.',
});
route('post', '/magang/attendances/checkin', {
  tag: TAG_ABSEN,
  summary: 'Check-in dengan foto dan lokasi',
  kode: 'MG-03, BR-01 s.d. BR-04, BR-07',
  permission: MAGANG.ABSEN,
  multipart: attendancesSchema.lokasiSchema,
  data: ref('Attendance'),
  status: 201,
  message: 'Check-in berhasil',
  description: 'On-site harus dalam radius kantor. Remote boleh dari mana saja, lokasi tetap dicatat.',
  errors: {
    400: 'Foto tidak ada (BR-03), di luar radius dengan pesan jarak (BR-01), atau di luar masa magang (BR-07)',
    404: 'Akun ini bukan anak magang',
    409: 'Sudah check-in hari ini (BR-04)',
    413: '',
  },
});
route('post', '/magang/attendances/checkout', {
  tag: TAG_ABSEN,
  summary: 'Check-out dengan foto dan lokasi',
  kode: 'MG-05, BR-01, BR-04, BR-05',
  permission: MAGANG.ABSEN,
  multipart: attendancesSchema.lokasiSchema,
  data: ref('Attendance'),
  message: 'Check-out berhasil',
  errors: {
    400: 'Belum check-in, logbook hari ini belum diisi (BR-05), di luar radius, atau di luar masa magang',
    404: 'Akun ini bukan anak magang',
    409: 'Sudah check-out hari ini (BR-04)',
    413: '',
  },
});
route('get', '/magang/attendances/me', {
  tag: TAG_ABSEN,
  summary: 'Riwayat absensi saya',
  kode: 'MG-09',
  permission: MAGANG.ABSEN,
  query: attendancesSchema.periodeQuery,
  data: daftar('AttendanceRecap'),
});
route('get', '/magang/attendances', {
  tag: TAG_ABSEN,
  summary: 'Rekap absensi semua anak magang',
  kode: 'MG-09',
  permission: MAGANG.KELOLA,
  query: attendancesSchema.rekapQuery,
  data: daftar('AttendanceRecap'),
});
route('patch', '/magang/attendances/:id', {
  tag: TAG_ABSEN,
  summary: 'Koreksi absensi',
  kode: 'MG-10',
  permission: MAGANG.KELOLA,
  params: idParam,
  body: attendancesSchema.koreksiSchema,
  data: ref('Attendance'),
});
route('get', '/magang/attendances/photos/:filename', {
  tag: TAG_ABSEN,
  summary: 'Buka foto absensi',
  kode: 'NF-06',
  permission: MAGANG.KELOLA,
  params: attendancesSchema.fotoParam,
  description: 'Mengembalikan file gambar (bukan JSON). Hanya admin.',
  errors: { 404: 'File tidak ada' },
});
paths['/magang/attendances/photos/{filename}'].get.responses[200] = {
  description: 'File foto',
  content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
};

// ----- Magang: Logbook -----
const TAG_LOGBOOK = 'Magang - Logbook';
route('get', '/magang/logbooks/today', {
  tag: TAG_LOGBOOK,
  summary: 'Logbook saya hari ini',
  kode: 'MG-04',
  permission: MAGANG.ABSEN,
  data: { oneOf: [ref('Logbook'), { type: 'null' }] },
  description: '`data` bernilai `null` jika belum diisi.',
});
route('put', '/magang/logbooks/today', {
  tag: TAG_LOGBOOK,
  summary: 'Isi / ubah logbook hari ini',
  kode: 'MG-04',
  permission: MAGANG.ABSEN,
  body: logbooksSchema.isiSchema,
  data: ref('Logbook'),
  message: 'Logbook berhasil disimpan',
  errors: { 400: 'Logbook kosong, belum check-in, atau sudah check-out' },
});
route('get', '/magang/logbooks/me', {
  tag: TAG_LOGBOOK,
  summary: 'Riwayat logbook saya',
  kode: 'MG-04',
  permission: MAGANG.ABSEN,
  query: logbooksSchema.periodeQuery,
  data: daftar('Logbook'),
});
route('get', '/magang/logbooks', {
  tag: TAG_LOGBOOK,
  summary: 'Rekap logbook semua anak magang',
  kode: 'MG-09',
  permission: MAGANG.KELOLA,
  query: logbooksSchema.listQuery,
  data: daftar('LogbookRecap'),
});

// ----- Magang: Tugas -----
const TAG_TUGAS = 'Magang - Tugas';
route('get', '/magang/tasks/me', {
  tag: TAG_TUGAS,
  summary: 'Tugas saya',
  kode: 'MG-08',
  permission: MAGANG.ABSEN,
  data: daftar('Task'),
});
route('patch', '/magang/tasks/:id/progress', {
  tag: TAG_TUGAS,
  summary: 'Perbarui status dan progres tugas saya',
  kode: 'MG-07',
  permission: MAGANG.ABSEN,
  params: idParam,
  body: tasksSchema.progressSchema,
  data: ref('Task'),
  message: 'Progres tugas berhasil diperbarui',
  errors: { 404: 'Tugas tidak ada atau bukan milik Anda' },
});
route('get', '/magang/tasks', {
  tag: TAG_TUGAS,
  summary: 'Daftar semua tugas',
  kode: 'MG-06',
  permission: MAGANG.KELOLA,
  query: tasksSchema.listQuery,
  data: daftar('Task'),
});
route('post', '/magang/tasks', {
  tag: TAG_TUGAS,
  summary: 'Beri tugas',
  kode: 'MG-06',
  permission: MAGANG.KELOLA,
  body: tasksSchema.createSchema,
  data: ref('Task'),
  status: 201,
  message: 'Tugas berhasil dibuat',
  errors: { 400: 'Termasuk anak magang tidak ditemukan' },
});
route('patch', '/magang/tasks/:id', {
  tag: TAG_TUGAS,
  summary: 'Ubah tugas',
  kode: 'MG-06',
  permission: MAGANG.KELOLA,
  params: idParam,
  body: tasksSchema.updateSchema,
  data: ref('Task'),
  message: 'Tugas berhasil diubah',
  errors: { 404: '' },
});
route('delete', '/magang/tasks/:id', {
  tag: TAG_TUGAS,
  summary: 'Hapus tugas',
  kode: 'MG-06',
  permission: MAGANG.KELOLA,
  params: idParam,
  message: 'Tugas berhasil dihapus',
  errors: { 404: '' },
});

// ----- Keuangan: Kategori -----
const TAG_KATEGORI = 'Keuangan - Kategori';
route('get', '/keuangan/categories', {
  tag: TAG_KATEGORI,
  summary: 'Daftar kategori',
  kode: 'KU-01',
  permission: KEUANGAN.KELOLA,
  query: categoriesSchema.listQuery,
  data: daftar('Category'),
});
route('post', '/keuangan/categories', {
  tag: TAG_KATEGORI,
  summary: 'Tambah kategori',
  kode: 'KU-01',
  permission: KEUANGAN.KELOLA,
  body: categoriesSchema.createSchema,
  data: ref('Category'),
  status: 201,
  message: 'Kategori berhasil ditambahkan',
  errors: { 409: 'Nama dan jenis yang sama sudah ada' },
});
route('patch', '/keuangan/categories/:id', {
  tag: TAG_KATEGORI,
  summary: 'Ubah nama / aktifkan / nonaktifkan kategori',
  kode: 'KU-01',
  permission: KEUANGAN.KELOLA,
  params: idParam,
  body: categoriesSchema.updateSchema,
  data: ref('Category'),
  message: 'Kategori berhasil diubah',
  description: 'Jenis kategori tidak bisa diubah.',
  errors: { 404: '', 409: 'Nama dan jenis yang sama sudah ada' },
});
route('delete', '/keuangan/categories/:id', {
  tag: TAG_KATEGORI,
  summary: 'Hapus kategori',
  kode: 'KU-01',
  permission: KEUANGAN.KELOLA,
  params: idParam,
  message: 'Kategori berhasil dihapus',
  errors: { 404: '', 409: 'Kategori sudah dipakai transaksi, nonaktifkan saja' },
});

// ----- Keuangan: Transaksi & Ringkasan -----
const TAG_TRANSAKSI = 'Keuangan - Transaksi';
route('get', '/keuangan/transactions', {
  tag: TAG_TRANSAKSI,
  summary: 'Tabel debit-kredit + saldo berjalan',
  kode: 'KU-04',
  permission: KEUANGAN.KELOLA,
  query: transactionsSchema.listQuery,
  data: ref('Ledger'),
  description: 'Pilih bulan atau rentang dari/sampai. Urut tanggal lalu id. Saldo awal berasal dari transaksi sebelum awal periode. Filter jenis/kategori berlaku juga pada saldo awal dan saldo berjalan. Semua perhitungan mengabaikan transaksi terhapus.',
});
route('post', '/keuangan/transactions', {
  tag: TAG_TRANSAKSI,
  summary: 'Catat transaksi',
  kode: 'KU-02, BR-11',
  permission: KEUANGAN.KELOLA,
  body: transactionsSchema.createSchema,
  data: ref('Transaction'),
  status: 201,
  message: 'Transaksi berhasil dicatat',
  errors: { 400: 'Nominal <= 0, kategori tidak ada/nonaktif, atau kategori tidak sesuai jenis' },
});
route('patch', '/keuangan/transactions/:id', {
  tag: TAG_TRANSAKSI,
  summary: 'Ubah transaksi',
  kode: 'KU-03',
  permission: KEUANGAN.KELOLA,
  params: idParam,
  body: transactionsSchema.updateSchema,
  data: ref('Transaction'),
  message: 'Transaksi berhasil diubah',
  errors: { 400: 'Kategori tidak sesuai jenis atau nonaktif', 404: 'Tidak ada atau sudah dihapus' },
});
route('delete', '/keuangan/transactions/:id', {
  tag: TAG_TRANSAKSI,
  summary: 'Hapus transaksi (soft delete)',
  kode: 'KU-03, BR-10',
  permission: KEUANGAN.KELOLA,
  params: idParam,
  message: 'Transaksi berhasil dihapus',
  description: 'Data tetap tersimpan sebagai riwayat dan tidak dihitung di saldo. Konfirmasi hapus dilakukan di frontend.',
  errors: { 404: 'Tidak ada atau sudah dihapus' },
});
route('get', '/keuangan/summary', {
  tag: TAG_TRANSAKSI,
  summary: 'Ringkasan keuangan per bulan',
  kode: 'KU-05',
  permission: KEUANGAN.LIHAT,
  query: summarySchema.summaryQuery,
  data: ref('FinancialSummary'),
  description: 'Default bulan berjalan dalam WIB. Total dan rincian kategori mengabaikan transaksi soft delete; bulan kosong menghasilkan nol dan per_kategori kosong.',
});

module.exports = {
  openapi: '3.1.0',
  info: {
    title: 'MetroHub API',
    version: '1.0.0',
    description:
      'REST API Sistem Informasi Manajemen Magang dan Keuangan Metro Software.\n\n' +
      'Cara mencoba: jalankan `POST /auth/login` di halaman ini, cookie `token` otomatis tersimpan ' +
      'di browser lalu dipakai request berikutnya. Logout mencabut sesi di server; ubah password mengakhiri semua sesi akun.\n\n' +
      'Semua respons memakai format `{ success, message, data }`; error memakai `{ success: false, message, details? }`.',
  },
  // Relatif terhadap halaman docs, jadi berlaku di lokal maupun production
  servers: [{ url: '/api/v1' }],
  tags: [
    'Auth',
    'Pengguna',
    'Role & Hak Akses',
    'Dashboard & Lokasi',
    TAG_INTERN,
    TAG_ABSEN,
    TAG_LOGBOOK,
    TAG_TUGAS,
    TAG_KATEGORI,
    TAG_TRANSAKSI,
  ].map((name) => ({ name })),
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas,
  },
};
