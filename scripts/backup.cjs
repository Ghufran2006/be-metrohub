// Jalankan setiap hari melalui scheduler dengan DATABASE_URL dan BACKUP_DIR.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');

async function main() {
  if (!process.env.DATABASE_URL || !process.env.BACKUP_DIR) throw new Error('DATABASE_URL dan BACKUP_DIR wajib diisi');
  const url = new URL(process.env.DATABASE_URL);
  if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL harus memakai mysql:');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Nama database tidak valid');
  const retention = Number(process.env.BACKUP_RETENTION_DAYS ?? 7);
  if (!Number.isInteger(retention) || retention < 1 || retention > 365) throw new Error('Retensi backup harus 1-365 hari');
  const folder = path.resolve(process.env.BACKUP_DIR);
  await fsp.mkdir(folder, { recursive: true, mode: 0o700 });
  const name = `metrohub-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sql.gz`;
  const output = path.join(folder, name);
  const partial = output + '.partial';
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'metrohub-backup-'));
  const config = path.join(temp, 'client.cnf');
  const quote = (value) => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
  try {
    await fsp.writeFile(config, '[client]\n' + [
      ['host', url.hostname], ['port', url.port || '3306'],
      ['user', decodeURIComponent(url.username)], ['password', decodeURIComponent(url.password)],
    ].map(([key, value]) => `${key}=${quote(value)}`).join('\n') + '\n', { mode: 0o600 });
    const dump = spawn(process.env.MYSQLDUMP_BIN || 'mysqldump', [
      `--defaults-extra-file=${config}`, '--single-transaction', '--no-tablespaces',
      '--routines', '--triggers', '--events', '--default-character-set=utf8mb4', database,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    // Kredensial tidak masuk argumen command line atau log.
    let error = '';
    dump.stderr.on('data', (chunk) => { error = (error + chunk).slice(-4096); });
    const completed = new Promise((resolve, reject) => {
      dump.once('error', reject);
      dump.once('close', (code) => code === 0 ? resolve() : reject(new Error(`mysqldump gagal (${code}): ${error}`)));
    });
    const compressed = pipeline(dump.stdout, createGzip(), fs.createWriteStream(partial, { flags: 'wx', mode: 0o600 }));
    compressed.catch(() => dump.kill());
    const results = await Promise.allSettled([completed, compressed]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    await fsp.rename(partial, output);
    const cutoff = Date.now() - retention * 86400000;
    for (const file of await fsp.readdir(folder)) {
      if (!/^metrohub-\d{4}-\d{2}-\d{2}T[\dTZ-]+-[\da-f-]{36}\.sql\.gz$/.test(file) || file === name) continue;
      const candidate = path.join(folder, file);
      const stat = await fsp.lstat(candidate);
      if (stat.isFile() && stat.mtimeMs < cutoff) await fsp.unlink(candidate);
    }
    console.log(`Backup selesai: ${output}`);
  } finally {
    await fsp.unlink(partial).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    // Hanya file sementara yang dibuat oleh proses ini yang dihapus.
    await fsp.unlink(config).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    await fsp.rmdir(temp);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
