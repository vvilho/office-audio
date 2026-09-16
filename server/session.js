import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export function loadSession(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'session.json');
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!['hostToken', 'joinToken'].every(key => /^[a-f0-9]{48}$/.test(data[key] || '')) || data.hostToken === data.joinToken) throw new Error('Invalid session');
    chmodSync(file, 0o600);
    return data;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Paikallinen .local/session.json ei ole kelvollinen. Palauta se tai poista se uusien liittymislinkkien luomiseksi.');
  }
  const data = { hostToken: randomBytes(24).toString('hex'), joinToken: randomBytes(24).toString('hex') };
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return data;
}
