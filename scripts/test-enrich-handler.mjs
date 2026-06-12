import albumHandler from './api-entries/album-info.entry.ts';
import enrichHandler from '../api/enrich.ts';

function mockRes() {
  let statusCode = 0;
  return {
    headersSent: false,
    status(c) {
      statusCode = c;
      return this;
    },
    json(b) {
      console.log('STATUS', statusCode, JSON.stringify(b).slice(0, 300));
    },
    setHeader() {
      return this;
    },
  };
}

async function run() {
  console.log('=== /api/enrich POST ===');
  await enrichHandler(
    {
      method: 'POST',
      url: '/api/enrich',
      headers: { 'content-type': 'application/json' },
      body: { artist: 'Moodymann', title: 'Hold It Down', genres: ['Deep House'] },
      query: {},
    },
    mockRes()
  );

  console.log('\n=== /api/enrich forced error ===');
  await enrichHandler(
    {
      method: 'POST',
      url: '/api/enrich',
      headers: {},
      body: undefined,
      query: {},
    },
    mockRes()
  );

  console.log('\n=== /api/album-info GET ===');
  await albumHandler(
    {
      method: 'GET',
      url: '/api/album-info?artist=Sade&album=Diamond%20Life',
      headers: {},
      body: undefined,
      query: { artist: 'Sade', album: 'Diamond Life' },
    },
    mockRes()
  );
}

run().catch((e) => {
  console.error('HANDLER CRASH', e);
  process.exit(1);
});