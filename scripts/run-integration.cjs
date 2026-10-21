const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Client } = require('pg');
const { testEnvironment } = require('./test-database.cjs');
const assert = require('node:assert/strict');
const execute = promisify(execFile);
const workspace = path.resolve(__dirname, '..');
const prismaCli = path.join(workspace, 'node_modules/prisma/build/index.js');
const tscCli = path.join(workspace, 'node_modules/typescript/bin/tsc');

async function postgresBinaryDirectory() {
  const candidates = process.env.POSTGRES_BIN ? [process.env.POSTGRES_BIN] :
    process.platform === 'win32' ? [
      'C:/Program Files/PostgreSQL/17/bin', 'C:/Program Files/PostgreSQL/18/bin',
    ] : ['/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/usr/local/bin', '/usr/bin'];
  for (const directory of candidates) {
    const suffix = process.platform === 'win32' ? '.exe' : '';
    try {
      await fs.access(path.join(directory, `initdb${suffix}`));
      await fs.access(path.join(directory, `pg_ctl${suffix}`));
      return path.resolve(directory);
    } catch {}
  }
  throw new Error('PostgreSQL binaries were not found. Set POSTGRES_BIN to the directory containing initdb and pg_ctl.');
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function run(executable, args, env, timeout = 120_000) {
  try {
    const result = await execute(executable, args, { cwd: workspace, env, windowsHide: true,
      timeout, maxBuffer: 8 * 1024 * 1024 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result;
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

async function main() {
  const mode = process.argv.includes('--restore') ? 'restore' : process.argv.includes('--migrations') ? 'migrations' : 'integration';
  const bin = await postgresBinaryDirectory();
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const taskRoot = await fs.mkdtemp(path.join(temporaryRoot, 'schoolos-pg-'));
  const cluster = path.join(taskRoot, 'data');
  const logFile = path.join(taskRoot, 'postgres.log');
  const port = await unusedPort();
  const database = mode === 'migrations' ? 'schoolos_test_migrations' : 'schoolos_test';
  const databaseUrl = `postgresql://schoolos_test@127.0.0.1:${port}/${database}`;
  const env = testEnvironment(databaseUrl);
  let initialized = false;
  try {
    console.log(`[${mode}] Initializing a private PostgreSQL cluster on loopback port ${port}.`);
    await run(path.join(bin, `initdb${suffix}`), ['-D', cluster, '-U', 'schoolos_test',
      '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale'], env);
    initialized = true;
    await run(path.join(bin, `pg_ctl${suffix}`), ['-D', cluster, '-l', logFile,
      '-o', `-h 127.0.0.1 -p ${port} -F`, '-w', '-t', '30', 'start'], env, 45_000);
    const admin = new Client({ connectionString: `postgresql://schoolos_test@127.0.0.1:${port}/postgres` });
    await admin.connect();
    try { await admin.query(`CREATE DATABASE "${database}"`); }
    finally { await admin.end(); }

    if (mode !== 'integration') {
      await run(process.execPath, [prismaCli, 'migrate', 'deploy'], env);
      await run(process.execPath, [prismaCli, 'migrate', 'diff', '--from-config-datasource',
        '--to-schema', 'prisma/schema.prisma', '--script', '--exit-code'], env);
      console.log('[migrations] All migrations replayed successfully and match the Prisma schema.');
      if (mode === 'restore') {
        await run(process.execPath, [prismaCli, 'generate'], env);
        await run(process.execPath, ['prisma/seeds/index.cjs'], env);
        const restoredUrl = `postgresql://schoolos_test@127.0.0.1:${port}/schoolos_test_restore`;
        const source = new Client({ connectionString: databaseUrl });
        const restored = new Client({ connectionString: restoredUrl });
        await source.connect();
        try {
          await source.query('CREATE DATABASE schoolos_test_restore');
          const backup = path.join(taskRoot, 'test-backup.dump');
          await run(path.join(bin, `pg_dump${suffix}`), ['--dbname', databaseUrl, '--format=custom', '--file', backup], env);
          await run(path.join(bin, `pg_restore${suffix}`), ['--dbname', restoredUrl, '--exit-on-error', '--no-owner', backup], env);
          await restored.connect();
          const tables = await source.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
          assert.ok(tables.rows.length > 20, 'A complete migrated schema must be present');
          for (const { tablename } of tables.rows) {
            const table = `public."${tablename.replace(/"/g, '""')}"`;
            const sql = `SELECT count(*)::int AS count, md5(COALESCE(string_agg(row_json, E'\\n' ORDER BY row_json), '')) AS fingerprint FROM (SELECT to_jsonb(t)::text AS row_json FROM ${table} t) rows`;
            const original = (await source.query(sql)).rows;
            assert.deepEqual((await restored.query(sql)).rows, original, `Restored data differs for ${tablename}`);
          }
          assert.equal((await restored.query('SELECT count(*)::int AS count FROM "User"')).rows[0].count, 8);
          console.log(`[restore] Backup restored into a separate empty database; all ${tables.rows.length} tables match row counts and content fingerprints.`);
        } finally {
          await restored.end();
          await source.end();
        }
      }
    } else {
      await run(process.execPath, [prismaCli, 'generate'], env);
      // Schema snapshot tests are separate from migration replay. This runs
      // only against the empty database just created in this private cluster.
      await run(process.execPath, [prismaCli, 'db', 'push'], env);
      await run(process.execPath, [tscCli, '--outDir', '.test-build'], env);
      await run(process.execPath, ['--test', 'tests/postgres.integration.test.cjs'], env);
    }
  } catch (error) {
    try { console.error((await fs.readFile(logFile, 'utf8')).slice(-4000)); } catch {}
    throw error;
  } finally {
    let stopped = !initialized;
    if (initialized) {
      try {
        await run(path.join(bin, `pg_ctl${suffix}`), ['-D', cluster, '-m', 'immediate', '-w', '-t', '15', 'stop'], env, 20_000);
        stopped = true;
      } catch {
        // Never delete a cluster unless its own server has stopped.
        console.error(`Could not stop the private cluster. Preserved ${taskRoot}; stop it with pg_ctl before removing it.`);
      }
    }
    if (stopped) {
      const resolved = await fs.realpath(taskRoot);
      if (path.dirname(resolved).toLowerCase() !== temporaryRoot.toLowerCase() ||
          !path.basename(resolved).startsWith('schoolos-pg-')) {
        throw new Error('Refusing cleanup outside the private temporary cluster directory.');
      }
      // Windows can briefly retain a log handle after pg_ctl confirms shutdown.
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
  }
}

main().catch(error => { console.error(`PostgreSQL verification failed: ${error.message}`); process.exitCode = 1; });
