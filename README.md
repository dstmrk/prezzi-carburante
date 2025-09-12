# prezzi-carburante
API per identificare i distributori di carburante più economici in base agli opendata disponibili su https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti.

API disponibile su: [https://prezzi-carburante.onrender.com/api/distributori](https://prezzi-carburante.onrender.com/api/distributori)

endpoint:
distributori (GET)

parametri:
```
latitude:            latitudine del punto di ricerca (es. 46.19344671669768)
longitude:           longitudine del punto di ricerca (es. 9.148853607434744)
distance:            raggio di ricerca in km dalle coordinate specificate
fuel:                tipo di carburante. I più comuni sono benzina, gasolio
results (optional):  il numero di risultati da restituire. Se non è indicato, il default è 5
```

output:
un json contenente il numero di risultati trovati, con chiave per ogni elemento relativa all'ordine rispetto al prezzo più basso, e le informazioni su gestore, indirizzo, prezzo in €/l, indicazione self (0/1), data di aggiornamento dell'informazione, distanza in km dal punto di ricerca, latitudine e longitudine del distributore.


esempio di query:
https://prezzi-carburante.onrender.com/api/distributori?latitude=45.14027999213074&longitude=7.007186940593831&distance=5&fuel=benzina&results=3

esempio di risposta:
```
{
    "1": {
        "gestore": "Tamoil",
        "indirizzo": "Statale 25 del Moncenisio, Km. 51 + 189, dir. Susa - 10059 SUSA TO",
        "prezzo": "1.939",
        "self": "1",
        "data": "01/08/2023 07:06:13",
        "distanza": "5.01",
        "latitudine": "45.137168355127265",
        "longitudine": "7.070930600166321"
    },
    "2": {
        "gestore": "Api-Ip",
        "indirizzo": "SUSA - fraz SAN GIULIANO - S.S. 25 KM. 49,469  10059 SUSA TO",
        "prezzo": "1.939",
        "self": "1",
        "data": "31/07/2023 17:01:44",
        "distanza": "6.64",
        "latitudine": "45.13802648847826",
        "longitudine": "7.091783906745945"
    },
    "3": {
        "gestore": "Economysrl",
        "indirizzo": "24 del Monginevro, Km. 60, Nord - 10050 GRAVERE TO",
        "prezzo": "1.948",
        "self": "1",
        "data": "29/07/2023 08:13:55",
        "distanza": "1.50",
        "latitudine": "45.1271956771795",
        "longitudine": "7.011626588954929"
    }
}
```

## Supporto
Se hai trovato utile questo codice, puoi offrirmi un caffé :)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S6S41L5113)
