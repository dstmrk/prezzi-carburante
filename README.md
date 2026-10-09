# Prezzi Carburante

![Node.js](https://img.shields.io/badge/node-%E2%89%A522.18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

Web app e API per trovare i distributori di carburante più economici in Italia, vicino a un punto o lungo un percorso. I dati sono gli open data ufficiali del MIMIT, aggiornati ogni mattina.

- **App e API:** <https://prezzi-carburante.onrender.com>
- **Specifica OpenAPI:** [`openapi.yaml`](openapi.yaml), servita anche su [`/openapi.yaml`](https://prezzi-carburante.onrender.com/openapi.yaml)
- **Fonte dati:** [Carburanti - Prezzi praticati e anagrafica degli impianti](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti)

## Riferimento API

L'API è pubblica, senza autenticazione, con CORS aperto. Gli errori hanno sempre la forma `{ "error": "messaggio" }`. Subito dopo un avvio, finché i dati non sono scaricati, gli endpoint rispondono `503` con l'header `Retry-After`.

### GET `/api/distributori`

Distributori più economici entro un raggio, ordinati per prezzo crescente e, a parità di prezzo, per distanza.

| Parametro   | Tipo      | Descrizione                                                                              |
| ----------- | --------- | ---------------------------------------------------------------------------------------- |
| `latitude`  | `float`   | **Obbligatorio.** Latitudine del punto di ricerca (es. `45.4642`).                       |
| `longitude` | `float`   | **Obbligatorio.** Longitudine del punto di ricerca (es. `9.1900`).                       |
| `distance`  | `float`   | **Obbligatorio.** Raggio di ricerca in km (es. `5`, massimo `50`).                       |
| `fuel`      | `string`  | **Obbligatorio.** Tipo di carburante (es. `benzina`, `gasolio`): vedi `/api/carburanti`. |
| `results`   | `integer` | _Opzionale._ Numero massimo di risultati, da 1 a 50. **Default: 5**.                     |
| `maxAge`    | `float`   | _Opzionale._ Esclude i prezzi comunicati più di N giorni fa (es. `7`).                   |

**Richiesta:**
<https://prezzi-carburante.onrender.com/api/distributori?latitude=45.14027999213074&longitude=7.007186940593831&distance=10&fuel=benzina&results=2>

**Risposta (`200 OK`):**

```json
[
  {
    "ranking": 1,
    "gestore": "Agip Eni",
    "indirizzo": "24 del Monginevro, Km. 55+260, monginevro - 10059 SUSA TO",
    "prezzo": 1.99,
    "self": true,
    "data": "07/10/2026 12:29:13",
    "distanza": "3.53",
    "latitudine": 45.13503982481405,
    "longitudine": 7.051545874599697,
    "id": 46974,
    "nome": "stazione servizio eni"
  },
  {
    "ranking": 2,
    "gestore": "Q8",
    "indirizzo": "AUTOPORTO SUSA-FZ. TRADUERIVI 12 10059 SUSA TO",
    "prezzo": 1.994,
    "self": true,
    "data": "06/10/2026 13:07:03",
    "distanza": "6.38",
    "latitudine": 45.136095545827374,
    "longitudine": 7.088273763656616,
    "id": 11869,
    "nome": "SUSA TO-AUTOPORTO SUSA-FZ. TRADUERIVI 12"
  }
]
```

- `gestore` è la bandiera dell'impianto (`Pompe Bianche` per quelli senza marchio).
- `data` è la data di comunicazione del prezzo, in ora italiana.
- `distanza` è una stringa con due decimali, in km.
- `id` è l'identificativo da usare come `stationID` in `/api/prezzo`.

### GET `/api/prezzo`

Prezzo di un carburante in un impianto.

| Parametro   | Tipo      | Descrizione                                                      |
| ----------- | --------- | ---------------------------------------------------------------- |
| `stationID` | `integer` | **Obbligatorio.** Identificativo dell'impianto (es. `28617`).    |
| `fuel`      | `string`  | **Obbligatorio.** Tipo di carburante (es. `benzina`, `gasolio`). |
| `output`    | `string`  | _Opzionale._ `json` (default) oppure `text`.                     |

Con `output=text` la risposta è solo il prezzo in `text/plain`, con la virgola e tre decimali (es. `1,879`): comodo per Home Assistant o Comandi Rapidi.

**Richiesta:**
<https://prezzi-carburante.onrender.com/api/prezzo?stationID=28617&fuel=benzina>

**Risposta (`200 OK`):**

```json
{
  "gestore": "Api-Ip",
  "indirizzo": "SUSA - fraz SAN GIULIANO - S.S. 25 KM. 49,469 10059 SUSA TO",
  "prezzo": 2.03,
  "self": true,
  "data": "07/10/2026 09:04:41"
}
```

### POST `/api/percorso`

Distributori più economici lungo un percorso, entro una distanza massima dal tracciato.

```json
{
  "points": [
    [45.4642, 9.19],
    [44.4949, 11.3426]
  ],
  "fuel": "gasolio",
  "distance": 2,
  "results": 20,
  "maxAge": 7
}
```

| Campo      | Descrizione                                                                  |
| ---------- | ---------------------------------------------------------------------------- |
| `points`   | **Obbligatorio.** Da 2 a 1000 tappe `[latitudine, longitudine]`, in ordine.  |
| `fuel`     | **Obbligatorio.** Tipo di carburante.                                        |
| `distance` | _Opzionale._ Distanza massima dal percorso in km, fino a 10. **Default: 2**. |
| `results`  | _Opzionale._ Numero massimo di risultati, da 1 a 50. **Default: 20**.        |
| `maxAge`   | _Opzionale._ Esclude i prezzi comunicati più di N giorni fa.                 |

La risposta ha gli stessi campi di `/api/distributori`, con `distanza` misurata dal percorso, più `km`: la progressiva lungo il tracciato.

### GET `/api/carburanti`

Valori accettati dal parametro `fuel`, con il numero di impianti che li vendono:

```json
[
  { "id": "gasolio", "nome": "Gasolio", "impianti": 21111 },
  { "id": "benzina", "nome": "Benzina", "impianti": 21104 }
]
```

### GET `/api/stato` e GET `/healthz`

`/api/stato` dice se i dati sono in memoria, la data di estrazione MIMIT e quando sono stati scaricati. `/healthz` risponde `{"status":"ok"}` finché il server è vivo e serve da health check per Render.

### Compatibilità

Gli endpoint, i parametri e i campi della v2 restano invariati. La v3 aggiunge:

- il parametro `maxAge`;
- i campi `id` e `nome` nelle risposte;
- gli endpoint `/api/percorso`, `/api/carburanti`, `/api/stato` e `/healthz`.

Cambiano alcuni comportamenti, tutti per correggere bug:

- a parità di prezzo vince il distributore più vicino;
- `output=text` restituisce sempre tre decimali (`1,800` invece di `1,8`), con `Content-Type: text/plain`.

## Qualità dei dati

I CSV del MIMIT hanno diversi difetti. Il parser li gestisce così:

- **Separatore nei nomi.** Alcuni nomi contengono il separatore `|`. Prima venivano scartati più di 100 impianti; ora i campi in eccesso finiscono nel nome.
- **Virgolette non chiuse.** Alcuni nomi aprono una virgoletta senza chiuderla. Un parser CSV standard fondeva gli impianti tra loro, perdendone circa 1.200 e attribuendo a qualcuno i prezzi di un altro. Il formato MIMIT non usa il quoting, quindi ora le virgolette restano testo.
- **Codifica.** L'anagrafica è in UTF-8: veniva letta come Latin-1 e trasformava `CANICATTÌ` in `CANICATTÃ`. Ora la codifica viene riconosciuta automaticamente.
- **Prezzi segnaposto.** Valori come `0,100 €` o `8,888 €` finivano in cima alla classifica. Ora vengono scartati i prezzi fuori da 0,6×–2× la mediana nazionale del carburante: circa 70 su 90.000.
- **Prezzi vecchi.** I prezzi comunicati più di 15 giorni fa non vengono mai serviti. Le date sono interpretate nel fuso di Roma.

Il server riscarica i dati ogni ora con richieste condizionali (`ETag`), che costano un `304` quando il MIMIT non ha pubblicato nulla. Nel frattempo serve i dati che ha già. Se il download fallisce riprova con backoff esponenziale, senza bloccare le richieste.

## Sviluppo

Serve Node.js 22.18 o successivo: il server è TypeScript eseguito direttamente da Node, senza compilazione.

```bash
npm install
npm run dev      # API su :8888 e frontend Vite su :5173 con hot reload
npm run check    # typecheck, lint, formattazione e test
npm run build    # build del frontend in dist/
npm start        # server di produzione: API + frontend da dist/
```

| Cartella  | Contenuto                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/` | API Express 5: parsing dei CSV, dati in memoria, ricerca geografica, HTTP                                                                                                             |
| `src/`    | Frontend React 19 + Vite, componenti [shadcn/ui](https://ui.shadcn.com) e Tailwind CSS 4, mappa [mapcn](https://mapcn.dev) (MapLibre) con tile [OpenFreeMap](https://openfreemap.org) |
| `shared/` | Tipi del contratto API e utility usate da server e frontend                                                                                                                           |
| `test/`   | Test del server (Vitest)                                                                                                                                                              |

Le dipendenze del frontend sono in `devDependencies`: vengono incluse nel bundle da Vite, quindi in produzione restano installate solo quelle del server.

Variabili d'ambiente, tutte opzionali: `PORT` (default `8888`), `DATA_REFRESH_MINUTES` (default `60`), `MIMIT_ANAGRAFICA_URL` e `MIMIT_PREZZI_URL` (per puntare a una copia dei CSV).

## Deploy

Render fa il deploy automatico a ogni push su `main`. Impostazioni del servizio:

| Impostazione      | Valore                                                          |
| ----------------- | --------------------------------------------------------------- |
| Build Command     | `npm ci --include=dev && npm run build && npm prune --omit=dev` |
| Start Command     | `npm start`                                                     |
| Health Check Path | `/healthz`                                                      |

La versione di Node viene letta da `.node-version`. Le stesse impostazioni sono in [`render.yaml`](render.yaml), per chi gestisce il servizio come Blueprint.

## Supporto

Se hai trovato utile questo codice, puoi offrirmi un caffè :)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S6S41L5113)
