# Prezzi Carburante API

![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

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
    "gestore": "Api-Ip",
    "indirizzo": "SUSA - fraz SAN GIULIANO - S.S. 25 KM. 49,469  10059 SUSA TO",
    "prezzo": 1.689,
    "self": true,
    "data": "19/10/2025 09:01:23",
    "distanza": "6.64",
    "latitudine": 45.1380264884783,
    "longitudine": 7.09178390674595
  },
  {
    "ranking": 2,
    "gestore": "Agip Eni",
    "indirizzo": "24 del Monginevro, Km. 55+260, monginevro - 10059 SUSA TO",
    "prezzo": 1.689,
    "self": true,
    "data": "20/10/2025 07:28:08",
    "distanza": "3.53",
    "latitudine": 45.1350398248141,
    "longitudine": 7.0515458745997
  },
  {
    "ranking": 3,
    "gestore": "Tamoil",
    "indirizzo": "24 del Monginevro, Km. 60, Nord - 10050 GRAVERE TO",
    "prezzo": 1.698,
    "self": true,
    "data": "15/10/2025 17:51:35",
    "distanza": "1.50",
    "latitudine": 45.1271956771795,
    "longitudine": 7.01162658895493
  }
]
```

## Supporto
Se hai trovato utile questo codice, puoi offrirmi un caffé :)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S6S41L5113)
