const { z } = require('zod');
const { tanggal, bulan, periodeQuery } = require('../../../shared/utils/commonSchemas');

const jenis = z.enum(['PEMASUKAN', 'PENGELUARAN']);

// KU-04: ?bulan=YYYY-MM atau ?dari=&sampai=
const listQuery = periodeQuery.and(
  z.object({
    bulan: bulan.optional(),
    jenis: jenis.optional(),
    category_id: z.coerce.number().int().positive().optional(),
  }),
).refine((q) => !q.bulan || (!q.dari && !q.sampai), {
  message: 'Pilih filter bulan atau rentang tanggal', path: ['bulan'],
});

// KU-02, BR-11: nominal > 0. Kecocokan kategori dengan jenis dicek di service.
const createSchema = z.object({
  tanggal,
  jenis,
  category_id: z.number().int().positive(),
  nominal: z.number().positive('Nominal harus lebih dari 0').max(9999999999999.99).multipleOf(0.01),
  keterangan: z.string().trim().max(5000).optional(),
});

const updateSchema = createSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Tidak ada data yang diubah');

module.exports = { listQuery, createSchema, updateSchema };
