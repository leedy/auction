// Check if lots belong to distinct auctions we can filter by
const GRAPHQL_URL = 'https://kleinfelters.hibid.com/graphql';
const SITE_SUBDOMAIN = 'kleinfelters.hibid.com';

// Query that includes auction details
const QUERY = `
  query LotSearch($pageNumber: Int!, $pageLength: Int!, $status: AuctionLotStatus = null) {
    lotSearch(
      input: { status: $status, isArchive: false }
      pageNumber: $pageNumber
      pageLength: $pageLength
    ) {
      pagedResults {
        totalCount
        results {
          id
          lead
          lotNumber
          lotState {
            timeLeft
            timeLeftSeconds
          }
          auction {
            id
            bidOpenDateTime
            bidCloseDateTime
            auctioneer {
              name
            }
          }
        }
      }
    }
  }
`;

async function main() {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'SITE_SUBDOMAIN': SITE_SUBDOMAIN,
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { pageNumber: 1, pageLength: 100, status: 'OPEN' },
    }),
  });

  const json = await res.json();

  if (json.errors) {
    console.log('Errors:', JSON.stringify(json.errors, null, 2));
    return;
  }

  const results = json.data.lotSearch.pagedResults.results;

  // Group by auction
  const auctions = {};
  for (const lot of results) {
    const auctionId = lot.auction?.id ?? 'unknown';
    if (!auctions[auctionId]) {
      auctions[auctionId] = {
        id: auctionId,
        bidOpen: lot.auction?.bidOpenDateTime,
        bidClose: lot.auction?.bidCloseDateTime,
        auctioneer: lot.auction?.auctioneer?.name,
        sampleLots: [],
        count: 0,
      };
    }
    auctions[auctionId].count++;
    if (auctions[auctionId].sampleLots.length < 2) {
      auctions[auctionId].sampleLots.push({
        lotNumber: lot.lotNumber,
        lead: lot.lead,
        timeLeft: lot.timeLeft,
      });
    }
  }

  console.log('--- Distinct Auctions in Current Open Lots ---\n');
  for (const a of Object.values(auctions)) {
    console.log(`  Auction ID: ${a.id}`);
    console.log(`  Auctioneer: ${a.auctioneer}`);
    console.log(`  Bid Open:   ${a.bidOpen}`);
    console.log(`  Bid Close:  ${a.bidClose}`);
    console.log(`  Lots (in sample): ${a.count}`);
    for (const lot of a.sampleLots) {
      console.log(`    → Lot #${lot.lotNumber}: ${lot.lead} (${(lot.timeLeft || '').trim()})`);
    }
    console.log('');
  }
}

main().catch(console.error);
