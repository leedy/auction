// Test HiBid GraphQL API - zero dependencies
// Endpoint: https://kleinfelters.hibid.com/graphql (Apollo/Angular PWA)

const GRAPHQL_URL = 'https://kleinfelters.hibid.com/graphql';
const HOSTNAME = 'kleinfelters.hibid.com';

const LOT_SEARCH_QUERY = `
  query LotSearch(
    $auctionId: Int = null,
    $pageNumber: Int!,
    $pageLength: Int!,
    $status: AuctionLotStatus = null,
    $sortOrder: EventItemSortOrder = null,
    $isArchive: Boolean = false
  ) {
    lotSearch(
      input: {
        auctionId: $auctionId,
        status: $status,
        sortOrder: $sortOrder,
        isArchive: $isArchive
      }
      pageNumber: $pageNumber
      pageLength: $pageLength
      sortDirection: DESC
    ) {
      pagedResults {
        pageLength
        pageNumber
        totalCount
        filteredCount
        results {
          id
          itemId
          lead
          lotNumber
          description
          estimate
          quantity
          featuredPicture {
            fullSizeLocation
            thumbnailLocation
          }
          lotState {
            bidCount
            highBid
            minBid
            buyNow
            status
            timeLeft
            timeLeftSeconds
            isClosed
            reserveSatisfied
          }
          auction {
            auctioneer {
              name
            }
            currencyAbbreviation
          }
        }
      }
    }
  }
`;

async function queryHiBid(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'SITE_SUBDOMAIN': HOSTNAME,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 500)}`);
  }

  return res.json();
}

async function main() {
  console.log('=== HiBid GraphQL API Test ===\n');
  console.log(`Endpoint: ${GRAPHQL_URL}`);
  console.log(`Subdomain header: ${HOSTNAME}\n`);

  // Test 1: Fetch open lots
  console.log('--- Test 1: Fetch open lots (page 1, 5 items) ---\n');
  try {
    const result = await queryHiBid(LOT_SEARCH_QUERY, {
      pageNumber: 1,
      pageLength: 5,
      status: 'OPEN',
      sortOrder: 'SALE_ORDER',
      isArchive: false,
    });

    if (result.errors) {
      console.log('GraphQL errors:', JSON.stringify(result.errors, null, 2));
      return;
    }

    const paged = result.data.lotSearch.pagedResults;
    console.log(`Total lots: ${paged.totalCount}`);
    console.log(`Filtered: ${paged.filteredCount}`);
    console.log(`Page: ${paged.pageNumber}, Page size: ${paged.pageLength}`);
    console.log(`Results returned: ${paged.results.length}\n`);

    for (const lot of paged.results) {
      console.log(`  Lot #${lot.lotNumber} [ID: ${lot.id}]`);
      console.log(`    Lead: ${lot.lead}`);
      console.log(`    Description: ${(lot.description || '').substring(0, 120)}${lot.description?.length > 120 ? '...' : ''}`);
      console.log(`    High bid: $${lot.lotState?.highBid ?? 'n/a'} (${lot.lotState?.bidCount ?? 0} bids)`);
      console.log(`    Min bid: $${lot.lotState?.minBid ?? 'n/a'}`);
      console.log(`    Status: ${lot.lotState?.status}  Time left: ${lot.lotState?.timeLeft}`);
      console.log(`    Image: ${lot.featuredPicture?.thumbnailLocation ?? 'none'}`);
      console.log('');
    }
  } catch (err) {
    console.log(`Error: ${err.message}\n`);
  }

  // Test 2: Check if there are any current auctions at all
  console.log('--- Test 2: Fetch ALL lots (open + not yet open) ---\n');
  try {
    const result = await queryHiBid(LOT_SEARCH_QUERY, {
      pageNumber: 1,
      pageLength: 3,
      isArchive: false,
    });

    if (result.errors) {
      console.log('GraphQL errors:', JSON.stringify(result.errors, null, 2));
      return;
    }

    const paged = result.data.lotSearch.pagedResults;
    console.log(`Total lots (all statuses): ${paged.totalCount}`);
    console.log(`Results returned: ${paged.results.length}\n`);

    for (const lot of paged.results) {
      console.log(`  Lot #${lot.lotNumber}: ${lot.lead}`);
      console.log(`    Status: ${lot.lotState?.status}  Bids: ${lot.lotState?.bidCount}`);
      console.log('');
    }
  } catch (err) {
    console.log(`Error: ${err.message}\n`);
  }

  console.log('=== Done ===');
}

main().catch(console.error);
