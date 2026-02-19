// Test if HiBid API returns multiple pictures per lot
const GRAPHQL_URL = 'https://kleinfelters.hibid.com/graphql';

const QUERY = `query {
  lotSearch(input: { status: OPEN }, pageNumber: 1, pageLength: 5) {
    pagedResults {
      results {
        id
        lead
        pictureCount
        pictures {
          fullSizeLocation
          thumbnailLocation
          description
        }
      }
    }
  }
}`;

const res = await fetch(GRAPHQL_URL, {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'SITE_SUBDOMAIN': 'kleinfelters.hibid.com',
  },
  body: JSON.stringify({ query: QUERY }),
});

const json = await res.json();
if (json.errors) {
  console.log('Errors:', JSON.stringify(json.errors, null, 2));
} else {
  for (const lot of json.data.lotSearch.pagedResults.results) {
    console.log(`\n${lot.lead} (${lot.pictureCount} pics)`);
    if (lot.pictures) {
      lot.pictures.forEach((p, i) => console.log(`  ${i + 1}. ${p.fullSizeLocation}`));
    } else {
      console.log('  pictures: null');
    }
  }
}
