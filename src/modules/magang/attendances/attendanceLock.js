// Logbook dan check-out mengunci baris absensi yang sama dalam transaksi.
// Nilai selalu dibind melalui tagged template Prisma, bukan interpolasi SQL.
async function lockHari(tx, internId, tanggal) {
  await tx.$queryRaw`SELECT id FROM mg_attendances WHERE intern_id = ${internId} AND tanggal = ${tanggal} FOR UPDATE`;
}

module.exports = { lockHari };
