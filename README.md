# Office Audio

Jaa Macilla toistettavan livestreamin ääni useille kuuntelijoille omiin Bluetooth-kuulokkeisiin. Video ja ääni voivat samalla jatkaa normaalisti isolle näytölle HDMI:n tai USB-C:n kautta.

Office Audio on tarkoitettu esimerkiksi toimistoon, jossa yhteistä lähetystä seurataan isolta ruudulta mutta kaikki eivät halua kuunnella huoneen kaiuttimia. Kuuntelija skannaa QR-koodin, avaa sivun selaimessa ja painaa **Kuuntele**. Erillistä kuuntelusovellusta tai kuulokkeiden yhdistämistä lähettävään Maciin ei tarvita.

Cloudflare tarjoaa julkisen HTTPS-osoitteen. TURN-välityksen avulla kuuntelijat voivat käyttää eri Wi-Fi-verkkoja tai omia mobiiliyhteyksiään.

## Miten se toimii?

```text
Livestream Macissa
        │
macOS:n monilähtölaite
        ├── HDMI / USB-C → yhteinen näyttö ja sen kaiuttimet
        │
        └── BlackHole 2ch → lähettäjän selain
                                   │
                              WebRTC-ääni
                                   │
                              TURN-palvelin
                                   │
                        kuuntelijan selain
                                   │
                        omat Bluetooth-kuulokkeet
```

- **BlackHole** on virtuaalinen äänilaite. macOS:n monilähtölaite kopioi saman äänen sekä näyttöön että BlackHoleen.
- **Lähettäjän Chrome tai Edge** lukee BlackHolea äänisisääntulona ja lähettää äänen WebRTC:llä.
- **Node.js-palvelin** tarjoaa käyttöliittymän, QR-koodin ja yhteyksien muodostamiseen tarvittavan signaloinnin.
- **Cloudflare Tunnel** julkaisee sivuston ja signaloinnin HTTPS-osoitteessa ilman reitittimen porttiohjauksia tai itse asennettavia varmenteita.
- **TURN** välittää WebRTC-äänen silloin, kun laitteiden suora yhteys ei onnistu. Tämän ohjeen asetuksilla ääni kulkee aina TURNin kautta.

Cloudflare-tunneli ei itsessään välitä WebRTC-ääntä. Eri verkkojen kuunteluun tarvitaan myös toimivat TURN-asetukset.

## Vaatimukset

Lähettävälle Macille:

