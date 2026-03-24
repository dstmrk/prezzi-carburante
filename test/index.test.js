const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDataDictionary,
  calculateTopStations,
  parseCsvTable
} = require('../index.js');

test('parseCsvTable skips the extraction row and maps data using headers', () => {
  const csv = `Estrazione del 2026-03-23
idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine
59183|ENIMOOV S.P.A.|Agip Eni|Stradale|19829 AGRIGENTO|SS.189 KM. 64+649 - C.DA SAN MICHELE S.N.C.|AGRIGENTO|AG|37.333935|13.595533
`;

  const records = parseCsvTable(csv, ['idImpianto', 'Indirizzo', 'Latitudine', 'Longitudine']);

  assert.equal(records.length, 1);
  assert.equal(records[0].idimpianto, '59183');
  assert.equal(records[0].bandiera, 'Agip Eni');
  assert.equal(records[0].latitudine, '37.333935');
});

test('buildDataDictionary keeps the lowest price per fuel and preserves the previous gestore mapping', () => {
  const anagraficaCsv = `Estrazione del 2026-03-23
idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine
59183|ENIMOOV S.P.A.|Agip Eni|Stradale|19829 AGRIGENTO|SS.189 KM. 64+649 - C.DA SAN MICHELE S.N.C.|AGRIGENTO|AG|37.333935|13.595533
49195|EOS SERVICES S.R.L. A SOCIO UNICO|Q8|Stradale|AG021|VIA PETRARCA S.N. 92100|AGRIGENTO|AG|37.29823424642592|13.589792251586909
`;
  const prezziCsv = `Estrazione del 2026-03-23
idImpianto|descCarburante|prezzo|isSelf|dtComu
59183|Benzina|1.742|0|23/03/2026 07:32:11
59183|Benzina|1.637|1|23/03/2026 07:32:10
49195|Benzina|1.659|1|23/03/2026 08:10:00
`;

  const anagraficaRecords = parseCsvTable(anagraficaCsv, ['idImpianto', 'Indirizzo', 'Latitudine', 'Longitudine']);
  const prezziRecords = parseCsvTable(prezziCsv, ['idImpianto', 'descCarburante', 'prezzo', 'isSelf', 'dtComu']);
  const dataDictionary = buildDataDictionary(anagraficaRecords, prezziRecords);

  assert.equal(dataDictionary['59183'].gestore, 'Agip Eni');
  assert.equal(dataDictionary['59183'].prezzi.benzina.prezzo, 1.637);
  assert.equal(dataDictionary['59183'].prezzi.benzina.self, true);

  const topStations = calculateTopStations(dataDictionary, 37.312, 13.586, 5, 'benzina', 2);
  assert.deepEqual(topStations.map((station) => station.gestore), ['Agip Eni', 'Q8']);
  assert.deepEqual(topStations.map((station) => station.ranking), [1, 2]);
});
