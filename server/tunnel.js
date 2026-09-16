import { spawn } from 'node:child_process';

export function extractTunnelUrl(log) {
  return log.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=[\s/|]|$)/i)?.[0]?.toLowerCase() || null;
}

// cloudflared is a separate process: never install a daemon or alter global config.
export function startTunnel(port, { onExit = () => {}, spawnProcess = spawn } = {}) {
  const child = spawnProcess('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stopping = false, settled = false, buffer = '', timer;
  const ready = new Promise((resolve, reject) => {
    const fail = message => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(message)); } };
    timer = setTimeout(() => {
      fail('Cloudflare-linkkiä ei saatu 45 sekunnissa. Tarkista internetyhteys ja mahdollinen ~/.cloudflared/config.yaml.');
      child.kill('SIGTERM');
    }, 45000);
    const read = chunk => {
      buffer = (buffer + chunk.toString()).slice(-16384);
      const url = extractTunnelUrl(buffer);
      if (url && !settled) { settled = true; clearTimeout(timer); resolve(url); }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', error => fail(error.code === 'ENOENT' ? 'cloudflared puuttuu. Asenna: brew install cloudflared' : error.message));
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (!settled) fail(`cloudflared päättyi (${code ?? signal}). ${buffer.slice(-1200)}`);
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
