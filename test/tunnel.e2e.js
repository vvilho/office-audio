import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const hostUrl = process.env.HOST_URL;
const listenerUrl = process.env.LISTENER_URL;
test('live Cloudflare HTTPS + WebSocket signaling + real WebRTC audio', { skip: !hostUrl || !listenerUrl, timeout: 60000 }, async t => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
  t.after(() => browser.close());
  const errors = [];
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  host.on('pageerror', e => errors.push(e.message));
  await host.goto(hostUrl);
  await expect(host.getByText('● Yhteys palvelimeen')).toBeVisible();
  await expect(host.getByText('HTTPS valmis.', { exact: false })).toBeVisible();
  assert.equal(await host.getByRole('link', { name: 'Avaa kuuntelusivu ↗' }).getAttribute('href'), listenerUrl);
  const listeners = [];
  for (let i = 0; i < 2; i++) {
    // No ignoreHTTPSErrors: publicly trusted HTTPS is the feature under test.
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.testPeers = [];
      const Original = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Original { constructor(...args) { super(...args); window.testPeers.push(this); } };
      navigator.mediaDevices.getUserMedia = () => { throw new Error('Listener must not capture microphone'); };
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(listenerUrl);
    await page.getByRole('button', { name: '▶ Kuuntele', exact: true }).click();
    await expect(page.getByText('● Yhteys palvelimeen')).toBeVisible();
    listeners.push(page);
  }
  await expect(host.getByText('2 kuuntelijaa')).toBeVisible();
  await host.getByRole('button', { name: 'Kokeile yhteyttä testiäänellä' }).click();
  for (const page of listeners) {
    await expect.poll(() => page.evaluate(async () => {
      let energy = 0;
      for (const pc of window.testPeers) for (const stat of (await pc.getStats()).values()) {
        if (stat.type === 'inbound-rtp' && stat.kind === 'audio') energy += stat.totalAudioEnergy || 0;
      }
      return energy;
    }), { timeout: 20000 }).toBeGreaterThan(0);
  }
  await host.getByRole('button', { name: '■ Lopeta lähetys' }).click();
  await expect(listeners[0].getByRole('status')).toHaveText('Odotetaan lähettäjää…');
  assert.deepEqual(errors, []);
  console.log('Two listeners decoded real audio with public HTTPS and WSS via Cloudflare; TLS verification enabled.');
});
