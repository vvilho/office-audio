import { spawnSync } from 'node:child_process';
import { mkdirSync, chmodSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(args) {
  const result = spawnSync('mkcert', args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) { console.error('Asenna ensin: brew install mkcert. Katso README.'); process.exit(1); }
}
mkdirSync(`${root}certs`, { recursive: true, mode: 0o700 });
run(['-install']);
const ips = [...new Set(Object.values(networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal).map(n => n.address))];
run(['-key-file', `${root}certs/key.pem`, '-cert-file', `${root}certs/cert.pem`, 'localhost', '127.0.0.1', ...ips]);
chmodSync(`${root}certs/key.pem`, 0o600);
console.log('Varmenteet valmiit. Luota mkcertin rootCA.pem-tiedostoon myös kuuntelulaitteissa (README). ÄLÄ jaa rootCA-key.pem-tiedostoa.');
