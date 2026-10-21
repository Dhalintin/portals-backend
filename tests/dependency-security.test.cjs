const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const proxyaddr = require('proxy-addr');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('IPv4-mapped trust prefixes cannot trust arbitrary public IPv4 clients', () => {
  const trust = proxyaddr.compile('::ffff:10.0.0.0/8');
  assert.equal(trust('203.0.113.9', 0), false);
  const correctlyScoped = proxyaddr.compile('10.0.0.0/8');
  assert.equal(correctlyScoped('10.1.2.3', 0), true);
  assert.equal(correctlyScoped('203.0.113.9', 0), false);
});

test('untrusted forwarded addresses cannot replace the socket address used for rate limiting', async () => {
  const app = express();
  app.get('/', (req, res) => res.json({ ip: req.ip, peer: req.socket.remoteAddress }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    const body = await response.json(); assert.equal(body.ip, body.peer);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('native Node watch restarts compiled JavaScript after a file change', { timeout: 30000 }, async () => {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'schoolos-watch-'));
  const file = path.join(directory, 'server.cjs');
  let child;
  try {
    await fs.writeFile(file, "console.log('WATCH_VERSION_ONE');\n");
    child = spawn(process.execPath, ['--watch', '--watch-preserve-output', file], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const listeners = new Set();
    const collect = chunk => { output += chunk.toString(); for (const listener of listeners) listener(); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const waitFor = text => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { listeners.delete(check); reject(new Error(`Watch output did not contain ${text}`)); }, 10000);
      const check = () => { if (output.includes(text)) { clearTimeout(timer); listeners.delete(check); resolve(); } };
      listeners.add(check); check();
    });
    await waitFor('WATCH_VERSION_ONE');
    await waitFor('Completed running');
    await fs.writeFile(file, "console.log('WATCH_VERSION_TWO');\n");
    await waitFor('WATCH_VERSION_TWO');
  } finally {
    if (child && child.exitCode === null) {
      const closed = new Promise(resolve => child.once('close', resolve)); child.kill(); await closed;
    }
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), temporaryRoot.toLowerCase());
    assert.ok(path.basename(resolved).startsWith('schoolos-watch-'));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
});
