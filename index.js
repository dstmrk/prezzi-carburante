const express = require('express');
const https = require('https');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 8888;
const jsonDataFile = "data.json";

//Function to transform degrees in radiants
function degToRad(deg) {
  return deg * (Math.PI / 180);
}

//Function to calculate the distance in km between two points, expressed in latitude/longitude
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers

  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  return distance;
}

//Function to parse the string format of the files into a Date item
function stringToDate(dateString) {
  const [datePart, timePart] = dateString.split(' ');
  const [day, month, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

//Function to check if the passed date is a recent one or not (last 7 days)
function isRecent(date) {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= oneWeekAgo;
}

//Function to fetch and combine the CSV data into a dictionary
function fetchAndCombineCSVData(jsonDataFile) {
  const csvAnagraficaUrl = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
  const csvPrezziUrl = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';
  const fetchData = (url, callback) => {
    https.get(url, (csvRes) => {
      let csvData = '';
      console.log(`Loading file from ${url}`);

      csvRes.on('data', (chunk) => {
        csvData += chunk;
      });

      csvRes.on('end', () => {
        callback(csvData);
      });
    }).on('error', (err) => {
      console.error(`Error fetching CSV: ${err.message}`);
    });
  };

  fetchData(csvAnagraficaUrl, (csvAnagraficaData) => {
    fetchData(csvPrezziUrl, (csvPrezziData) => {
      // Combine data from the two files into a dictionary
      const anagraficaRows = csvAnagraficaData.split('\n');
      const prezziRows = csvPrezziData.split('\n');
      const dataDictionary = {};

      // Process data from the first file (csvAnagraficaData)
      for (const row of anagraficaRows) {
        const columns = row.split(';');
        if (columns.length >= 9) {
          const key = columns[0];
          if (!isNaN(key)) {
            const value = columns.slice(1);
            dataDictionary[key] = { gestore: value[1], indirizzo: value[4] + " " + value[5] + " " + value[6], latitudine: value[7], longitudine: value[8], prezzi: {} };
          }
        }
      }

      // Process data from the second file (csvPrezziData) and add to the dictionary
      for (const row of prezziRows) {
        const columns = row.split(';');
        if (columns.length >= 2) {
          const key = columns[0];
          const value = columns.slice(1);
          if (dataDictionary[key]) {
            carburante = value[0].toLowerCase();
            price = value[1];
            if (!dataDictionary[key]["prezzi"][carburante] || dataDictionary[key]["prezzi"][carburante]["prezzo"] > price) {
              dataDictionary[key]["prezzi"][carburante] = { prezzo: price, self: value[2], data: value[3] }
            }
          }
        }
      }


      // Now you have the combined data in the dataDictionary variable
      // Convert the dictionary data to JSON and store it in a file
      const jsonData = JSON.stringify(dataDictionary, null, 2);
      fs.writeFile(jsonDataFile, jsonData, (err) => {
        if (err) {
          console.error(`Error writing JSON data to file: ${err.message}`);
        } else {
          console.log('Updated data stored successfully in JSON file.');
        }
      });
    });
  });
}

//Function to read the JSON data from the file
function readJSONData(jsonDataFile, callback) {
  fs.readFile(jsonDataFile, 'utf8', (err, jsonData) => {
    if (err) {
      console.error(`Error reading JSON data from file: ${err.message}`);
    } else {
      try {
        const data = JSON.parse(jsonData);
        callback(data);
      } catch (error) {
        console.error(`Error parsing JSON data: ${error.message}`);
      }
    }
  });
}

//Function to calculate the top stations per price
function calculateTopStations(jsonData, latitude, longitude, distanceLimit, fuel, maxItems) {
  topFuel = {};
  for (const key in jsonData) {
    const rowLatitude = jsonData[key]["latitudine"];
    const rowLongitude = jsonData[key]["longitudine"];
    const distance = calculateDistance(latitude, longitude, rowLatitude, rowLongitude);
    if (distance <= distanceLimit) {
      if (jsonData[key]["prezzi"][fuel] && isRecent(stringToDate(jsonData[key]["prezzi"][fuel]["data"]))) {
        element = { gestore: jsonData[key]["gestore"], indirizzo: jsonData[key]["indirizzo"], prezzo: jsonData[key]["prezzi"][fuel]["prezzo"], self: jsonData[key]["prezzi"][fuel]["self"], data: jsonData[key]["prezzi"][fuel]["data"], distanza: distance.toFixed(2) + " km", latitudine: jsonData[key]["latitudine"], longitudine: jsonData[key]["longitudine"] };
        for (i = 1; i <= maxItems; i++) {
          if (!topFuel[i] || element["prezzo"] < topFuel[i]["prezzo"]) {
            topFuel[i] = element;
            break;
          }
        }
      }
    }
  }
  return topFuel;
}

//Function to check if the json file has been updated in the latest 24 hours
function hasFileBeenUpdatedWithin24Hours(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const lastModifiedTime = stats.mtime; // Last modification time of the file
    const currentTime = new Date();
    const timeDifference = currentTime.getTime() - lastModifiedTime.getTime();
    const hoursDifference = timeDifference / (1000 * 60 * 60);
    return hoursDifference < 24;
  } catch (error) {
    // Handle any errors that may occur during the file stat retrieval
    console.error(`Error checking file status: ${error.message}`);
    return false; // Return false in case of an error
  }
}

// Function to check if a file exists at the given path
function doesFileExist(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    // Handle any errors that may occur during the file existence check
    console.error(`Error checking file existence: ${error.message}`);
    return false; // Return false in case of an error
  }
}
if (!doesFileExist(jsonDataFile)) {
  fetchAndCombineCSVData(jsonDataFile);
}
app.get('/api/distributori', async (req, res) => {
  const MAX_RESULTS = 5;
  if (req.method === 'GET' && req.url.startsWith('/api/distributori')) {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const latitude = parseFloat(urlParams.get('latitude'));
    const longitude = parseFloat(urlParams.get('longitude'));
    const distanceLimit = parseInt(urlParams.get('distance'));
    const fuel = urlParams.get('fuel').toLowerCase();
    maxItems = parseInt(urlParams.get('results'));
    if (!maxItems) {
      maxItems = MAX_RESULTS;
    }
    if (isNaN(latitude) || isNaN(longitude) || isNaN(distanceLimit) || !fuel) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid latitude, longitude, distance or fuel values.' }));
      return;
    }
    if (!hasFileBeenUpdatedWithin24Hours(jsonDataFile)) {
      console.log("Updating json file");
      fetchAndCombineCSVData(jsonDataFile);
    }
    // Load the JSON file and process it here.
    readJSONData(jsonDataFile, (data) => {
      topStations = calculateTopStations(data, latitude, longitude, distanceLimit, fuel, maxItems);
      // The response contains the N cheapest gas stations in the specified radius, for the given fuel
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(topStations));
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found.' }));
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});


