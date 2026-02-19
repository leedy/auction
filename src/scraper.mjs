// HiBid Auction Lot Scraper
// Fetches lots from Kleinfelter's weekly Thursday auction via GraphQL API
// Zero external dependencies — uses Node built-in fetch

const GRAPHQL_URL = 'https://kleinfelters.hibid.com/graphql';
const SITE_SUBDOMAIN = 'kleinfelters.hibid.com';
const PAGE_SIZE = 100;

const LOT_SEARCH_QUERY = `
  query LotSearch(
    $pageNumber: Int!,
    $pageLength: Int!,
    $status: AuctionLotStatus = null,
    $sortOrder: EventItemSortOrder = null,
    $isArchive: Boolean = false
  ) {
    lotSearch(
      input: {
        status: $status,
        sortOrder: $sortOrder,
        isArchive: $isArchive
      }
      pageNumber: $pageNumber
      pageLength: $pageLength
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
            id
            bidOpenDateTime
            bidCloseDateTime
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

/**
 * Execute a GraphQL query against the HiBid API.
 */
async function queryHiBid(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'SITE_SUBDOMAIN': SITE_SUBDOMAIN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HiBid API error (HTTP ${res.status}): ${text.substring(0, 300)}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(`HiBid GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

/**
 * Fetch a single page of open lots.
 */
async function fetchPage(pageNumber) {
  const data = await queryHiBid(LOT_SEARCH_QUERY, {
    pageNumber,
    pageLength: PAGE_SIZE,
    status: 'OPEN',
    sortOrder: 'SALE_ORDER',
    isArchive: false,
  });

  return data.lotSearch.pagedResults;
}

/**
 * Normalize a raw lot from the API into a clean object.
 */
function normalizeLot(raw) {
  return {
    lotId: raw.id,
    itemId: raw.itemId,
    lotNumber: raw.lotNumber,
    title: raw.lead,
    description: raw.description || '',
    estimate: raw.estimate || '',
    quantity: raw.quantity,
    image: raw.featuredPicture?.thumbnailLocation || null,
    imageFull: raw.featuredPicture?.fullSizeLocation || null,
    highBid: raw.lotState?.highBid ?? 0,
    bidCount: raw.lotState?.bidCount ?? 0,
    minBid: raw.lotState?.minBid ?? 0,
    buyNow: raw.lotState?.buyNow ?? null,
    status: raw.lotState?.status ?? 'UNKNOWN',
    timeLeft: raw.lotState?.timeLeft ?? '',
    timeLeftSeconds: raw.lotState?.timeLeftSeconds ?? 0,
    isClosed: raw.lotState?.isClosed ?? false,
    reserveSatisfied: raw.lotState?.reserveSatisfied ?? null,
    auctionId: raw.auction?.id ?? null,
    bidOpenDateTime: raw.auction?.bidOpenDateTime ?? null,
    bidCloseDateTime: raw.auction?.bidCloseDateTime ?? null,
    url: `https://kleinfelters.hibid.com/lot/${raw.id}`,
  };
}

/**
 * Check if a date string falls on a Thursday.
 */
function isThursday(dateStr) {
  const d = new Date(dateStr);
  return d.getDay() === 4; // 0=Sun, 4=Thu
}

/**
 * Find the Thursday auction from a set of lots.
 * Groups lots by auctionId and returns the one whose bidCloseDateTime is a Thursday.
 * If multiple match, picks the one closing soonest.
 * If none match, returns null.
 */
function findThursdayAuction(lots) {
  // Group by auctionId
  const auctions = {};
  for (const lot of lots) {
    const aid = lot.auctionId;
    if (!aid) continue;
    if (!auctions[aid]) {
      auctions[aid] = {
        auctionId: aid,
        bidOpenDateTime: lot.bidOpenDateTime,
        bidCloseDateTime: lot.bidCloseDateTime,
        lots: [],
      };
    }
    auctions[aid].lots.push(lot);
  }

  // Find auctions that close on a Thursday
  const thursdayAuctions = Object.values(auctions).filter(
    (a) => a.bidCloseDateTime && isThursday(a.bidCloseDateTime)
  );

  if (thursdayAuctions.length === 0) return null;

  // Pick the one closing soonest
  thursdayAuctions.sort(
    (a, b) => new Date(a.bidCloseDateTime) - new Date(b.bidCloseDateTime)
  );

  return thursdayAuctions[0];
}

/**
 * Fetch all open lots, paginating automatically.
 * Returns all lots with auction metadata.
 */
async function fetchAllOpenLots() {
  const allLots = [];
  const errors = [];
  let page = 1;
  let totalCount = 0;
  let totalPages = 1;

  // Fetch first page to get total count
  try {
    const firstPage = await fetchPage(1);
    totalCount = firstPage.totalCount;
    totalPages = Math.ceil(totalCount / PAGE_SIZE);
    allLots.push(...firstPage.results);
    console.error(`[scraper] Page 1/${totalPages} — ${firstPage.results.length} lots (${totalCount} total open)`);
  } catch (err) {
    console.error(`[scraper] Failed to fetch page 1: ${err.message}`);
    return { lots: [], totalCount: 0, pages: 0, errors: [err.message] };
  }

  // Fetch remaining pages
  for (page = 2; page <= totalPages; page++) {
    try {
      const pageData = await fetchPage(page);
      allLots.push(...pageData.results);
      console.error(`[scraper] Page ${page}/${totalPages} — ${pageData.results.length} lots`);
    } catch (err) {
      console.error(`[scraper] Failed to fetch page ${page}: ${err.message}`);
      errors.push(`Page ${page}: ${err.message}`);
    }
  }

  const lots = allLots.map(normalizeLot);
  return { lots, totalCount, pages: totalPages, errors };
}

/**
 * Main entry point: fetch this week's Thursday auction lots.
 * Returns { lots, auctionId, bidCloseDateTime, fetchedAt, errors }
 * Returns empty lots array if no Thursday auction is found.
 */
export async function fetchThursdayAuction() {
  const fetchedAt = new Date().toISOString();
  console.error(`[scraper] Fetching open lots from ${SITE_SUBDOMAIN}...`);

  const { lots, totalCount, pages, errors } = await fetchAllOpenLots();

  if (lots.length === 0) {
    console.error('[scraper] No open lots found.');
    return { lots: [], auctionId: null, bidCloseDateTime: null, fetchedAt, errors };
  }

  // Identify the Thursday auction
  const thursday = findThursdayAuction(lots);

  if (!thursday) {
    // No Thursday auction currently open — list what we did find
    const auctionIds = [...new Set(lots.map((l) => l.auctionId))];
    const closeDates = [...new Set(lots.map((l) => l.bidCloseDateTime))];
    console.error(`[scraper] No Thursday auction found among ${lots.length} open lots.`);
    console.error(`[scraper] Found auction(s): ${auctionIds.join(', ')}`);
    console.error(`[scraper] Close dates: ${closeDates.join(', ')}`);
    return { lots: [], auctionId: null, bidCloseDateTime: null, fetchedAt, errors };
  }

  console.error(`[scraper] Thursday auction found: ID ${thursday.auctionId}`);
  console.error(`[scraper]   Opens:  ${thursday.bidOpenDateTime}`);
  console.error(`[scraper]   Closes: ${thursday.bidCloseDateTime}`);
  console.error(`[scraper]   Lots:   ${thursday.lots.length}`);

  return {
    lots: thursday.lots,
    auctionId: thursday.auctionId,
    bidOpenDateTime: thursday.bidOpenDateTime,
    bidCloseDateTime: thursday.bidCloseDateTime,
    fetchedAt,
    errors,
  };
}
