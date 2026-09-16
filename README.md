# Office Audio

Toimiston livestreamin ääni isolle näytölle **ja** useisiin omiin kuulokkeisiin. Node.js + React + WebRTC, suomalainen käyttöliittymä, QR-liittyminen. Ei käyttäjätilejä. Valinnainen Cloudflare-tunneli helpottaa HTTPS-käyttöä puhelimissa; ääni kulkee joko suoraan lähiverkossa tai valinnaisen TURN-palvelun kautta.

```text
Livestream Macissa → macOS Multi-Output Device
                    ├─ HDMI / USB-C → iso näyttö + näytön kaiuttimet
                    └─ BlackHole 2ch → lähettäjän Chrome/Edge
                                      ├─ WebRTC → iPhone/Safari → AirPods
                                      ├─ WebRTC → Android/Chrome → BT-kuulokkeet
                                      └─ WebRTC → toinen Mac → kuulokkeet
```

## Nopein käyttöliittymä- ja äänikokeilu (ei vielä puhelimeen)

Tarvitset Node.js 22.12+ (tai uudemman tuetun LTS:n) ja Chromen/Edgen.

```sh
cd office-audio
npm ci
npm run build
npm run demo
```

Avaa päätteessä tulostuva **koko lähettäjälinkki**. Paina **Kokeile yhteyttä testiäänellä**, avaa **Avaa kuuntelusivu**, paina **Kuuntele**. Kuuluu hiljainen 440 Hz:n testiääni. Se syntyy vain verkkokuuntelijoille; se ei testaa HDMI:tä tai BlackHolea. `npm run demo` kuuntelee vain osoitetta 127.0.0.1. Tätä localhost-linkkiä ei voi käyttää puhelimesta.

## TURN käyttöön: eri hotspotit ja mobiilidata

1. Avaa projektin `.env`. Jos sitä ei vielä ole, kopioi `.env.example` nimelle `.env`.
2. Täytä Meteredin **TURN-tunnuksen API Key** (TURN Server -sivulta, ei Developers-sivun Secret Key) riville `METERED_API_KEY=`. Älä käytä Realtime Messaging -avainta.

```dotenv
METERED_DOMAIN=office-audio.metered.live
METERED_API_KEY=LIITA_OMA_AVAIN_TAHAN
TURN_RELAY_ONLY=true
```

3. Tallenna tiedosto. Lopeta vanha palvelin Ctrl+C:llä ja suorita `npm run build` sekä `npm run tunnel`.
4. Avaa uusi lähettäjälinkki ja jaa uusi QR. Kun TURN-asetukset on haettu, käyttöliittymä näyttää **INTERNETIN KAUTTA** ja alareunassa **TURN-välitys käytössä**. Näin eri verkkojen kuuntelijoille on välitysreitti tarjolla.

**Avaimet ovat eri asioita:** Developers-sivun Secret Key on hallinta-avain, eikä se kelpaa `/turn/credentials?apiKey=...`-hakuun. TURN Server -sivulla olevan TURN-tunnuksen API Key on oikea avain. Tunnusten automaattinen luominen Secret Keyllä voi vaatia maksullisen paketin; nykyinen ilmaistili hylkäsi sen. Älä vaihda tilausta tämän vuoksi, vaan tarkista ilmaistilin valmiit TURN-tiedot hallintapaneelista.

`.env` luetaan automaattisesti projektikansiosta. Avain pysyy Node-palvelimella; liittymistunnuksella suojattu `/api/rtc` antaa selaimille vain TURN-yhteystiedot. Tietoja välimuistitetaan palvelimella minuutti. Virheellistä avainta tai palveluntarjoajan virhevastausta ei tulosteta lokiin.

`TURN_RELAY_ONLY=true` pakottaa ääniyhteyden TURN-palvelimen kautta. Asetus `false` sallii myös suoran reitin. Jos API-avain on tyhjä, käytössä on vanha lähiverkkotila; jos täytetty avain ei toimi, sovellus ilmoittaa virheen eikä vaihda hiljaisesti suoraan yhteyteen. Avaimen muutoksen jälkeen käynnistä palvelin uudelleen.

