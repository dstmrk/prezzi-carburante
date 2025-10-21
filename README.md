# Prezzi Carburante API

API per identificare i distributori di carburante più economici in Italia, basata sugli open data del MIMIT.

- **Fonte Dati:** [Carburanti - Prezzi praticati e anagrafica degli impianti](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti)
- **API Live:** `https://prezzi-carburante.onrender.com`

## Come usarlo

1.  **Clona il repository:**
    ```bash
    git clone https://github.com/tuo-username/prezzi-carburante.git
    cd prezzi-carburante
    ```

2.  **Installa le dipendenze:**
    ```bash
    npm install
    ```

3.  **Avvia il server di sviluppo:**
    ```bash
    node index.js
    ```
    Il server sarà disponibile su `http://localhost:8888`.

## Riferimento API

### GET `/api/distributori`

Restituisce un elenco delle stazioni di servizio più economiche in base ai parametri di ricerca.

#### Parametri della Query

| Parametro   | Tipo      | Descrizione                                                                          |
|-------------|-----------|--------------------------------------------------------------------------------------|
| `latitude`  | `float`   | **Obbligatorio.** Latitudine del punto di ricerca (es. `45.4642`).                     |
| `longitude` | `float`   | **Obbligatorio.** Longitudine del punto di ricerca (es. `9.1900`).                     |
| `distance`  | `integer` | **Obbligatorio.** Raggio di ricerca in km (es. `5`).                                   |
| `fuel`      | `string`  | **Obbligatorio.** Tipo di carburante (es. `benzina`, `gasolio`).                       |
| `results`   | `integer` | *Opzionale.* Numero massimo di risultati da restituire. **Default: 5**.                  |

#### Esempio di Utilizzo

**Richiesta:**
https://prezzi-carburante.onrender.com/api/distributori?latitude=45.14027999213074&longitude=7.007186940593831&distance=10&fuel=benzina&results=3

**Risposta (`200 OK`):**
La risposta è un array JSON di oggetti, ordinati per prezzo crescente. Ogni oggetto include un campo `ranking` che indica la posizione nell'ordine.

```json
[
    {
        "ranking": 1,
        "gestore": "Economysrl",
        "indirizzo": "24 del Monginevro, Km. 60, Nord - 10050 GRAVERE TO",
        "prezzo": 1.948,
        "self": true,
        "data": "29/07/2023 08:13:55",
        "distanza": "1.50",
        "latitudine": 45.1271956771795,
        "longitudine": 7.011626588954929
    },
    {
        "ranking": 2,
        "gestore": "Tamoil",
        "indirizzo": "Statale 25 del Moncenisio, Km. 51 + 189, dir. Susa - 10059 SUSA TO",
        "prezzo": 1.939,
        "self": true,
        "data": "01/08/2023 07:06:13",
        "distanza": "5.01",
        "latitudine": 45.137168355127265,
        "longitudine": 7.070930600166321
    },
    {
        "ranking": 3,
        "gestore": "Api-Ip",
        "indirizzo": "SUSA - fraz SAN GIULIANO - S.S. 25 KM. 49,469  10059 SUSA TO",
        "prezzo": 1.939,
        "self": false,
        "data": "31/07/2023 17:01:44",
        "distanza": "6.64",
        "latitudine": 45.13802648847826,
        "longitudine": 7.091783906745945
    }
]
```

## Supporto
Se hai trovato utile questo codice, puoi offrirmi un caffé :)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S6S41L5113)
