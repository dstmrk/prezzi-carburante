const express = require('express');
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const Papa = require('papaparse');

const app = express();
const cors = require('cors');

const PORT = process.env.PORT || 8888;

app.use(cors());                    // permette tutte le richieste locali
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const jsonDataFile = path.join(__dirname, 'data.json'); // Usa un percorso assoluto

let cachedData = null;   // cache in memoria dei dati parsed
let fetchPromise = null; // singleton per evitare fetch concorrenti

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

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function parseCsvRows(csvString) {
  return Papa.parse(csvString, { delimiter: '|', skipEmptyLines: true }).data;
}

function findHeaderRowIndex(rows, requiredHeaders) {
  return rows.findIndex((row) => {
    if (!Array.isArray(row)) {
      return false;
    }

    const normalizedRow = row.map(normalizeHeader);
    return requiredHeaders.every((header) => normalizedRow.includes(normalizeHeader(header)));
  });
}

function parseCsvTable(csvString, requiredHeaders) {
  const rows = parseCsvRows(csvString);
  const headerRowIndex = findHeaderRowIndex(rows, requiredHeaders);

  if (headerRowIndex === -1) {
    throw new Error(`CSV header not found. Expected headers: ${requiredHeaders.join(', ')}`);
  }

  const headerRow = rows[headerRowIndex].map(normalizeHeader);

  return rows.slice(headerRowIndex + 1).reduce((records, row) => {
    if (!Array.isArray(row) || row.every((cell) => String(cell || '').trim() === '')) {
      return records;
    }

    const record = {};
    headerRow.forEach((header, index) => {
      record[header] = typeof row[index] === 'string' ? row[index].trim() : row[index];
    });
    records.push(record);
    return records;
  }, []);
}

