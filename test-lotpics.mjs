// Test fetching pictures for a specific lot
const GRAPHQL_URL = 'https://kleinfelters.hibid.com/graphql';

// Try querying with a small page to find lot by searching all with pictures
// Actually, let's just fetch page 1 with pictures and see if lot IDs match
const lotId = 286460681; // "Vintage Books" lot

const res = await fetch(GRAPHQL_URL, {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'SITE_SUBDOMAIN': 'kleinfelters.hibid.com',
  },
  body: JSON.stringify({
    query: `query {
      lotSearch(
        input: { status: OPEN, isArchive: false }
        pageNumber: 1
        pageLength: 5
      ) {
        pagedResults {
          results {
            id
            lead
            pictures {
              fullSizeLocation
              thumbnailLocation
            }
          }
        }
      }
    }`,
  }),
});

const json = await res.json();
const results = json.data.lotSearch.pagedResults.results;
const match = results.find(r => r.id === lotId);
if (match) {
  console.log(`Found lot ${lotId}: ${match.lead}`);
  console.log(`Pictures: ${match.pictures.length}`);
} else {
  console.log(`Lot ${lotId} not in first 5 results. IDs found: ${results.map(r=>r.id).join(', ')}`);
}