Älä jaa `.env`-tiedostoa. Se ei kuulu ZIP-pakettiin tai versionhallintaan. Ääni säilyy WebRTC-salattuna välityksessä, mutta palvelu näkee yhteystiedot ja liikennemäärän. TURN-liikenne kuluttaa Meteredin kiintiötä kuuntelijakohtaisesti.

TURN-asetusten käsittely ja tunnistautuminen on testattu simuloidulla palveluntarjoajalla. Varsinainen Metered-äänenvälitys pitää vielä varmistaa oikealla avaimella ja eri verkkojen laitteilla. Alareunan TURN-teksti ilmaisee asetusten käytön; se ei yksin todista, että ääni saapuu.

## Helppo HTTPS-linkki puhelimille: cloudflared

Tämä vaihtoehto poistaa omien HTTPS-varmenteiden asentamisen kuuntelijoiden laitteisiin. Tarvitset internetyhteyden tunnelin käyttöön; ilman TURN-asetuksia kuuntelijoiden ja lähettäjän pitää olla samassa, laitteiden välisen liikenteen sallivassa lähiverkossa. TURNin kanssa eri internetyhteydet ovat mahdollisia.

```sh
brew install cloudflared
# Jos BlackHole ei ole vielä asennettu:
brew install --cask blackhole-2ch
npm ci
npm run build
npm run tunnel
```

1. Tee alla olevan **Lähetä ääni sekä HDMI:hin että BlackHoleen** -kohdan Multi-Output-asetukset.
2. `npm run tunnel` käynnistää paikallisen palvelimen ja Cloudflare Quick Tunnelin. `npm run certs` tai mkcert eivät ole tässä tilassa tarpeen. Cloudflare-tiliä tai omaa domainia ei tarvita.
3. Odota päätteeseen kahta linkkiä: **julkinen kuuntelulinkki** `https://….trycloudflare.com/#join=…` sekä **lähettäjän linkki** `http://localhost:8443/host#host=…`.
4. Avaa lähettäjän localhost-linkki Chromessa/Edgessä samassa Macissa. Localhost sallii äänenkaappauksen myös HTTP:llä. Valitse BlackHole ja aloita lähetys, tai kokeile ensin testiääntä.
5. Lähettäjän QR-koodi ja kopioitava linkki osoittavat nyt automaattisesti Cloudflaren HTTPS-osoitteeseen. Kuuntelija avaa sen tavallisessa selaimessa, painaa Kuuntele ja kuulee äänen omista kuulokkeistaan. Omia varmenteita ei tarvitse asentaa.
6. **Ctrl+C** sulkee sekä appin että cloudflared-prosessin. Uusi käynnistys luo uuden osoitteen ja uudet liittymistunnukset. Älä sulje päätettä kuuntelun aikana.

**Mitä tunnelissa kulkee?** Sivusto ja WebSocket-signalointi kulkevat Cloudflaren kautta. Varsinainen ääni kulkee erikseen WebRTC:llä: joko suoraan laitteiden välillä tai TURNin kautta. Cloudflare-tunneli ei yksin välitä ääntä eri verkkojen välillä.

Paikallinen HTTP-palvelin kuuntelee tunnelitilassa vain `127.0.0.1`:tä. Sovellus sallii vain käynnistyksessä saadun tarkan tunnelidomainin; kaikkia `trycloudflare.com`-osoitteita ei hyväksytä. Cloudflare päättää julkisen TLS-yhteyden, joten HTML ja signalointi, mukaan lukien kuuntelutunnukset ja WebRTC-yhteystiedot, kulkevat sen infrastruktuurin kautta. Äänen WebRTC-salaus säilyy laitteiden välisenä. Jaa kuuntelulinkki vain tarkoitetuille kuulijoille; lähettäjätunnusta ei ole QR:ssa.

