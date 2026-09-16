// One send-only peer per listener, with optional authenticated TURN configuration.
export class AudioRoom {
  constructor({ role, token, audio, update }) {
    Object.assign(this, { role, token, audio, update });
    this.peers = new Map(); this.stream = null; this.closed = false; this.joined = false;
    this.state = { connected: false, live: false, count: 0, message: 'Valmis liittymään', level: 0, receiving: false };
    this.devices = [];
  }
  set(patch) { Object.assign(this.state, patch); this.update({ ...this.state }); }
  send(data) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data)); }
  async connect() {
    if (this.opening || this.closed || [0, 1].includes(this.ws?.readyState)) return;
    this.set({ message: 'Yhdistetään…' });
    this.opening = true;
    try {
      const response = await fetch('/api/rtc', { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        this.set({ message: response.status === 401 ? 'Liittymislinkki on vanhentunut. Pyydä uusi QR-koodi.' : failure.error || 'TURN-yhteystietoja ei saatu. Tarkista lähettäjän asetukset.' });
        return;
      }
      this.rtc = await response.json();
      this.set({ turnEnabled: this.rtc.iceServers.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(url => /^turns?:/.test(url))) });
    } catch { this.set({ message: 'Yhteysasetusten haku epäonnistui. Tarkista internetyhteys ja yritä uudelleen.' }); return; }
    finally { this.opening = false; }
    if (this.closed) return;
    const ws = this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal`);
    ws.onopen = () => this.send({ type: 'auth', role: this.role, token: this.token });
    ws.onmessage = async event => {
      if (this.ws !== ws) return;
      try {
        const m = JSON.parse(event.data);
        if (m.type === 'ready') {
          this.set({ connected: true, message: this.role === 'host' ? 'Valitse BlackHole ja aloita lähetys' : 'Odotetaan lähetystä…' });
          if (this.stream) this.send({ type: 'live', live: true });
        }
        if (m.type === 'status') {
          this.set({ live: m.live, count: m.count });
          if (!m.live) { this.clearPeers(); this.set({ receiving: false, message: this.role === 'host' ? 'Lähetys ei ole käynnissä' : 'Odotetaan lähettäjää…' }); }
        }
        if (m.type === 'peer' && this.stream) await this.offer(m.id);
        if (m.type === 'leave') this.removePeer(m.id);
        if (m.type === 'signal') await this.signal(m.id || 'host', m.data);
      } catch (e) { this.set({ message: `Yhteysvirhe: ${e.message}. Kokeile liittyä uudelleen.` }); }
    };
    ws.onclose = event => {
      if (this.ws !== ws || this.closed) return;
      this.clearPeers(); this.set({ connected: false, live: false, receiving: false });
      const fatal = { 4003: 'Liittymislinkki on vanhentunut. Pyydä uusi QR-koodi.', 4009: 'Lähettäjä on jo auki toisessa välilehdessä.', 4010: 'Huone on täynnä. Yritä myöhemmin.' }[event.code];
      this.set({ message: fatal || 'Yhteys katkesi. Yritetään uudelleen…' });
      if (!fatal) this.reconnect = setTimeout(() => this.connect(), 2000);
    };
    ws.onerror = () => this.set({ message: 'Palvelimeen ei saada yhteyttä. Tarkista Wi-Fi ja varmenne.' });
  }
  async discover() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Avaa lähettäjä localhost-osoitteessa tai luotetulla HTTPS-yhteydellä.');
    // Browsers require a permission grant before revealing device labels.
    const permission = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    permission.getTracks().forEach(t => t.stop());
    this.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && /blackhole/i.test(d.label));
    return this.devices;
  }
  async start(deviceId, testTone = false) {
    if (!this.state.connected) throw new Error('Odota palvelinyhteyden muodostumista.');
    await this.stop();
    try {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      await this.context.resume();
      if (testTone) {
        const dest = this.context.createMediaStreamDestination();
        this.oscillator = this.context.createOscillator(); this.oscillator.frequency.value = 440;
        const gain = this.context.createGain(); gain.gain.value = 0.035;
        this.oscillator.connect(gain).connect(dest); this.oscillator.start(); this.stream = dest.stream;
      } else {
        if (!this.devices.some(d => d.deviceId === deviceId)) throw new Error('Valitse BlackHole 2ch. Mikrofonia ei lähetetä.');
        this.stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
          deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false,
          autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 }, latency: { ideal: 0.01 }
        } });
      }
      const track = this.stream.getAudioTracks()[0];
      track.contentHint = 'music'; track.onended = () => { this.stop(); this.set({ message: 'Äänilaite irtosi. Tarkista BlackHole ja käynnistä lähetys uudelleen.' }); };
      const analyser = this.context.createAnalyser(); analyser.fftSize = 512;
      this.context.createMediaStreamSource(this.stream).connect(analyser); // Deliberately no local playback/echo.
      const data = new Float32Array(analyser.fftSize);
      this.meter = setInterval(() => { analyser.getFloatTimeDomainData(data); const rms = Math.sqrt(data.reduce((a, n) => a + n * n, 0) / data.length); this.set({ level: Math.min(100, rms * 500) }); }, 120);
      this.send({ type: 'live', live: true });
      this.set({ message: testTone ? 'Testiääni lähetetään • 440 Hz' : 'BlackHole → kuulijat', capturing: true });
    } catch (e) { await this.stop(); throw e; }
  }
  peer(id, generation) {
    this.removePeer(id);
    const pc = new RTCPeerConnection({ ...this.rtc, bundlePolicy: 'max-bundle' });
    const entry = { pc, generation, pending: [], outgoing: [], sentDescription: false }; this.peers.set(id, entry);
    pc.onicecandidate = ({ candidate }) => { if (candidate) { const message = { type: 'signal', id, data: { candidate, generation } }; if (entry.sentDescription) this.send(message); else entry.outgoing.push(message); } };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== entry) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(entry.timeout); clearTimeout(entry.retry);
        if (this.role === 'listener') this.set({ receiving: true, message: 'Kuuntelet suoraa lähetystä' });
      }
      if (['failed', 'disconnected'].includes(pc.connectionState) && this.role === 'listener') {
        this.set({ receiving: false, message: 'Ääniyhteys katkesi. Yhdistetään uudelleen…' });
        clearTimeout(entry.retry); entry.retry = setTimeout(() => this.send({ type: 'retry' }), 2500);
      }
    };
    entry.timeout = setTimeout(() => {
      if (pc.connectionState !== 'connected' && this.role === 'listener') {
        this.set({ message: this.state.turnEnabled ? 'TURN-ääniyhteys ei muodostu. Tarkista internetyhteys ja Meteredin käyttökiintiö.' : 'Ääniyhteys ei muodostu. Tarkista verkon laite-eristys, VPN ja palomuuri.' });
        this.send({ type: 'retry' });
      }
    }, 15000);
    pc.ontrack = ({ streams, track }) => {
      this.audio.srcObject = streams[0] || new MediaStream([track]);
      const receiver = pc.getReceivers().find(r => r.track === track);
      if (receiver && 'jitterBufferTarget' in receiver) { try { receiver.jitterBufferTarget = 40; } catch {} }
      this.play();
    };
    return entry;
  }
  async offer(id) {
    const entry = this.peer(id, crypto.randomUUID()); const { pc, generation } = entry;
    for (const track of this.stream.getTracks()) pc.addTransceiver(track, { direction: 'sendonly', streams: [this.stream] });
    for (const sender of pc.getSenders()) {
      const p = sender.getParameters(); if (p.encodings?.length) { p.encodings[0].maxBitrate = 128000; await sender.setParameters(p); }
    }
    await pc.setLocalDescription(await pc.createOffer());
    if (this.peers.get(id) === entry) { this.send({ type: 'signal', id, data: { description: pc.localDescription, generation } }); this.flush(entry); }
  }
  async signal(id, data) {
    // Generation IDs discard delayed candidates from an earlier connection.
    let entry = this.peers.get(id);
    if (data.description?.type === 'offer') entry = this.peer(id, data.generation);
    if (!entry || entry.generation !== data.generation) return;
    const { pc } = entry;
    if (data.description) {
      await pc.setRemoteDescription(data.description);
      for (const c of entry.pending.splice(0)) await pc.addIceCandidate(c);
      if (data.description.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        this.send({ type: 'signal', id, data: { description: pc.localDescription, generation: entry.generation } });
        this.flush(entry);
      }
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate); else entry.pending.push(data.candidate);
    }
  }
  flush(entry) { entry.sentDescription = true; for (const message of entry.outgoing.splice(0)) this.send(message); }
  async play() {
    try { await this.audio.play(); this.set({ needsPlay: false }); }
    catch { this.set({ needsPlay: true, message: 'Ääni on valmis. Paina Toista ääni.' }); }
  }
  listen() { this.joined = true; this.connect(); if (this.audio.srcObject) this.play(); else if (this.state.connected) this.send({ type: 'retry' }); }
  removePeer(id) { const e = this.peers.get(id); if (e) { clearTimeout(e.timeout); clearTimeout(e.retry); e.pc.close(); this.peers.delete(id); } }
  clearPeers() { this.set({ needsPlay: false, receiving: false }); for (const id of this.peers.keys()) this.removePeer(id); if (this.audio) { this.audio.pause(); this.audio.srcObject = null; } }
  async stop() {
    this.send({ type: 'live', live: false }); this.clearPeers(); clearInterval(this.meter);
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = null;
    this.oscillator?.stop(); this.oscillator = null;
    await this.context?.close().catch(() => {}); this.context = null;
    this.set({ capturing: false, level: 0 });
  }
  async destroy() { this.closed = true; clearTimeout(this.reconnect); await this.stop(); this.ws?.close(); }
}
