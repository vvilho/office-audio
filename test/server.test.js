import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createOfficeServer } from '../server/app.js';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../dist', import.meta.url));
async function setup(t) {
  const origins = [], office = createOfficeServer({ serverFactory: app => http.createServer(app), dist, origins, listenerUrls: [], maxListeners: 2 });
  await new Promise(r => office.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${office.server.address().port}`; origins.push(origin);
  t.after(() => office.close());
  return { ...office, origin };
}
async function connect(office, role, token) {
  const ws = new WebSocket(office.origin.replace('http:', 'ws:') + '/signal', { origin: office.origin });
  const queue = [], waiters = [];
  ws.on('message', raw => { const data = JSON.parse(raw); queue.push(data); for (const w of waiters.splice(0)) w(); });
  const next = async type => {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const i = queue.findIndex(m => m.type === type); if (i >= 0) return queue.splice(i, 1)[0];
      await new Promise(r => { const timer = setTimeout(r, 50); waiters.push(() => { clearTimeout(timer); r(); }); });
    }
    throw new Error(`Missing ${type}: ${JSON.stringify(queue)}`);
  };
  await new Promise((r, reject) => { ws.once('open', r); ws.once('error', reject); });
  const send = m => ws.send(JSON.stringify(m)); send({ type: 'auth', role, token });
  return { ws, send, next };
}
test('auth protects host config and rejects unicode token without crashing', async t => {
  const o = await setup(t);
  assert.equal((await fetch(o.origin + '/api/host')).status, 401);
  assert.equal((await fetch(o.origin + '/api/host', { headers: { Authorization: `Bearer ${o.hostToken}` } })).status, 200);
  const bad = await connect(o, 'host', 'é'.repeat(48));
  const code = await new Promise(r => bad.ws.on('close', r)); assert.equal(code, 4003);
  assert.equal((await fetch(o.origin)).status, 200);
});
test('multiple listeners, role enforcement, signaling routing, stop and host disconnect', async t => {
  const o = await setup(t), h = await connect(o, 'host', o.hostToken); await h.next('ready');
  const a = await connect(o, 'listener', o.joinToken), b = await connect(o, 'listener', o.joinToken);
  const aId = (await a.next('ready')).id; await b.next('ready');
  a.send({ type: 'live', live: true });
  h.send({ type: 'live', live: true });
  const ids = [(await h.next('peer')).id, (await h.next('peer')).id]; assert.ok(ids.includes(aId));
  h.send({ type: 'signal', id: aId, data: { description: { type: 'offer', sdp: 'test' }, generation: 'one' } });
  assert.equal((await a.next('signal')).data.description.sdp, 'test');
  a.send({ type: 'signal', id: 'spoofed', data: { description: { type: 'answer', sdp: 'answer' } } });
  assert.equal((await h.next('signal')).id, aId);
  const third = await connect(o, 'listener', o.joinToken);
  assert.equal(await new Promise(r => third.ws.on('close', r)), 4010);
  h.send({ type: 'live', live: false });
  h.send({ type: 'live', live: true });
  assert.ok((await h.next('peer')).id);
  h.ws.close();
  let status; do { status = await a.next('status'); } while (status.live);
  assert.equal(status.live, false);
});
test('foreign websocket origin rejected', async t => {
  const o = await setup(t);
  const ws = new WebSocket(o.origin.replace('http:', 'ws:') + '/signal', { origin: 'https://evil.example' });
  const error = await new Promise(r => ws.on('error', r)); assert.ok(error);
});
