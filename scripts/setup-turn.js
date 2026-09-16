import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../.env', import.meta.url));
try {
  let source = readFileSync(file, 'utf8');
  const env = parseEnv(source);
  const domain = env.METERED_DOMAIN?.trim();
  if (!/^[a-z0-9-]+\.metered\.live$/i.test(domain || '')) throw new Error('Tarkista METERED_DOMAIN.');
  const secret = env.METERED_SECRET_KEY?.trim();
  if (!secret) throw new Error('Lisää .env-tiedostoon METERED_SECRET_KEY=... Meteredin Developers-näkymästä.');
  if (env.METERED_API_KEY?.trim()) throw new Error('METERED_API_KEY on jo asetettu. Tyhjennä se vain, jos haluat luoda uuden TURN-tunnuksen.');
  const url = new URL(`https://${domain}/api/v1/turn/credential`);
  url.searchParams.set('secretKey', secret);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'office-audio' }), signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(`Metered hylkäsi luonnin (HTTP ${response.status}). Tarkista Secret Key ja TURN-palvelun aktivointi.`);
  const data = await response.json();
  if (typeof data.apiKey !== 'string' || !data.apiKey) throw new Error('Metered ei palauttanut API-avainta. Tarkista TURN-tunnus hallinnasta ennen uutta yritystä.');
  const line = `METERED_API_KEY=${JSON.stringify(data.apiKey)}`;
  source = /^METERED_API_KEY=.*$/m.test(source) ? source.replace(/^METERED_API_KEY=.*$/m, line) : `${source}\n${line}\n`;
  writeFileSync(file, source, { mode: 0o600 }); chmodSync(file, 0o600);
  console.log('TURN-tunnus luotu ja API-avain tallennettu .env-tiedostoon. Odota noin 2 minuuttia ennen ensimmäistä ääniyhteyttä. Käynnistä appi uudelleen.');
} catch (error) {
  // Fetch errors can contain a credential-bearing URL: print only our known errors.
  const safe = ['Tarkista', 'Lisää', 'METERED_API_KEY', 'Metered'];
  console.error(safe.some(prefix => error.message.startsWith(prefix)) ? error.message : 'TURN-tunnuksen luonti epäonnistui. Tarkista yhteys ja .env-tiedosto.');
  process.exitCode = 1;
}