Quick Tunnel on tilapäiseen kokeiluun: osoite vaihtuu, palvelulla ei ole saatavuustakuuta ja sillä on 200 samanaikaisen pyynnön raja. Sovelluksen oma 20 kuuntelijan raja säilyy. Jos cloudflared-prosessi päättyy, appi sulkeutuu ja kertoo uudelleenkäynnistysohjeen. Tilapäisissä verkkokatkoissa cloudflared ja selainten yhteydet yrittävät palautua.

Jos tunnelin käynnistys epäonnistuu, tarkista internetyhteys ja `cloudflared --version`. Cloudflaren mukaan Quick Tunnel ei toimi, jos `~/.cloudflared/config.yaml` on käytössä: käytä puhdasta asetuskokoonpanoa tai nimeä tiedosto itse väliaikaisesti uudelleen. Appi ei muuta olemassa olevia Cloudflare-asetuksiasi. Vaihtoehtoinen portti: `PORT=8444 npm run tunnel`.

Lähde: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Vaihtoehto ilman tunnelia: pelkkä toimistoverkko


### 1. Asenna BlackHole ja varmenneapu

Macissa, jossa on [Homebrew](https://brew.sh):

```sh
brew install --cask blackhole-2ch
brew install mkcert
```

BlackHolen voi asentaa myös [valmistajan asentimella](https://existential.audio/blackhole/). Käynnistä Mac tarvittaessa uudelleen, jos BlackHole ei ilmesty äänilaitteisiin. Sovellus ei itse asenna ajuria tai muuta Macin ääniasetuksia.

### 2. Lähetä ääni sekä HDMI:hin että BlackHoleen

1. Kytke näyttö HDMI:llä tai USB-C:llä. Tarkista ensin, että livestreamin ääni kuuluu näytöstä tavallisella HDMI-ulostulolla.
2. Avaa **Audio MIDI Setup / Ääni- ja MIDI-asetukset** Spotlightilla. Näytä Audio Devices / Äänilaitteet -ikkuna.
3. Paina vasemman alakulman **+ → Create Multi-Output Device / Luo monilähtölaite**.
4. Valitse **näytön HDMI/DisplayPort-äänilaite** ja **BlackHole 2ch**. Nimeä yhdistelmä esimerkiksi **Office Audio + TV**.
5. Käytä samaa näytetaajuutta molemmissa, mieluiten **48 000 Hz**, jos laitteet tukevat sitä. Valitse fyysinen **kaksikanavainen** ulostulo ensisijaiseksi kelloksi ja ota **Drift Correction** käyttöön muille laitteille (ei kellolaitteelle). Jos HDMI-laite on monikanavainen, lisää Macin sisäinen ulostulo kellolaitteeksi ja vaimenna sen kaiuttimet erikseen.
6. Valitse macOS:n **Järjestelmäasetukset → Ääni → Ulostulo → Office Audio + TV**. Jos mediasovellus valitsee ulostulon itse, valitse sama laite siinä.
7. Jätä Macin tavallinen **sisääntulo** ennalleen; appissa valitaan erikseen BlackHole.

Nyt ääni kuuluu edelleen näytöstä. BlackHole on saman äänen toinen haara. Lähetyksen lopetus sovelluksesta ei muuta HDMI-toistoa. Kun lopetat koko järjestelyn, voit vaihtaa macOS:n ulostuloksi taas tavallisen HDMI-laitteen.

Multi-Output-laitteen yhteinen äänenvoimakkuussäädin ei yleensä toimi: käytä TV:n tai toistosovelluksen omaa voimakkuutta. Jos yhdistelmä ei toista ääntä, tarkista valmistajan [Multi-Output-ohje](https://github.com/ExistentialAudio/BlackHole/wiki/Multi-Output-Device); joissakin kokoonpanoissa sisäisen ulostulon lisääminen ensisijaiseksi on tarpeen. Mykistä tällöin sisäiset kaiuttimet erikseen.

### 3. Luo HTTPS-varmenne toimiston verkossa

Yhdistä lähettävä Mac siihen verkkoon, jota kuuntelijat käyttävät. Suorita projektikansiossa:

```sh
npm ci
npm run certs
npm run build
npm start
```

`npm run certs` käyttää mkcertiä, asentaa paikallisen juurivarmenteen Macin luottamusvarastoon ja luo varmenteen localhostille sekä Macin nykyisille IPv4-osoitteille. macOS voi kysyä ylläpitäjän salasanaa. `certs/` sisältää palvelimen yksityisen avaimen ja on jätetty versionhallinnan ulkopuolelle.

**Miksi HTTPS?** HTTPS tekee vastaanottimesta luotetun selainympäristön myös mobiilissa ja salaa ohjausliikenteen. Pelkkään varmennevaroituksen ohittamiseen ei tässä luoteta. Omalla lähiverkon IP-osoitteella tämä vaatii kertaluonteisen luottamuksen kuuntelulaitteissa.

### 4. Ensimmäinen kerta: kuuntelulaitteen varmenne

Selvitä varmenteen sijainti lähettävässä Macissa:

```sh
mkcert -CAROOT
```

Tässä kansiossa oleva **rootCA.pem** on kuuntelulaitteelle asennettava julkinen juurivarmenne. Voit tehdä siitä helposti tunnistettavan kopion:

```sh
cp "$(mkcert -CAROOT)/rootCA.pem" certs/office-audio-root.crt
```

Siirrä **vain `office-audio-root.crt`** kuuntelijan laitteeseen esimerkiksi AirDropilla. **Älä jaa `rootCA-key.pem`- tai `key.pem`-tiedostoja.** Juurivarmenne antaa luottamuksen sen omistajan allekirjoittamille varmenteille: käytä tätä luotetussa toimistopilotissa ja poista luottamus kokeilun jälkeen.

- **iPhone/iPad:** hyväksy varmenneprofiili, avaa Asetukset → Yleiset → VPN ja laitehallinta (tai Profiili ladattu) → asenna profiili. Sitten **Yleiset → Tietoja → Varmenteiden luottamusasetukset → ota täysi luottamus käyttöön** mkcert-varmenteelle. Avaa kuuntelulinkki Safarissa.
- **Toinen Mac:** tuo varmenne Avainnipun käyttöön, avaa varmenteen Luottamus-kohta ja salli luottamus. Käynnistä selain uudelleen tarvittaessa.
- **Android:** asenna `.crt` laitteen suojausasetusten kohdasta **Asenna varmenne → CA-varmenne** (nimet vaihtelevat). Avaa linkki Chromessa. Yrityksen laitehallinta voi estää omien varmenteiden asentamisen.

Jos laitehallinta kieltää tämän, IT:n pitää jakaa luotettu varmenne tai järjestää luotettu HTTPS-nimi lähettävälle Macille. Vaihtoehtoisesti käytä yllä kuvattua Cloudflare-tunnelia, jolloin omia varmenteita ei tarvita. MVP ei sisällä julkisen DNS:n asetuksia tai automaattista yritysvarmenteiden jakoa. Sovellus ei jaa juurivarmennetta HTTP-palvelimelta.

### 5. Aloita lähetys ja liitä kuulijat

1. Avaa päätteessä tulostuva `https://localhost:8443/host#host=…` **Chromessa tai Edgessä lähettävällä Macilla**. Käytä yhtä lähettäjäikkunaa.
2. Paina **Etsi** ja salli selaimen mikrofonilupa. Tätä tarvitaan äänisisääntulojen nimien lukemiseen; alun lupapyyntö voi avata oletusmikrofonin hetkeksi paikallisesti, mutta sitä ei lähetetä. Varsinaiseen lähetykseen kelpuutetaan vain listasta valittu BlackHole.
3. Valitse **BlackHole 2ch**, käynnistä livestream ja paina **Aloita lähetys**. Tasonäytön pitäisi liikkua äänen mukana.
4. Valitse **Verkko-osoite**-listasta toimiston Wi-Fi-/Ethernet-IP. Jos listassa on myös VPN-osoitteita, älä käytä niitä. Macin IP näkyy Järjestelmäasetukset → Verkko → aktiivisen yhteyden tiedot.
5. Kuuntelija yhdistää Bluetooth-kuulokkeet **omaan** laitteeseensa, liittyy samaan lähiverkkoon ja skannaa QR:n tai avaa kopioidun linkin.
6. Paina **Kuuntele**. Jos selain estää automaattisen aloituksen, paina ilmestyvää **Toista ääni** -painiketta. Kuuntelija ei tarvitse mikrofonilupaa tai erillistä appia. Säädä voimakkuus puhelimen painikkeilla.

Pidä palvelin ja lähettäjän välilehti käynnissä. Estä Macin nukahtaminen tarvittaessa:

```sh
caffeinate -i npm start
```

Tämä korvaa tavallisen `npm start` -komennon; älä aja molempia samassa portissa. Lopeta päätteestä Ctrl+C. Lähettäjän reload tai äänilaitteen irtoaminen edellyttää lähetyksen aloittamista uudelleen. Katkennut signalointiyhteys yritetään palauttaa automaattisesti; palvelimen uudelleenkäynnistys luo uudet liittymislinkit.

## Viive ja kapasiteetti

- Ääni kulkee selaimesta suoraan tai TURN-välityksellä jokaisen kuuntelijan selaimeen WebRTC-audiona (selaimen neuvottelema koodekki, tavallisesti Opus). Node välittää vain yhteyden muodostamiseen tarvittavat viestit.
- Ei HLS-puskurointia. Kaiunpoisto, kohinanvaimennus ja automaattinen tasonsäätö ovat pois päältä. Lähetyksen bittinopeustavoite on enintään 128 kbit/s/kuuntelija. Vastaanottimen pientä jitter-puskuria pyydetään, jos selain tukee asetusta.
- Käytännön kokonaisviive riippuu kaappauksesta, verkosta, selaimesta ja Bluetooth-kuulokkeista. Tavoite on satojen millisekuntien luokka, **ei mitattu lupaus**. Bluetooth lisää viivettä ja eri kuuntelijoilla voi olla eri viive.
- TV:n kuvaa tai HDMI-ääntä ei viivästetä eikä kaikkia vastaanottimia synkronoida. Jos TV:n kaiuttimet kuuluvat kuulokkeiden läpi, voi kuulua kaiku. Käytä vaimentavia kuulokkeita tai pienennä TV:n ääntä.
- Aloita 2–3 kuuntelijasta ja kokeile sitten 5–15. Kova raja on 20 liittynyttä kuuntelijaa; sitä ei ole kuormitustestattu. Mac ylläpitää erillisen vertaisyhteyden jokaiseen: 15 × 128 kbit/s on noin 1,9 Mbit/s plus verkkoprotokollien lisäliikenne.
- Mobiiliselaimen tausta-/lukitusruututoistoa ei luvata. Pidä sivu etualalla toimistokokeilussa. Puhelut ja Bluetooth-laitteen vaihto voivat katkaista äänen; avaa sivu ja liity uudelleen.

## Ongelmatilanteet

| Oire | Tarkista |
|---|---|
| QR-linkki ei aukea | Molemmat samassa verkossa, oikea LAN-IP, Node sallittu macOS-palomuurissa. `localhost` toimii vain lähettävällä Macilla. |
| Varmennevirhe | Asenna juurivarmenne ja ota täysi luottamus käyttöön. Jos Macin IP vaihtui, aja `npm run certs` uudelleen ja käynnistä palvelin uudelleen. Saman mkcert-CA:n juurta ei tarvitse asentaa uudelleen. |
| Sivu aukeaa mutta ääniyhteys ei | Wi-Fi client/AP isolation, vierasverkko, VPN tai UDP:n estävä palomuuri. Salli laitteiden keskinäinen liikenne. TCP-portti 8443 yksin ei riitä: WebRTC käyttää myös selaimen valitsemia UDP-portteja. Ilman Metered-avainta ei ole välityspalvelinta. Eri verkoissa ota TURN käyttöön; TURN-tilassa tarkista palvelun avain, kiintiö ja internetyhteys. |
| BlackHole ei näy | Asenna ajuri, salli lähettäjän selaimelle mikrofonilupa sekä macOS:n Tietosuoja ja suojaus → Mikrofoni. Käynnistä selain/Mac uudelleen ja paina Etsi. |
| Tasonäyttö ei liiku | Multi-Output oikeaksi ulostuloksi, BlackHole valittuna yhdistelmässä ja appissa, livestream ei mykistetty. Tarkista testisignaalilla erikseen verkkoyhteys. |
| HDMI hiljeni | Näytön äänilaite on valittuna Multi-Outputissa, kellot/näytetaajuudet sopivat ja TV ei ole mykistetty. |
| Yhteys muodostui mutta ei kuulu | Paina Toista ääni, tarkista kuulokkeiden paritus ja laitteen voimakkuus. Lopeta kuuntelu ja liity uudelleen. |
| Huone täynnä | Lopeta tarpeettomat kuuntelut; enintään 20 selainyhteyttä. Suljetut yhteydet poistuvat automaattisesti, viimeistään heartbeat-tarkistuksessa. |
| Portti varattu | `PORT=8444 npm start`. Käytä uutta päätteessä näkyvää linkkiä. |
| VPN/verkko muuttui | Käynnistä palvelin uudelleen; IP:t ja sallittujen osoitteiden lista luetaan käynnistyksessä. Uusi varmenne tarvittaessa. |

## Toteutus ja rajaukset

- `server/index.js`: HTTPS-käynnistys, LAN-osoitteet, paikallinen demotila ja tunnelitila.
- `server/tunnel.js`: cloudflared-prosessi, Quick Tunnel -osoite ja prosessin sulkeminen.
- `server/app.js`: staattinen React-sovellus, QR-API, WebSocket-signalointi, roolit, yhteysraja ja heartbeat.
- `src/audio.js`: BlackHole-kaappaus, WebRTC-yhteydet, ICE-jonotus ja yhteyssukupolvet, uudelleenliittyminen, testiääni, tulotaso.
- `src/main.jsx`, `src/style.css`: responsiiviset lähettäjä- ja kuuntelijanäkymät.
- `scripts/certs.js`: mkcert-varmenteet nykyisille osoitteille.
- `test/`: signalointitestit ja oikean äänen vastaanoton selainkoe.

Linkeissä on satunnaiset erilliset lähettäjä- ja kuuntelijatunnukset. Tunnus on URL:n fragmentissa; sitä ei lähetetä HTTP-polun tai kyselyn mukana. Selain lähettää sen TLS-suojatulla yhteydellä kirjautumisviestissä (localhost-demossa paikallisella HTTP:llä). Palvelin tarkistaa Originin, rajoittaa viestikokoa ja lähetysnopeutta sekä eristää roolit. QR:n saava henkilö voi kuunnella: tämä ei ole yrityksen tunnistautumisjärjestelmä. Ääntä ei tallenneta ja WebRTC salaa mediayhteydet. Älä avaa palvelimen porttia suoraan internetiin. Valinnainen Quick Tunnel julkaisee sovelluksen HTTPS:n takana; kuuntelu edellyttää edelleen satunnaista liittymistunnusta.

Multi-Output jakaa **kaiken kyseiseen ulostuloon toistetun äänen**, myös ilmoitusäänet. Käytä Macissa Älä häiritse -tilaa livestreamin aikana. Sovellus ei lue streamipalvelun tunnuksia eikä kierrä DRM-suojauksia; palvelukohtainen suojattu sisältö voi rajoittaa kaappausta.

### Miksi BlackHole eikä suora system audio selaimesta?

Tavallisen selaimen `getDisplayMedia` ei ole macOS:n system-audio-ratkaisu, johon tämä sovellus voisi luottaa. Tässä `getUserMedia` lukee **virtuaalista äänisisääntuloa**: macOS/BlackHole tekee varsinaisen reitityksen.

Natiivi vaihtoehto olisi Electronin/CoreAudio Tapin tai ScreenCaptureKitin ympärille paketoitu lähettäjä. Se voisi säilyttää HDMI-ulostulon ja vähentää käyttäjän reititysasetuksia, mutta lisää macOS-versio-, Info.plist-, lupa- ja jakeluriippuvuuksia. Electronin dokumentaatio huomauttaa nykyisen CoreAudio Tap -polun lupavaatimuksista ja jopa hiljaisen audiovirran mahdollisuudesta puuttuvalla avaimella. MVP käyttää siksi selkeää BlackHole-reittiä ilman natiivia apuohjelmaa. Tämä ei estä natiivin kaappauksen lisäämistä myöhemmin.

## Kehitys ja testaus

Cloudflare-tuen varmennus: oikea Quick Tunnel, julkisesti luotettu HTTPS (ei TLS-tarkistuksen ohitusta), WSS-signalointi sekä kaksi samanaikaista Chrome-kuuntelijaa dekoodasivat testiääntä. Fyysinen iPhone/Bluetooth-koe on edelleen tehtävä toimistossa.

Tunnelin selainkokeen voi uusia käynnissä olevaa `npm run tunnel` -palvelinta vasten. Anna sen tulostamat kokonaiset linkit ympäristömuuttujina:

```sh
BROWSER_CHANNEL=chrome HOST_URL='http://localhost:8443/host#host=OMA_TUNNUS' LISTENER_URL='https://OMA.trycloudflare.com/#join=OMA_TUNNUS' node --test test/tunnel.e2e.js
```


```sh
npm run check
# Oikeat HTTPS/WebRTC-selainyhteydet, jos Macissa on Google Chrome:
BROWSER_CHANNEL=chrome npm run test:e2e
# Vaihtoehtoisesti Playwright Chromium:
npx playwright install chromium
npm run test:e2e
```

Selainkoe luo vain testin ajaksi itse allekirjoitetun varmenteen ja ohittaa sen tarkistuksen **vain testiselaimessa**. Se ei muuta käyttöjärjestelmän luottamusasetuksia. OpenSSL tarvitaan testivarmenteeseen.

Toteutuksen varmennus: tuotantobuild, signalointitestit, käyttöliittymän selainkatselmus sekä kahden samanaikaisen Chrome-kuuntelijan oikean WebRTC-audion dekoodaus (ei pelkkä signalointimock). Selainkoe tarkistaa myös lähetyksen lopetuksen/uudelleenkäynnistyksen, kuuntelijan poistumisen/uudelleenliittymisen, lähettäjän reloadin ja mobiilileveyden. **Fyysistä BlackHole → HDMI + iPhone/Bluetooth -ketjua ei ole tässä ympäristössä testattu.**

Toimiston hyväksymiskoe: varmista ensin HDMI yksin, sitten BlackHole-tasomittari, sitten yksi puhelin luotetulla HTTPS:llä, lopuksi 2–3 kuuloketta yhtä aikaa. Kuuntele puhetta yhteisen kuvan kanssa ja arvioi viive. Tämä on viimeinen laitteistosta ja toimistoverkosta riippuva tarkistus.

## Viralliset lähteet

- [BlackHole: system audio -reititys](https://existential.audio/blackhole/support/)
- [BlackHole: Multi-Output Device](https://github.com/ExistentialAudio/BlackHole/wiki/Multi-Output-Device)
- [Electron: desktopCapturer ja macOS:n lupavaatimukset](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [mkcert: varmenteet ja mobiililaitteet](https://github.com/FiloSottile/mkcert)
- [Apple: käsin asennetun varmenteen luottamus iOS:ssa](https://support.apple.com/en-us/102390)
