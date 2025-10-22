const express = require('express');
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const Papa = require('papaparse');

const app = express();
const PORT = process.env.PORT || 8888;
const jsonDataFile = path.join(__dirname, 'data.json'); // Usa un percorso assoluto

// Funzioni di calcolo (invariate)
function degToRad(deg) {
  return deg * (Math.PI / 180);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raggio della Terra in km
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function stringToDate(dateString) {
  const [datePart, timePart] = dateString.split(' ');
  if (!datePart || !timePart) return null;
  const [day, month, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

function isRecent(date) {
  if (!date) return false;
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return date >= oneWeekAgo;
}

// Funzione per scaricare e combinare i dati CSV (rifattorizzata con async/await)
async function fetchAndCombineCSVData() {
  console.log('Fetching and combining CSV data...');
  try {
    const csvAnagraficaUrl = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
    const csvPrezziUrl = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

    // Scarica i file in parallelo
    const [anagraficaResponse, prezziResponse] = await Promise.all([
      axios.get(csvAnagraficaUrl, { responseType: 'arraybuffer' }), // Aggiunto per gestire encoding
      axios.get(csvPrezziUrl, { responseType: 'arraybuffer' })      // Aggiunto per gestire encoding
    ]);

    // Decodifica i dati gestendo l'encoding ISO-8859-1 (comune nei file ministeriali)
    const anagraficaCsvString = new TextDecoder('iso-8859-1').decode(anagraficaResponse.data);
    const prezziCsvString = new TextDecoder('iso-8859-1').decode(prezziResponse.data);

    // Parsing dei CSV
    const anagraficaData = Papa.parse(anagraficaCsvString, { delimiter: ';', skipEmptyLines: true }).data;
    const prezziData = Papa.parse(prezziCsvString, { delimiter: ';', skipEmptyLines: true }).data;

    const dataDictionary = {};

    // Processa dati anagrafica (SKIPPA LA PRIMA RIGA DI INTESTAZIONE)
    for (const row of anagraficaData.slice(1)) {
      // AGGIUNTA: Controlla che la riga abbia abbastanza colonne per evitare errori
      if (row && row.length > 9) {
        const idImpianto = row[0];
        if (idImpianto && !isNaN(idImpianto) && row[8] && row[9]) { // Controllo extra per lat/lon
          dataDictionary[idImpianto] = {
            gestore: row[2],
            indirizzo: `${row[5]} ${row[6]} ${row[7]}`,
            latitudine: parseFloat(row[8].replace(',', '.')),
            longitudine: parseFloat(row[9].replace(',', '.')),
            prezzi: {}
          };
        }
      }
    }

    // Processa dati prezzi (SKIPPA LA PRIMA RIGA DI INTESTAZIONE)
    for (const row of prezziData.slice(1)) {
       // AGGIUNTA: Controlla che la riga abbia abbastanza colonne
      if (row && row.length > 4) {
        const idImpianto = row[0];
        if (dataDictionary[idImpianto] && row[1] && row[2]) { // Controllo extra per tipo e prezzo
          const fuelType = row[1].toLowerCase();
          const price = parseFloat(row[2].replace(',', '.'));
          const existingPrice = dataDictionary[idImpianto].prezzi[fuelType]?.prezzo;

          if (!isNaN(price) && (!existingPrice || price < existingPrice)) {
            dataDictionary[idImpianto].prezzi[fuelType] = {
              prezzo: price,
              self: row[3] === '1',
              data: row[4]
            };
          }
        }
      }
    }

    await fs.writeFile(jsonDataFile, JSON.stringify(dataDictionary, null, 2));
    console.log('Updated data stored successfully in JSON file.');
  } catch (error) {
    console.error(`Error fetching or processing CSV data: ${error.message}`);
    // Aggiungo uno stack trace per un debug più facile
    console.error(error.stack);
  }
}

// Funzione per leggere i dati JSON (rifattorizzata)
async function readJSONData() {
  try {
    const jsonData = await fs.readFile(jsonDataFile, 'utf8');
    return JSON.parse(jsonData);
  } catch (error) {
    console.error(`Error reading or parsing JSON data: ${error.message}`);
    return null;
  }
}

// Funzione per calcolare le stazioni migliori (rifattorizzata e con aggiunta della posizione)
function calculateTopStations(jsonData, latitude, longitude, distanceLimit, fuel, maxItems) {
    const stations = Object.values(jsonData);

    const validStations = stations.filter(station => {
        const stationFuel = station.prezzi[fuel];
        if (!stationFuel || !isRecent(stringToDate(stationFuel.data))) {
            return false;
        }

        const distance = calculateDistance(latitude, longitude, station.latitudine, station.longitudine);
        if (distance > distanceLimit) {
            return false;
        }

        // Aggiunge la distanza all'oggetto per non ricalcolarla
        station.distanza = distance;
        return true;
    });

    // Ordina per prezzo crescente
    validStations.sort((a, b) => a.prezzi[fuel].prezzo - b.prezzi[fuel].prezzo);

    // Restituisce i risultati aggiungendo il campo "posizione"
    return validStations.slice(0, maxItems).map((s, index) => ({
        ranking: index + 1, // <-- ECCO LA NUOVA INFORMAZIONE
        gestore: s.gestore,
        indirizzo: s.indirizzo,
        prezzo: s.prezzi[fuel].prezzo,
        self: s.prezzi[fuel].self,
        data: s.prezzi[fuel].data,
        distanza: s.distanza.toFixed(2), // Formattiamo qui la distanza
        latitudine: s.latitudine,
        longitudine: s.longitudine
    }));
}

// Funzione per verificare se il file è stato aggiornato di recente (rifattorizzata)
async function isFileUpdatedWithin(filePath, hours) {
  try {
    const stats = await fs.stat(filePath);
    const timeDifference = Date.now() - stats.mtime.getTime();
    const hoursDifference = timeDifference / (1000 * 60 * 60);
    return hoursDifference < hours;
  } catch (error) {
    // Se il file non esiste, ritorna false
    if (error.code === 'ENOENT') {
      return false;
    }
    console.error(`Error checking file status: ${error.message}`);
    return false;
  }
}

// Route API (rifattorizzata)
app.get('/api/distributori', async (req, res) => {
  try {
    const { latitude, longitude, distance, fuel, results } = req.query;
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const distLimit = parseInt(distance, 10);
    const maxItems = parseInt(results, 10) || 5;

    if (isNaN(lat) || isNaN(lon) || isNaN(distLimit) || !fuel) {
      return res.status(400).json({ error: 'Invalid latitude, longitude, distance or fuel values.' });
    }

    // Controlla e aggiorna il file JSON se necessario
    const isUpToDate = await isFileUpdatedWithin(jsonDataFile, 24);
    if (!isUpToDate) {
      console.log("Updating json file as it's old or missing.");
      await fetchAndCombineCSVData();
    }

    const data = await readJSONData();
    if (!data) {
        return res.status(500).json({ error: 'Could not load fuel station data.' });
    }

    const topStations = calculateTopStations(data, lat, lon, distLimit, fuel.toLowerCase(), maxItems);
    res.status(200).json(topStations);

  } catch (error) {
    console.error('Error in /api/distributori:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Avvio del server
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  // Opzionale: esegue un primo fetch all'avvio se il file non esiste
  isFileUpdatedWithin(jsonDataFile, 24).then(isUpToDate => {
      if (!isUpToDate) {
          fetchAndCombineCSVData();
      }
  });
});