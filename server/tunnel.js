import { spawn } from 'node:child_process';

export function extractTunnelUrl(log) {
  return log.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=[\s/|]|$)/i)?.[0]?.toLowerCase() || null;
}

export function namedTunnelConfig(token = '', publicUrl = '') {
  token = token.trim(); publicUrl = publicUrl.trim();
  if (!token && !publicUrl) return null;
  if (!token || !publicUrl) throw new Error('Nimetty tunneli tarvitsee sekä CLOUDFLARE_TUNNEL_TOKEN- että PUBLIC_URL-asetuksen.');
  if (/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token)) throw new Error('CLOUDFLARE_TUNNEL_TOKEN sisältää tunnel ID:n. Tarvitaan käynnistyskomennon pitkä token.');
  let url;
  try { url = new URL(publicUrl); } catch { throw new Error('PUBLIC_URL ei ole kelvollinen HTTPS-osoite.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('PUBLIC_URL pitää olla pelkkä HTTPS-osoite, esimerkiksi https://audio.koiraharju.fi');
  return { token, publicUrl: url.origin };
}

// cloudflared is a separate process: never install a daemon or alter global config.
export function startTunnel(port, { onExit = () => {}, spawnProcess = spawn, token = '', publicUrl = '' } = {}) {
  const named = namedTunnelConfig(token, publicUrl);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(METERED_|CLOUDFLARE_TUNNEL_TOKEN$|TUNNEL_TOKEN|TUNNEL_CRED_CONTENTS$)/.test(key)) delete env[key];
  if (named) env.TUNNEL_TOKEN = named.token;
  const args = named ? ['tunnel', '--no-autoupdate', 'run'] : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`];
  const child = spawnProcess('cloudflared', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stopping = false, settled = false, buffer = '', timer;
  const ready = new Promise((resolve, reject) => {
    const fail = message => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(message)); } };
    timer = setTimeout(() => {
      fail(named ? 'Nimetty tunneli ei yhdistynyt 45 sekunnissa. Tarkista tunnel token ja internetyhteys.' : 'Cloudflare-linkkiä ei saatu 45 sekunnissa. Tarkista internetyhteys ja mahdollinen ~/.cloudflared/config.yaml.');
      child.kill('SIGTERM');
    }, 45000);
    const read = chunk => {
      buffer = (buffer + chunk.toString()).slice(-16384);
      const url = named ? (/Registered tunnel connection/.test(buffer) ? named.publicUrl : null) : extractTunnelUrl(buffer);
      if (url && !settled) { settled = true; clearTimeout(timer); resolve(url); }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', error => fail(error.code === 'ENOENT' ? 'cloudflared puuttuu. Asenna: brew install cloudflared' : 'cloudflared-prosessin käynnistys epäonnistui.'));
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (!settled) fail(`cloudflared päättyi (${code ?? signal}). Tarkista token (ei tunnel ID), yhteys ja tunnelin asetukset Cloudflaressa.`);
      else if (!stopping) onExit(code, signal);
    });
  });
  return { ready, stop: async () => {
    stopping = true; clearTimeout(timer);
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    await new Promise(resolve => {
      const force = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.once('exit', () => { clearTimeout(force); resolve(); });
      child.kill('SIGTERM');
    });
  } };
}
