import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createOfficeServer } from '../server/app.js';
import { extractTunnelUrl } from '../server/tunnel.js';
import { WebSocket } from 'ws';

test('extract only complete Cloudflare Quick Tunnel URL', () => {
  assert.equal(extractTunnelUrl('INF | https://quiet-green-field.trycloudflare.com |'), 'https://quiet-green-field.trycloudflare.com');
  assert.equal(extractTunnelUrl('https://quiet-green-field.trycloudflare.co'), null);
  assert.equal(extractTunnelUrl('https://bad.trycloudflare.com.attacker.test'), null);
});
test('loopback proxy accepts registered public HTTPS origin, emits WSS CSP and tunnel QR', async t => {
  const origin = 'https://office-test.trycloudflare.com';
  const office = createOfficeServer({ serverFactory: app => http.createServer(app), dist: fileURLToPath(new URL('../dist', import.meta.url)), origins: [origin], listenerUrls: [origin], tunnel: true });
  await new Promise(r => office.server.listen(0, '127.0.0.1', r));
  t.after(() => office.close());
  const local = `http://127.0.0.1:${office.server.address().port}`;
  const headers = { Host: new URL(origin).host, 'X-Forwarded-Proto': 'https', Authorization: `Bearer ${office.hostToken}` };
  const request = (path, headers) => new Promise((resolve, reject) => {
    http.get(local + path, { headers }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: () => JSON.parse(body) }));
    }).on('error', reject);
  });
  const response = await request('/api/host', headers);
  assert.equal(response.status, 200);
  assert.ok(response.headers['content-security-policy'].includes('wss://office-test.trycloudflare.com'));
  const config = await response.json();
  assert.equal(config.tunnel, true); assert.equal(config.urls[0], `${origin}/#join=${office.joinToken}`);
  assert.ok(config.qr[0].startsWith('data:image/png;base64,'));
  assert.equal((await request('/', { ...headers, Host: 'attacker.test' })).status, 403);
  const ws = new WebSocket(local.replace('http:', 'ws:') + '/signal', { origin, headers: { Host: new URL(origin).host, 'X-Forwarded-Proto': 'https' } });
  t.after(() => ws.terminate());
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  const ready = new Promise(resolve => ws.once('message', raw => resolve(JSON.parse(raw))));
  ws.send(JSON.stringify({ type: 'auth', role: 'listener', token: office.joinToken }));
  assert.equal((await ready).type, 'ready');
});
