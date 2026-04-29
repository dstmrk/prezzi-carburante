const express = require('express');
const axios = require('axios');
const path = require('path');
const Papa = require('papaparse');
const compression = require('compression');
const cors = require('cors');

const app = express();

const PORT = process.env.PORT || 8888;
const DATA_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DISTANCE_KM = 50;
const MAX_RESULTS = 50;

app.use(compression());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let cachedData = null;
let lastFetchAt = 0;
let fetchPromise = null;

function degToRad(deg) {
  return deg * (Math.PI / 180);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
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
  const dataDictionary = Object.create(null);

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
      prezzi: Object.create(null)
    };
  }

  for (const record of prezziRecords) {
    const idImpianto = getField(record, ['idimpianto']);
    const station = dataDictionary[idImpianto];
    if (!station) continue;

    const fuelType = getField(record, ['desccarburante']).toLowerCase();
    const price = parseNumericValue(getField(record, ['prezzo']));
    if (!fuelType || isNaN(price)) continue;

    const dataRaw = getField(record, ['dtcomu']);
    if (!isRecent(stringToDate(dataRaw))) continue;

    const existing = station.prezzi[fuelType];
    if (!existing || price < existing.prezzo) {
      station.prezzi[fuelType] = {
        prezzo: price,
        self: getField(record, ['isself']) === '1',
        data: dataRaw
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
  const csvAnagraficaUrl = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
  const csvPrezziUrl = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

  const axiosConfig = { responseType: 'arraybuffer', timeout: 30000 };
  const [anagraficaResponse, prezziResponse] = await Promise.all([
    axiosGetWithRetry(csvAnagraficaUrl, axiosConfig),
    axiosGetWithRetry(csvPrezziUrl, axiosConfig)
  ]);

  const decoder = new TextDecoder('iso-8859-1');
  const anagraficaRecords = parseCsvTable(decoder.decode(anagraficaResponse.data), [
    'idImpianto',
    'Indirizzo',
    'Latitudine',
    'Longitudine'
  ]);
  const prezziRecords = parseCsvTable(decoder.decode(prezziResponse.data), [
    'idImpianto',
    'descCarburante',
    'prezzo',
    'isSelf',
    'dtComu'
  ]);

  cachedData = buildDataDictionary(anagraficaRecords, prezziRecords);
  lastFetchAt = Date.now();
  console.log('Data refresh complete.');
}

async function getData() {
  return cachedData;
}

async function ensureDataFresh() {
  if (cachedData && Date.now() - lastFetchAt < DATA_TTL_MS) return;

  if (!fetchPromise) {
    fetchPromise = fetchAndCombineCSVData()
      .catch((error) => {
        console.error(`Error fetching CSV data: ${error.message}`);
        if (error.stack) console.error(error.stack);
      })
      .finally(() => {
        fetchPromise = null;
      });
  }
  await fetchPromise;
}

function calculateTopStations(jsonData, latitude, longitude, distanceLimit, fuel, maxItems) {
  const latDelta = distanceLimit / 111;
  const cosLat = Math.cos(degToRad(latitude));
  const lonDelta = distanceLimit / (111 * Math.max(cosLat, 0.01));
  const minLat = latitude - latDelta;
  const maxLat = latitude + latDelta;
  const minLon = longitude - lonDelta;
  const maxLon = longitude + lonDelta;

  const validStations = [];
  for (const id in jsonData) {
    const station = jsonData[id];
    if (
      station.latitudine < minLat ||
      station.latitudine > maxLat ||
      station.longitudine < minLon ||
      station.longitudine > maxLon
    ) continue;

    const stationFuel = station.prezzi[fuel];
    if (!stationFuel) continue;

    const distance = calculateDistance(latitude, longitude, station.latitudine, station.longitudine);
    if (distance > distanceLimit) continue;

    validStations.push({ station, distance });
  }

  validStations.sort((a, b) => a.station.prezzi[fuel].prezzo - b.station.prezzi[fuel].prezzo);

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

function setApiCacheHeaders(res) {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
}

app.get('/api/distributori', async (req, res) => {
  try {
    const { latitude, longitude, distance, fuel, results } = req.query;
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const distLimitRaw = parseFloat(distance);
    const maxItemsRaw = parseInt(results, 10);

    if (isNaN(lat) || isNaN(lon) || isNaN(distLimitRaw) || distLimitRaw <= 0 || !fuel) {
      return res.status(400).json({ error: 'Invalid latitude, longitude, distance or fuel values.' });
    }

    const distLimit = Math.min(distLimitRaw, MAX_DISTANCE_KM);
    const maxItems = Math.min(Math.max(maxItemsRaw || 5, 1), MAX_RESULTS);

    await ensureDataFresh();

    const data = await getData();
    if (!data) {
      return res.status(503).json({ error: 'Fuel station data not yet available, try again shortly.' });
    }

    const topStations = calculateTopStations(data, lat, lon, distLimit, fuel.toLowerCase(), maxItems);
    setApiCacheHeaders(res);
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

    await ensureDataFresh();

    const data = await getData();
    if (!data) {
      return res.status(503).json({ error: 'Fuel station data not yet available, try again shortly.' });
    }

    const station = Object.prototype.hasOwnProperty.call(data, stationID) ? data[stationID] : null;
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

    setApiCacheHeaders(res);
    res.status(200).send(output === 'text' ? String(price.prezzo).replace('.', ',') : price);
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
  isRecent,
  normalizeHeader,
  parseCsvRows,
  parseCsvTable,
  startServer,
  stringToDate
};