- Node.js **22.12+** tai uudempi tuettu LTS-versio
- [Homebrew](https://brew.sh/)
- Google Chrome tai Microsoft Edge
- [BlackHole 2ch](https://existential.audio/blackhole/)
- `cloudflared`
- Internetyhteys ja HDMI-/USB-C-näyttö
- Meteredin TURN-tunnus eri verkoista kuuntelua varten

Kuuntelijalle riittävät internetyhteys, selain ja omaan laitteeseen yhdistetyt kuulokkeet. Kuuntelua voi käyttää esimerkiksi iPhonen Safarilla, Androidin Chromella tai Macin selaimella.

## Asennus

### 1. Asenna työkalut

Tarkista Homebrew ja Node:

```sh
brew --version
node -v
```

Jos Homebrew puuttuu, asenna se [virallisen ohjeen](https://brew.sh/) mukaan. Jos Node puuttuu tai on liian vanha, asenna Node 24:

```sh
brew install node@24
echo 'export PATH="$(brew --prefix node@24)/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

Asenna tunneli ja BlackHole:

```sh
brew install cloudflared
brew install --cask blackhole-2ch
```

Käynnistä Mac uudelleen, jos BlackHole ei asennuksen jälkeen näy Ääni- ja MIDI-asetuksissa.

### 2. Lataa ja rakenna sovellus

```sh
cd ~/Documents
git clone https://github.com/vvilho/office-audio.git
cd office-audio
npm ci
npm run build
cp .env.example .env
```

Jos käytössä on jo oma `.env`, säilytä se äläkä korvaa sitä esimerkkitiedostolla.

### 3. Määritä TURN

Lisää `.env`-tiedostoon Meteredin **TURN Server -sivulla olevan TURN-tunnuksen API Key**:

```dotenv
METERED_DOMAIN=oma-sovellus.metered.live
METERED_API_KEY=oma_turn_api_key
TURN_RELAY_ONLY=true
```

Korvaa domain ja avain oman tilisi arvoilla. `METERED_API_KEY` ei tarkoita Developers-sivun Secret Key -hallinta-avainta.

`TURN_RELAY_ONLY=true` pakottaa äänen TURN-välitykseen. Tämä soveltuu tilanteeseen, jossa ihmiset käyttävät omia hotspottejaan tai verkko estää laitteiden väliset yhteydet. TURN-liikenne kuluttaa palveluntarjoajan kiintiötä kuuntelijakohtaisesti.

### 4. Valitse Cloudflare-osoite

**Nopea kokeilu:** jätä seuraavat `.env`-asetukset tyhjiksi:

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=
PUBLIC_URL=
```

Appi avaa käynnistyessään Quick Tunnelin ja saa julkisen `https://….trycloudflare.com`-osoitteen. Osoite vaihtuu jokaisella käynnistyksellä.

**Pysyvä osoite:** luo Cloudflaren hallinnassa nimetty tunneli ja julkaise sille sovellusreitti:

| Asetus | Esimerkki |
|---|---|
| Julkinen hostname | `audio.example.com` |
| Palvelun tyyppi | HTTP |
| Palvelun osoite | `127.0.0.1:8443` |

Lisää `.env`-tiedostoon:

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=koko_pitka_tunnel_token
PUBLIC_URL=https://audio.example.com
```

Käytä omaa Cloudflareen määritettyä domainia. Kopioi koko tunnel token Cloudflaren näyttämästä connectorin asennus-/käynnistyskomennosta. **Tunnel ID ei ole tunnel token.** Älä kopioi komentoa itsessään arvoksi.

Appi käynnistää `cloudflared`-prosessin itse, joten sitä ei tarvitse asentaa erilliseksi taustapalveluksi tätä käyttötapaa varten. Molempien asetusten pitää olla täytettyinä pysyvää osoitetta käytettäessä.

## Macin ääniasetukset

### 1. Tarkista näyttö

Kytke näyttö HDMI:llä tai USB-C:llä. Valitse se ensin Macin tavalliseksi ääniulostuloksi ja varmista, että livestreamin ääni kuuluu näytöstä.

### 2. Luo monilähtölaite

1. Avaa Spotlightilla **Ääni- ja MIDI-asetukset / Audio MIDI Setup**.
2. Avaa tarvittaessa **Ikkuna → Näytä äänilaitteet / Window → Show Audio Devices**.
3. Paina vasemman alakulman **+ → Luo monilähtölaite / Create Multi-Output Device**.
4. Valitse yhdistelmään **näytön HDMI-/DisplayPort-äänilaite** ja **BlackHole 2ch**.
5. Nimeä laite esimerkiksi **Office Audio + TV**.
6. Aseta molemmille sama näytetaajuus, mieluiten **48 000 Hz**, jos laitteet tukevat sitä.
7. Valitse fyysinen kaksikanavainen ulostulo ensisijaiseksi kellolaitteeksi. Ota **Drift Correction** käyttöön muille laitteille, kuten BlackHolelle, mutta ei kellolaitteelle.

Jos HDMI-laite on monikanavainen tai yhdistelmä ei toista ääntä, lisää Macin sisäinen ulostulo ensisijaiseksi laitteeksi ja vaimenna sen kaiuttimet erikseen. Katso [BlackHolen monilähtölaitteen ohje](https://github.com/ExistentialAudio/BlackHole/wiki/Multi-Output-Device).

### 3. Valitse Macin ulostulo

Avaa **Järjestelmäasetukset → Ääni → Ulostulo** ja valitse **Office Audio + TV**. Jos livestreamia toistavalla sovelluksella on oma ulostulovalinta, valitse sama laite siinä.

Macin tavallista sisääntuloa ei tarvitse vaihtaa: Office Audio valitsee BlackHolen erikseen.

Monilähtölaitteen yhteinen äänenvoimakkuussäädin ei yleensä toimi. Säädä TV:n voimakkuutta TV:stä tai toistosovelluksesta. Kuuntelijat säätävät oman laitteensa äänenvoimakkuutta.

## Käynnistys ja lähettäminen

Suorita projektikansiossa:

```sh
caffeinate -i npm run tunnel
```

Komento käynnistää Node-palvelimen ja Cloudflare-tunnelin sekä estää Macin automaattista nukahtamista käyttämättömyyden vuoksi. Pidä Macin kansi auki ja kone mielellään laturissa.

Odota, että pääte tulostaa julkisen kuuntelulinkin ja lähettäjälinkin. Avaa **koko lähettäjälinkki samalla Macilla Chromessa tai Edgessä**:

```text
http://localhost:8443/host#host=...
```

Lähettäjän paikallinen ohjaussivu toimii localhostissa. Kuuntelijat käyttävät Cloudflaren julkista HTTPS-osoitetta, eikä heidän tarvitse asentaa varmenteita.

1. Paina lähettäjän sivulla **Etsi** ja salli selaimen mikrofonilupa. BlackHole luetaan äänisisääntulona, joten lupa tarvitaan.
2. Salli tarvittaessa myös macOS:n **Tietosuoja ja suojaus → Mikrofoni** -kohdasta Chromen tai Edgen käyttöoikeus.
3. Valitse **BlackHole 2ch**.
4. Käynnistä livestream ja paina **Aloita lähetys**.
5. Varmista, että tasonäyttö liikkuu äänen mukana ja HDMI-ääni kuuluu edelleen.
6. Jaa lähettäjän sivulla näkyvä QR-koodi tai kuuntelulinkki.

Pidä pääte ja lähettäjän välilehti auki. Käytä vain yhtä lähettäjäikkunaa.

Voit kokeilla verkkoyhteyttä ensin **Kokeile yhteyttä testiäänellä** -toiminnolla. Testiääni menee verkkokuuntelijoille; se ei testaa BlackHolea tai HDMI-ulostuloa.

## Kuunteleminen

1. Yhdistä Bluetooth-kuulokkeet omaan puhelimeen tai tietokoneeseen.
2. Skannaa QR-koodi tai avaa koko kuuntelulinkki selaimessa.
3. Paina **Kuuntele**.
4. Jos selain näyttää **Toista ääni** -painikkeen, paina sitä.

Kuuntelija ei tarvitse mikrofonilupaa. TURN-asetusten ollessa käytössä samaan verkkoon liittymistä ei tarvita. Testaa käyttöönotossa ainakin yksi puhelin mobiilidatalla.

## Sammutus ja uudelleenkäynnistys

**Ctrl+C** päätteessä sammuttaa sekä appin että tunnelin. Lähetyksen lopettaminen ei muuta Macin ääniulostuloa: HDMI-toisto voi jatkua. Vaihda halutessasi Macin ulostulo takaisin tavalliseksi näyttöulostuloksi.

Seuraavalla kerralla:

```sh
cd ~/Documents/office-audio
caffeinate -i npm run tunnel
```

Avaa lähettäjälinkki ja aloita lähetys selaimesta uudelleen. Riippuvuuksia tai buildia ei tarvitse asentaa uudelleen joka käynnistyksellä.

### Pysyvät linkit ja QR-koodit

Appi tallentaa lähettäjän ja kuuntelijoiden tunnukset ensimmäisellä käynnistyksellä tiedostoon **`.local/session.json`**.

- Nimetty Cloudflare-tunneli ja säilytetty `session.json` pitävät täydet linkit ja QR-koodit samoina uudelleenkäynnistyksissä.
- Quick Tunnelin domain vaihtuu, joten sen kuuntelulinkki vaihtuu, vaikka liittymistunnus säilyy.
- Pelkkä domain ei anna kuunteluoikeutta: kuuntelija tarvitsee koko `#join=…`-linkin tai QR-koodin.
- Jos haluat mitätöidä vanhat tunnukset, sammuta appi, poista `.local/session.json` ja käynnistä uudelleen. Tämä vaihtaa sekä lähettäjä- että kuuntelijatunnuksen.

### Siirto toiselle Macille

Asenna työkalut, BlackHole ja repo uudelle koneelle sekä tee sen omat MIDI-asetukset. Siirrä lisäksi **`.env`** ja **`.local/session.json`** turvallisesti vanhasta projektikansiosta uuteen ennen käynnistystä. Ne eivät sisälly Git-repoon.

Sammuta vanhan koneen appi ja tunneli ennen uuden käynnistämistä. Älä aja kahta erillistä Office Audio -palvelinta samalla tunnelilla: niiden huonetila ei ole yhteinen.

## Asetukset

| Muuttuja | Tarkoitus |
|---|---|
| `METERED_DOMAIN` | Oman Metered-sovelluksen domain ilman `https://`-alkua |
| `METERED_API_KEY` | TURN-tunnuksen API Key; säilytetään palvelimella |
| `TURN_RELAY_ONLY` | `true` pakottaa TURN-välityksen; `false` sallii myös suoran WebRTC-yhteyden |
| `CLOUDFLARE_TUNNEL_TOKEN` | Nimetyn tunnelin koko token; tyhjä Quick Tunnelissa |
| `PUBLIC_URL` | Nimetyn tunnelin julkinen HTTPS-osoite; tyhjä Quick Tunnelissa |
| `PORT` | Paikallisen palvelimen portti, oletus `8443` |

Käynnistä appi uudelleen `.env`-muutosten jälkeen. Jos vaihdat porttia, päivitä myös nimetyn Cloudflare-tunnelin palvelureitti vastaamaan sitä.

## Rajaukset ja tietoturva

- **Kuuntelulinkki on pääsylippu:** jokainen sen saanut voi liittyä kuuntelemaan. MVP:ssä ei ole käyttäjätilejä tai henkilökohtaisia kuunteluoikeuksia. Pidä lähettäjälinkki erillään kuuntelulinkistä.
- `.env` ja `.local/` sisältävät salaisuuksia ja on rajattu pois Gitistä. Älä julkaise niitä tai lisää niitä jaettaviin asennuspaketteihin.
- Cloudflare julkaisee sovelluksen internetiin. Se päättää sivuston HTTPS-yhteyden ja välittää signaloinnin. Ääni käyttää WebRTC-salausta myös TURNin kautta kulkiessaan.
- Sovellus ei tallenna ääntä. Monilähtölaite kuitenkin jakaa **kaiken siihen toistetun äänen**, myös ilmoitusäänet. Käytä Älä häiritse -tilaa.
- Enimmäismäärä on **20 liittynyttä kuuntelijaa**. Selain muodostaa erillisen ääniyhteyden jokaiseen; maksimimäärää ei ole kuormitustestattu.
- Äänen bittinopeustavoite on enintään **128 kbit/s kuuntelijaa kohti**, minkä lisäksi tulee verkkoprotokollien liikennettä. TURNin kiintiön kulutus kasvaa kuuntelijamäärän mukana.
- Viivetavoite on satojen millisekuntien luokka, ei taattu mittaustulos. Verkko ja Bluetooth lisäävät viivettä. TV:n kuvaa tai ääntä ei viivästetä, eikä kuuntelijoiden toistoa synkronoida keskenään.
- Mobiiliselaimen tausta- tai lukitusruututoistoa ei taata. Puhelut ja kuulokkeiden vaihto voivat vaatia uudelleenliittymisen.
- Macin, palvelimen, tunnelin ja lähettäjän välilehden pitää pysyä käynnissä. Quick Tunnel sopii kokeiluun; pysyvään käyttöön kannattaa määrittää nimetty tunneli.

## Ongelmatilanteet

| Oire | Tarkista |
|---|---|
| BlackHole ei näy MIDI-asetuksissa | Käynnistä Mac uudelleen asennuksen jälkeen. |
| BlackHole ei näy appissa | Salli selaimen ja macOS:n mikrofoniluvat. Käynnistä selain tarvittaessa uudelleen ja paina Etsi. |
| Tasonäyttö ei liiku | Monilähtölaite on Macin ulostulona, BlackHole on mukana siinä ja valittu appissa, livestream ei ole mykistetty. |
| HDMI-ääni puuttuu | Näytön äänilaite on mukana monilähtölaitteessa. Tarkista kellolaite, näytetaajuus ja TV:n äänenvoimakkuus. |
| QR ei näy | Avaa päätteestä koko lähettäjälinkki `/host#host=…`, ei pelkkää localhost-etusivua. |
| Julkinen sivu ei aukea | Tarkista internet, tunnelin loki, domainin DNS ja Cloudflaren palvelureitti `http://127.0.0.1:8443`. |
| Sivu aukeaa, mutta ääniyhteys ei muodostu | Tarkista Meteredin TURN API Key, palvelun kiintiö ja `TURN_RELAY_ONLY=true`. Cloudflare yksin ei ratkaise ääniyhteyttä. |
| TURN-yhteystietoja ei saatu | Tarkista TURN-tunnuksen API Key ja domain. Developers-sivun Secret Key ei kelpaa. Käynnistä appi uudelleen muutosten jälkeen. |
| Yhteys muodostuu, mutta ääntä ei kuulu | Paina tarvittaessa Toista ääni, tarkista kuulokkeet ja äänenvoimakkuus. Kokeile testiääntä verkkoyhteyden erottamiseksi BlackHole-ongelmasta. |
| Yhteys toimii satunnaisesti koneen vaihdon jälkeen | Varmista, ettei sama tunneli ole edelleen käynnissä vanhalla Macilla. |
| Vanha linkki ei kelpaa | Tarkista, että alkuperäinen `.local/session.json` säilyi ja käytät nykyistä domainia. |
| Portti on varattu | Sulje aiempi Office Audio -ajo Ctrl+C:llä. Jos vaihdat porttia, muuta myös Cloudflaren palvelureitti. |
| Huone on täynnä | Sulje tarpeettomat kuuntelusivut. Raja on 20 selainyhteyttä. |

## Kehitys

Teknologiat: **Node.js, Express, React, Vite ja WebRTC**. Node välittää signaloinnin; varsinainen ääni lähtee lähettäjän selaimesta.

```sh
npm ci
npm run check
```

`check` rakentaa käyttöliittymän ja ajaa palvelimen automaattiset testit. Oikeaa WebRTC-ääntä käyttävä selainkoe, kun Google Chrome on asennettu:

```sh
BROWSER_CHANNEL=chrome npm run test:e2e
```

Selainkoe tarvitsee OpenSSL:n. Sen tilapäiset varmenteet koskevat vain testiä; normaali käyttö tapahtuu Cloudflare-tunnelin kautta.

| Hakemisto | Sisältö |
|---|---|
| `src/` | React-käyttöliittymä, äänenkaappaus ja WebRTC-yhteydet |
| `server/` | HTTP-palvelin, signalointi, TURN-asetukset, tunneli ja huonetunnukset |
| `test/` | Palvelimen testit ja WebRTC-selainkokeet |
| `.local/` | Paikalliset pysyvät tunnukset, ei versionhallinnassa |

Fyysinen äänen reititys on tarkistettava käyttöönottokoneella: testaa HDMI, BlackHolen tasomittari ja puhelimen kuuntelu ensin yhdellä ja sitten useammalla kuuntelijalla.

## Lisätietoa

- [BlackHole: Multi-Output Device](https://github.com/ExistentialAudio/BlackHole/wiki/Multi-Output-Device)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [Metered TURN](https://www.metered.ca/turn-server/)
