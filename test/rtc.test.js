import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRtcProvider } from '../server/rtc.js';
import { createOfficeServer } from '../server/app.js';

test('no key retains LAN mode; invalid domain rejected before network call', async () => {
  assert.deepEqual(await createRtcProvider().get(), { iceServers: [], iceTransportPolicy: 'all' });
  assert.throws(() => createRtcProvider({ domain: 'untrusted.example', apiKey: 'example-key' }));
});
test('Metered credentials cached and sanitized; API key stays on server', async () => {
  let calls = 0;
  const provider = createRtcProvider({ domain: 'office-audio.metered.live', apiKey: 'server-secret', fetcher: async url => {
    calls++; assert.equal(url.hostname, 'office-audio.metered.live'); assert.equal(url.searchParams.get('apiKey'), 'server-secret');
    return { ok: true, json: async () => [{ urls: 'turns:relay.metered.ca:443?transport=tcp', username: 'user', credential: 'turn-password', apiKey: 'must-not-pass-through' }] };
  } });
  const results = await Promise.all([provider.get(), provider.get()]);
  await provider.get(); assert.equal(calls, 1);
  assert.equal(results[0].iceTransportPolicy, 'relay');
  assert.ok(!JSON.stringify(results).includes('server-secret'));
  assert.ok(!JSON.stringify(results).includes('must-not-pass-through'));
});
test('provider failure does not leak secrets or silently fall back to direct connection', async () => {
  const provider = createRtcProvider({ domain: 'office-audio.metered.live', apiKey: 'secret', fetcher: async () => { throw new Error('secret'); } });
  await assert.rejects(provider.get(), e => !e.message.includes('secret') && e.message.includes('TURN'));
});
test('ICE endpoint requires valid room token and reports provider errors', async t => {
  const origins = [];
  let fail = false;
  const office = createOfficeServer({ serverFactory: app => http.createServer(app), dist: fileURLToPath(new URL('../dist', import.meta.url)), origins, listenerUrls: [], rtcProvider: async () => {
    if (fail) throw new Error('private-provider-details');
    return { iceServers: [{ urls: 'turn:relay.example:3478', username: 'user', credential: 'pass' }], iceTransportPolicy: 'relay' };
  } });
  await new Promise(r => office.server.listen(0, '127.0.0.1', r)); t.after(() => office.close());
  const origin = `http://127.0.0.1:${office.server.address().port}`; origins.push(origin);
  assert.equal((await fetch(origin + '/api/rtc')).status, 401);
  for (const token of [office.hostToken, office.joinToken]) {
    const response = await fetch(origin + '/api/rtc', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); assert.equal((await response.json()).iceTransportPolicy, 'relay');
  }
  fail = true;
  const response = await fetch(origin + '/api/rtc', { headers: { Authorization: `Bearer ${office.joinToken}` } });
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private-provider-details'));
});

test('Secret Key without TURN API Key fails closed instead of silently using LAN', async () => {
  const provider = createRtcProvider({ domain: 'office-audio.metered.live', secretKeyPresent: true });
  assert.equal(provider.enabled, true);
  await assert.rejects(provider.get(), { code: 'TURN_KEY_TYPE' });
});
test('wrong credential type gives safe auth error without exposing provider body', async () => {
  const provider = createRtcProvider({ domain: 'office-audio.metered.live', apiKey: 'private-key', fetcher: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(provider.get(), e => e.code === 'TURN_AUTH' && !e.message.includes('private-key'));
});
