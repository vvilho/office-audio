import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

const token = () => randomBytes(24).toString('hex');
const equals = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createOfficeServer({ serverFactory, dist, origins, listenerUrls, maxListeners = 20, tunnel = false, rtcProvider = async () => ({ iceServers: [], iceTransportPolicy: 'all' }), turnEnabled = false, sessionTokens }) {
  const hostToken = sessionTokens?.hostToken || token(), joinToken = sessionTokens?.joinToken || token();
  const app = express();
  app.disable('x-powered-by');
  // Only enable proxy headers for the loopback-only cloudflared origin server.
  if (tunnel) app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    if (!origins.includes(`${req.protocol}://${req.headers.host}`)) return res.sendStatus(403);
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'microphone=(self), camera=()',
      'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${req.secure ? 'wss' : 'ws'}://${req.headers.host}; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` });
    next();
  });
  app.get('/api/rtc', async (req, res) => {
    const credential = req.headers.authorization?.replace(/^Bearer /, '');
    if (!equals(credential, hostToken) && !equals(credential, joinToken)) return res.sendStatus(401);
    try { res.json(await rtcProvider()); }
    catch (error) {
      const messages = {
        TURN_KEY_TYPE: 'Asetuksissa on Secret Key, mutta TURN-tunnuksen API Key puuttuu. Lisää Meteredin TURN Server -sivun API Key riville METERED_API_KEY.',
        TURN_AUTH: 'Metered hylkäsi TURN API-avaimen. METERED_API_KEY-riville tarvitaan TURN-tunnuksen API Key, ei Developers-sivun Secret Key.'
      };
      res.status(503).json({ error: messages[error.code] || 'TURN-yhteystietoja ei saatu. Tarkista internetyhteys ja Metered-palvelu.' });
    }
  });
  app.get('/api/host', async (req, res) => {
    if (!equals(req.headers.authorization?.replace(/^Bearer /, ''), hostToken)) return res.sendStatus(401);
    const urls = listenerUrls.map(url => `${url}/#join=${joinToken}`);
    res.json({ urls, qr: await Promise.all(urls.map(url => QRCode.toDataURL(url, { width: 320, margin: 2 }))), maxListeners, tunnel, turnEnabled });
  });
  app.use(express.static(dist));
  app.get('/host', (req, res) => res.sendFile(`${dist}/index.html`));
  const server = serverFactory(app);
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  let host = null, live = false;
  const listeners = new Map();
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const status = () => {
    const data = { type: 'status', live, count: listeners.size };
    send(host, data); for (const ws of listeners.values()) send(ws, data);
  };
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/signal' || !origins.includes(req.headers.origin) || !origins.some(o => new URL(o).host === req.headers.host) || wss.clients.size >= maxListeners + 10) {
      socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const authTimer = setTimeout(() => ws.close(4001, 'Authentication timeout'), 5000);
    let role, id, count = 0, windowStart = Date.now();
    ws.on('message', raw => {
      if (Date.now() - windowStart > 1000) { count = 0; windowStart = Date.now(); }
      if (++count > 150) return ws.close(4008, 'Rate limit');
      let m; try { m = JSON.parse(raw); } catch { return ws.close(4002, 'Invalid JSON'); }
      if (!m || typeof m !== 'object') return ws.close(4002, 'Invalid message');
      if (!role) {
        if (m.type !== 'auth') return ws.close(4001, 'Authenticate first');
        if (m.role === 'host' && equals(m.token, hostToken)) {
          if (host) return ws.close(4009, 'Host already open');
          host = ws; role = 'host';
        } else if (m.role === 'listener' && equals(m.token, joinToken)) {
          if (listeners.size >= maxListeners) return ws.close(4010, 'Room full');
          role = 'listener'; id = randomUUID(); listeners.set(id, ws);
        } else return ws.close(4003, 'Invalid invitation');
        clearTimeout(authTimer);
        send(ws, { type: 'ready', id }); status();
        if (role === 'listener' && live) send(host, { type: 'peer', id });
        return;
      }
      if (role === 'host' && m.type === 'live' && typeof m.live === 'boolean') {
        const wasLive = live; live = m.live; status();
        if (live && !wasLive) for (const id of listeners.keys()) send(host, { type: 'peer', id });
      } else if (role === 'listener' && m.type === 'retry' && live) {
        send(host, { type: 'peer', id });
      } else if (m.type === 'signal') {
        const data = m.data;
        if (!data || typeof data !== 'object') return;
        const valid = data.candidate || (data.description && data.description.type === (role === 'host' ? 'offer' : 'answer') && typeof data.description.sdp === 'string');
        if (!valid || !live) return;
        if (role === 'host') send(listeners.get(m.id), { type: 'signal', data });
        else send(host, { type: 'signal', id, data });
      }
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (ws === host) { host = null; live = false; }
      if (id) { listeners.delete(id); send(host, { type: 'leave', id }); }
      status();
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
  }, 15000);
  heartbeat.unref();
  return { server, hostToken, joinToken, close: async () => {
    clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate();
    wss.close();
    await new Promise(resolve => { server.close(resolve); for (const socket of sockets) socket.destroy(); });
  } };
}