function getField(record, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function parseNumericValue(value) {
  if (value === undefined || value === null || value === '') {
    return NaN;
  }

  return parseFloat(String(value).replace(',', '.'));
}

function buildDataDictionary(anagraficaRecords, prezziRecords) {
  const dataDictionary = {};

  for (const record of anagraficaRecords) {
    const idImpianto = getField(record, ['idimpianto']);
    const latitudine = parseNumericValue(getField(record, ['latitudine']));
    const longitudine = parseNumericValue(getField(record, ['longitudine']));

    if (!idImpianto || isNaN(latitudine) || isNaN(longitudine)) {
      continue;
    }

    const gestore = getField(record, ['bandiera', 'gestore', 'nome impianto']);
    const indirizzo = [
      getField(record, ['indirizzo']),
      getField(record, ['comune']),
      getField(record, ['provincia'])
    ].filter(Boolean).join(' ');

    dataDictionary[idImpianto] = {
      gestore,
      indirizzo,
      latitudine,
      longitudine,
      prezzi: {}
    };
  }

  for (const record of prezziRecords) {
    const idImpianto = getField(record, ['idimpianto']);
    const fuelType = getField(record, ['desccarburante']).toLowerCase();
    const price = parseNumericValue(getField(record, ['prezzo']));

    if (!dataDictionary[idImpianto] || !fuelType || isNaN(price)) {
      continue;
    }

    const existingPrice = dataDictionary[idImpianto].prezzi[fuelType]?.prezzo;
    if (!existingPrice || price < existingPrice) {
      dataDictionary[idImpianto].prezzi[fuelType] = {
        prezzo: price,
        self: getField(record, ['isself']) === '1',
        data: getField(record, ['dtcomu'])
      };
    }
  }

  return dataDictionary;
}

async function axiosGetWithRetry(url, config, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = 2000 * attempt;
      console.warn(`Retry ${attempt}/${maxRetries} for ${url} after ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function fetchAndCombineCSVData() {
  console.log('Fetching and combining CSV data...');
  try {
    const csvAnagraficaUrl = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
    const csvPrezziUrl = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

    // Scarica i file in parallelo con timeout e retry
    const axiosConfig = { responseType: 'arraybuffer', timeout: 30000 };
    const [anagraficaResponse, prezziResponse] = await Promise.all([
      axiosGetWithRetry(csvAnagraficaUrl, axiosConfig),
      axiosGetWithRetry(csvPrezziUrl, axiosConfig)
    ]);

    // Decodifica i dati gestendo l'encoding ISO-8859-1 (comune nei file ministeriali)
    const anagraficaCsvString = new TextDecoder('iso-8859-1').decode(anagraficaResponse.data);
    const prezziCsvString = new TextDecoder('iso-8859-1').decode(prezziResponse.data);

    const anagraficaRecords = parseCsvTable(anagraficaCsvString, [
      'idImpianto',
      'Indirizzo',
      'Latitudine',
      'Longitudine'
    ]);
    const prezziRecords = parseCsvTable(prezziCsvString, [
      'idImpianto',
      'descCarburante',
      'prezzo',
      'isSelf',
      'dtComu'
    ]);
    const dataDictionary = buildDataDictionary(anagraficaRecords, prezziRecords);

    await fs.writeFile(jsonDataFile, JSON.stringify(dataDictionary));
    cachedData = dataDictionary;
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

    const validStations = [];
    for (const station of stations) {
        const stationFuel = station.prezzi[fuel];
        if (!stationFuel || !isRecent(stringToDate(stationFuel.data))) continue;

        const distance = calculateDistance(latitude, longitude, station.latitudine, station.longitudine);
        if (distance > distanceLimit) continue;

        validStations.push({ station, distance });
    }

    // Ordina per prezzo crescente
    validStations.sort((a, b) => a.station.prezzi[fuel].prezzo - b.station.prezzi[fuel].prezzo);

    // Restituisce i risultati aggiungendo il campo "posizione"
    return validStations.slice(0, maxItems).map(({ station: s, distance }, index) => ({
        ranking: index + 1,
        gestore: s.gestore,
        indirizzo: s.indirizzo,
        prezzo: s.prezzi[fuel].prezzo,
        self: s.prezzi[fuel].self,
        data: s.prezzi[fuel].data,
        distanza: distance.toFixed(2),
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

// Restituisce i dati dalla cache in memoria, o li carica dal disco se non disponibili
async function getData() {
  if (cachedData) return cachedData;
  const data = await readJSONData();
  cachedData = data;
  return data;
}

// Garantisce che i dati siano aggiornati, evitando fetch concorrenti (singleton)
async function ensureDataFresh() {
  const isUpToDate = await isFileUpdatedWithin(jsonDataFile, 24);
  if (isUpToDate && cachedData) return;

  if (!fetchPromise) {
    fetchPromise = fetchAndCombineCSVData().finally(() => {
      fetchPromise = null;
    });
  }
  await fetchPromise;
}

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

    await ensureDataFresh();

    const data = await getData();
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

app.get('/api/prezzo', async (req, res) => {
  try {
    const { stationID, fuel, output } = req.query;

    if (!stationID || !fuel) {
      return res.status(400).json({ error: 'stationID and fuel are required.' });
    }

    const data = await getData();
    if (!data) {
      return res.status(500).json({ error: 'Could not load fuel station data.' });
    }

    const station = data[stationID];
    if (!station) {
      return res.status(404).json({ error: 'Station not found.' });
    }
    const fuelData = station.prezzi[fuel.toLowerCase()];
    if (!fuelData) {
      return res.status(404).json({ error: 'Fuel type not found for this station.' });
    }
    
    const price = {
      gestore: station.gestore,
      indirizzo: station.indirizzo,
      prezzo: fuelData.prezzo,
      self: fuelData.self,
      data: fuelData.data
    };

    res.status(200).send(output === 'text' ? String(price.prezzo).replace(".", ",") : price);
  } catch (error) {
    console.error('Error in /api/prezzo:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

function startServer() {
  return app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    ensureDataFresh();
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  buildDataDictionary,
  calculateDistance,
  calculateTopStations,
  ensureDataFresh,
  fetchAndCombineCSVData,
  findHeaderRowIndex,
  getData,
  isFileUpdatedWithin,
  isRecent,
  normalizeHeader,
  parseCsvRows,
  parseCsvTable,
  readJSONData,
  startServer,
  stringToDate
};
