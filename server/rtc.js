// The Metered API key stays on Node. Browsers receive only ICE credentials.
export function createRtcProvider({ domain = '', apiKey = '', relayOnly = true, fetcher = fetch, secretKeyPresent = false } = {}) {
  domain = domain.trim(); apiKey = apiKey.trim();
  if (!apiKey && secretKeyPresent) return { enabled: true, get: async () => { const e = new Error('Missing TURN API key'); e.code = 'TURN_KEY_TYPE'; throw e; } };
  if (!apiKey) return { enabled: false, get: async () => ({ iceServers: [], iceTransportPolicy: 'all' }) };
  if (!/^[a-z0-9-]+\.metered\.live$/i.test(domain)) throw new Error('METERED_DOMAIN pitää olla muodossa office-audio.metered.live');
  let cached, expires = 0, pending;
  async function load() {
    try {
      const url = new URL(`https://${domain}/api/v1/turn/credentials`);
      url.searchParams.set('apiKey', apiKey);
      const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) { const e = new Error('Provider rejected credentials'); e.code = [401, 403].includes(response.status) ? 'TURN_AUTH' : 'TURN_PROVIDER'; throw e; }
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) throw new Error('Invalid response');
      const iceServers = data.map(item => {
        const urls = Array.isArray(item.urls) ? item.urls : [item.urls];
        if (!urls.length || urls.some(url => typeof url !== 'string' || !/^(stun|stuns|turn|turns):[^\s]+$/.test(url))) throw new Error('Invalid ICE server');
        if (urls.some(url => /^turns?:/.test(url)) && (typeof item.username !== 'string' || typeof item.credential !== 'string')) throw new Error('Missing TURN credentials');
        return { urls, ...(typeof item.username === 'string' ? { username: item.username } : {}), ...(typeof item.credential === 'string' ? { credential: item.credential } : {}) };
      });
      if (!iceServers.some(item => item.urls.some(url => /^turns?:/.test(url)))) throw new Error('Missing TURN server');
      cached = { iceServers, iceTransportPolicy: relayOnly ? 'relay' : 'all' }; expires = Date.now() + 60000;
      return cached;
    } catch (cause) {
      // Never include the upstream URL, API key or response body in logs/errors.
      const error = new Error('TURN-asetusten haku epäonnistui. Tarkista lähettäjän .env-tiedoston TURN API-avain, palvelun osoite ja internetyhteys.');
      error.code = cause?.code === 'TURN_AUTH' ? 'TURN_AUTH' : 'TURN_PROVIDER';
      throw error;
    }
  }
  return { enabled: true, get: async () => {
    if (cached && Date.now() < expires) return cached;
    if (!pending) pending = load().finally(() => { pending = null; });
    return pending;
  } };
}
