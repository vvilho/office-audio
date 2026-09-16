import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioRoom } from './audio';
import './style.css';
const host = location.pathname === '/host';
const secret = new URLSearchParams(location.hash.slice(1)).get(host ? 'host' : 'join');
function App() {
  const audio = useRef(null), engine = useRef(null);
  const [state, setState] = useState({ message: 'Valmis liittymään', count: 0 });
  const [devices, setDevices] = useState([]), [device, setDevice] = useState('');
  const [config, setConfig] = useState(null), [urlIndex, setUrlIndex] = useState(0);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [joined, setJoined] = useState(false);
  useEffect(() => {
    if (!secret) return;
    const room = engine.current = new AudioRoom({ role: host ? 'host' : 'listener', token: secret, audio: audio.current, update: setState });
    if (host) {
      room.connect();
      fetch('/api/host', { headers: { Authorization: `Bearer ${secret}` } }).then(r => { if (!r.ok) throw new Error('Lähettäjän linkki on vanhentunut. Avaa uusi linkki päätteestä.'); return r.json(); }).then(setConfig).catch(e => setError(e.message));
    }
    return () => { room.destroy(); };
  }, []);
  const action = async fn => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const discover = () => action(async () => { const list = await engine.current.discover(); setDevices(list); setDevice(list[0]?.deviceId || ''); if (!list.length) throw new Error('BlackHolea ei löytynyt. Asenna BlackHole 2ch, käynnistä selain tarvittaessa uudelleen ja tarkista laitteet uudelleen.'); });
  const leave = () => { engine.current.clearPeers(); clearTimeout(engine.current.reconnect); engine.current.closed = true; engine.current.ws?.close(); engine.current.set({ connected: false, receiving: false, live: false, needsPlay: false, message: 'Kuuntelu lopetettu' }); setJoined(false); };
  return <main>
    <nav><a className="brand" href={location.href}><span className="brand-icon">◖◗</span> office audio</a><span className="pill">{state.turnEnabled ? 'INTERNETIN KAUTTA' : 'LÄHIVERKOSSA'}</span></nav>
    <div className="layout"><section className="intro"><div className="eyebrow">YHTEINEN LÄHETYS. OMA RAUHA.</div><h1>{host ? <>Yksi lähetys.<br/><em>Kaikkien korville.</em></> : <>Ole kuulolla.<br/><em>Omassa rauhassa.</em></>}</h1><p>{host ? 'Pidä livestream isolta näytöltä näkyvissä ja kuultavissa. Jaa sama ääni toimiston omiin kuulokkeisiin.' : 'Yhdistä kuulokkeet puhelimeesi tai tietokoneeseesi. Liity yhteiseen lähetykseen yhdellä painalluksella.'}</p><div className="route">{host ? 'Mac → HDMI + BlackHole → Wi-Fi → kuulokkeet' : 'Toimiston Wi-Fi → oma laite → omat kuulokkeet'}</div><div className="notes"><span>01</span> {state.turnEnabled ? 'Oma toimiva internetyhteys' : 'Sama toimiston verkko'}<br/><span>02</span> Omat Bluetooth- tai langalliset kuulokkeet<br/><span>03</span> Kuuntelijan mikrofoni pysyy pois päältä</div></section>
    <section className="card" aria-label={host ? 'Lähettäjä' : 'Kuuntelija'}>
      <div className="card-top"><span>{host ? 'LÄHETTÄJÄ' : 'TOIMISTON LIVE'}</span><span className={`status-dot ${state.live ? 'on' : ''}`}/></div>
      <h2>{host ? 'Jaa ääni' : 'Tervetuloa linjoille'}</h2>
      {!secret ? <p role="alert">{host ? 'Avaa päätteessä näkyvä lähettäjän linkki.' : 'Liity lähettäjän QR-koodilla tai koko kuuntelulinkillä.'}</p> : <>
      <p className="status" role="status">{state.message}</p>
      {host ? <>
        <label htmlFor="device">Äänilähde</label><div className="source-row"><select id="device" value={device} onChange={e => setDevice(e.target.value)} disabled={state.capturing}><option value="">Valitse BlackHole</option>{devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}</select><button className="secondary" disabled={busy || state.capturing} onClick={discover}>Etsi</button></div>
        <p className="hint">Etsi pyytää selaimen mikrofoniluvan laitenimien lukemiseen. Lähetykseen hyväksytään vain BlackHole.</p>
        <div className="meter" role="meter" aria-label="Äänen tulotaso" aria-valuenow={Math.round(state.level || 0)} aria-valuemin="0" aria-valuemax="100"><div style={{ width: `${state.level || 0}%` }}/></div>
        <button className="primary" disabled={busy || !state.connected || (!state.capturing && !device)} onClick={() => action(() => state.capturing ? engine.current.stop() : engine.current.start(device))}>{state.capturing ? '■ Lopeta lähetys' : '↗ Aloita lähetys'}</button>
        <button className="text-button" disabled={busy || !state.connected || state.capturing} onClick={() => action(() => engine.current.start(null, true))}>Kokeile yhteyttä testiäänellä</button>
        <div className="share"><h3>Kutsu kuulijat</h3>{config?.urls.length ? <><label htmlFor="network">Verkko-osoite</label><select id="network" value={urlIndex} onChange={e => setUrlIndex(Number(e.target.value))}>{config.urls.map((u, i) => <option key={u} value={i}>{new URL(u).host}</option>)}</select><div className="qr-row"><img src={config.qr[urlIndex]} alt="Skannaa liittyäksesi kuuntelemaan"/><div><strong>Skannaa ja kuuntele</strong><p className="hint">{config.tunnel ? 'HTTPS valmis. Ei varmenteiden asennusta.' : 'Ensimmäisellä kerralla asenna luotettu varmenne README-ohjeella.'}</p><button className="secondary" onClick={() => action(async () => { await navigator.clipboard.writeText(config.urls[urlIndex]); engine.current.set({ message: 'Kuuntelulinkki kopioitu' }); })}>Kopioi linkki</button></div></div><a className="join-link" href={config.urls[urlIndex]} target="_blank" rel="noreferrer">Avaa kuuntelusivu ↗</a></> : <p className="hint">Verkko-osoitetta ei löytynyt. Yhdistä Wi-Fiin ja käynnistä palvelin uudelleen.</p>}</div>
      </> : <>
        <div className={`sound-symbol ${state.receiving ? 'playing' : ''}`} aria-hidden="true">{[1, 2, 3, 4, 5, 6, 7].map(n => <i key={n} style={{ height: `${18 + (4 - Math.abs(4 - n)) * 12}px`, animationDelay: `${n * 0.11}s` }}/>)}</div>
        <button className="primary" onClick={() => { setError(''); if (state.needsPlay) engine.current.play(); else { engine.current.closed = false; engine.current.listen(); setJoined(true); } }}>{state.needsPlay ? '▶ Toista ääni' : joined ? '↻ Yhdistä / toista uudelleen' : '▶ Kuuntele'}</button>
        {joined && <button className="text-button" onClick={leave}>Lopeta kuuntelu</button>}
        <p className="hint center">Säädä äänenvoimakkuutta laitteen painikkeilla.<br/>Pidä sivu auki kuuntelun ajan.</p>
      </>}
      <div className="footer-line"><span>{state.connected ? '● Yhteys palvelimeen' : '○ Ei yhteyttä'}</span><span>{state.count || 0} kuuntelijaa</span></div>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <audio ref={audio} autoPlay playsInline/>
    </section></div><footer>{state.turnEnabled ? 'TURN-välitys käytössä' : 'Ääni kulkee suoraan lähiverkossa'} · Ei tallennusta · WebRTC</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
