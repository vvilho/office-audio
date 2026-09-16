import http from 'node:http';
import { loadEnvFile } from 'node:process';
import { createRtcProvider } from './rtc.js';
import { startTunnel } from './tunnel.js';
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createOfficeServer } from './app.js';
const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(`${root}.env`)) loadEnvFile(`${root}.env`);
const rtc = createRtcProvider({ domain: process.env.METERED_DOMAIN, apiKey: process.env.METERED_API_KEY, secretKeyPresent: !!process.env.METERED_SECRET_KEY?.trim(), relayOnly: process.env.TURN_RELAY_ONLY !== 'false' });
const tunnelMode = process.argv.includes('--tunnel');
const local = process.argv.includes('--local') || tunnelMode;
const port = Number(process.env.PORT || 8443);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
const ips = [...new Set(Object.values(networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal).map(n => n.address))];
const scheme = local ? 'http' : 'https';
const origins = ['localhost', '127.0.0.1', ...(local ? [] : ips)].map(ip => `${scheme}://${ip}:${port}`);
if (!existsSync(`${root}dist/index.html`)) { console.error('Suorita ensin npm run build'); process.exit(1); }
let tls;
if (!local) {
  try { tls = { key: readFileSync(`${root}certs/key.pem`), cert: readFileSync(`${root}certs/cert.pem`) }; }
  catch { console.error('HTTPS-varmenne puuttuu. Suorita npm run certs. Paikallinen UI-kokeilu: npm run demo'); process.exit(1); }
}
const listenerUrls = local ? [origins[0]] : origins.slice(2);
let tunnel, shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await tunnel?.stop();
  await office.close();
  process.exit(code);
}
const office = createOfficeServer({ serverFactory: app => local ? http.createServer(app) : https.createServer(tls, app), dist: `${root}dist`, origins, listenerUrls, tunnel: tunnelMode, rtcProvider: rtc.get, turnEnabled: rtc.enabled });
office.server.listen(port, local ? '127.0.0.1' : '0.0.0.0', async () => {
  if (tunnelMode) {
    console.log('Avataan Cloudflare HTTPS -tunnelia…');
    tunnel = startTunnel(port, { onExit: () => { console.error('Cloudflare-tunneli sulkeutui. Käynnistä npm run tunnel uudelleen.'); shutdown(1); } });
    try {
      const url = await tunnel.ready;
      if (shuttingDown) return;
      origins.push(url);
      listenerUrls.splice(0, listenerUrls.length, url);
      console.log(`Julkinen kuuntelulinkki: ${url}/#join=${office.joinToken}\nKuuntelulaitteisiin ei tarvita omaa varmennetta. ${rtc.enabled ? 'TURN käytössä: kuuntelijat voivat liittyä omista verkoistaan.' : 'TURN ei käytössä: käytä samaa lähiverkkoa ääntä varten.'}`);
    } catch (error) { console.error(error.message); await shutdown(1); return; }
  }
  console.log(`\nOffice Audio\nAvaa lähettäjänä Chrome/Edge:\n${origins[0]}/host#host=${office.hostToken}\n`);
  console.log(tunnelMode ? 'QR-koodi löytyy lähettäjän sivulta. Ctrl+C sulkee myös tunnelin.' : local ? 'Paikallinen kokeilu — ei tavoitettavissa puhelimesta.' : `LAN-osoitteet: ${origins.slice(2).join(', ')}\nJaa kuuntelulinkki ja QR lähettäjän sivulta. Pidä tämä pääte auki.`);
});
office.server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Portti ${port} on varattu. Käytä PORT=8444 npm start.` : e.message); process.exit(1); });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => shutdown());
