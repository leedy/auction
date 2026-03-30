// HiBid Auction Lot Scraper
// Fetches lots from any HiBid auction house via GraphQL API
// Zero external dependencies — uses Node built-in fetch

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
            eventName
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
 * Execute a GraphQL query against a HiBid auction house.
 */
async function queryHiBid(query, variables, subdomain) {
  const url = `https://${subdomain}/graphql`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'SITE_SUBDOMAIN': subdomain,
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
 * Fetch a single page of open lots from a specific auction house.
 */
async function fetchPage(pageNumber, subdomain) {
  const data = await queryHiBid(LOT_SEARCH_QUERY, {
    pageNumber,
    pageLength: PAGE_SIZE,
    status: 'OPEN',
    sortOrder: 'SALE_ORDER',
    isArchive: false,
  }, subdomain);

  return data.lotSearch.pagedResults;
}

/**
 * Normalize a raw lot from the API into a clean object.
 */
function normalizeLot(raw, subdomain) {
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
    auctionName: raw.auction?.eventName ?? null,
    bidOpenDateTime: raw.auction?.bidOpenDateTime ?? null,
    bidCloseDateTime: raw.auction?.bidCloseDateTime ?? null,
    url: `https://${subdomain}/lot/${raw.id}`,
  };
}

/**
 * Check if a date string falls on a specific day of the week.
 */
function isDayOfWeek(dateStr, dayName, timezone) {
  const d = new Date(dateStr);
  const actualDay = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  return actualDay === dayName;
}

/**
 * Find auctions matching the configured schedule from a set of lots.
 * Groups lots by auctionId.
 * - If auctionDay is a specific day, returns the soonest-closing auction on that day.
 * - If auctionDay is "Any", filters out webcast/live auctions (timeLeftSeconds=0)
 *   and returns all online auctions merged together.
 */
function findScheduledAuction(lots, auctionDay, timezone) {
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
        // Track if this auction has real countdowns (online) vs webcast
        hasCountdown: false,
      };
    }
    auctions[aid].lots.push(lot);
    if (lot.timeLeftSeconds > 0) {
      auctions[aid].hasCountdown = true;
    }
  }

  let matching;
  if (auctionDay === 'Any') {
    // Return all online auctions (those with real countdowns, not webcast)
    matching = Object.values(auctions).filter((a) => a.hasCountdown);
  } else {
    // Find auctions that close on the configured day
    matching = Object.values(auctions).filter(
      (a) => a.bidCloseDateTime && isDayOfWeek(a.bidCloseDateTime, auctionDay, timezone)
    );
  }

  if (matching.length === 0) return null;

  // Sort by close date (soonest first)
  matching.sort(
    (a, b) => new Date(a.bidCloseDateTime) - new Date(b.bidCloseDateTime)
  );

  // For "Any", merge all matching auctions into one result
  if (auctionDay === 'Any' && matching.length > 1) {
    const merged = {
      auctionId: matching[0].auctionId,
      bidOpenDateTime: matching[0].bidOpenDateTime,
      bidCloseDateTime: matching[0].bidCloseDateTime,
      lots: matching.flatMap((a) => a.lots),
    };
    return merged;
  }

  return matching[0];
}

/**
 * Fetch all open lots from an auction house, paginating automatically.
 */
async function fetchAllOpenLots(subdomain) {
  const allLots = [];
  const errors = [];
  let totalCount = 0;
  let totalPages = 1;

  try {
    const firstPage = await fetchPage(1, subdomain);
    totalCount = firstPage.totalCount;
    totalPages = Math.ceil(totalCount / PAGE_SIZE);
    allLots.push(...firstPage.results);
    console.error(`[scraper] Page 1/${totalPages} — ${firstPage.results.length} lots (${totalCount} total open)`);
  } catch (err) {
    console.error(`[scraper] Failed to fetch page 1: ${err.message}`);
    return { lots: [], totalCount: 0, pages: 0, errors: [err.message] };
  }

  if (totalPages > 1) {
    const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const results = await Promise.allSettled(pageNumbers.map((p) => fetchPage(p, subdomain)));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const pageNum = pageNumbers[i];
      if (result.status === 'fulfilled') {
        allLots.push(...result.value.results);
        console.error(`[scraper] Page ${pageNum}/${totalPages} — ${result.value.results.length} lots`);
      } else {
        console.error(`[scraper] Failed to fetch page ${pageNum}: ${result.reason.message}`);
        errors.push(`Page ${pageNum}: ${result.reason.message}`);
      }
    }
  }

  const lots = allLots.map((raw) => normalizeLot(raw, subdomain));
  return { lots, totalCount, pages: totalPages, errors };
}

/**
 * Fetch available auctions from an auction house.
 * Returns auction-level metadata without storing lot data.
 */
export async function fetchAvailableAuctions(subdomain) {
  console.error(`[scraper] Fetching available auctions from ${subdomain}...`);
  const { lots, errors } = await fetchAllOpenLots(subdomain);

  // Group by auctionId
  const auctions = {};
  for (const lot of lots) {
    const aid = lot.auctionId;
    if (!aid) continue;
    if (!auctions[aid]) {
      auctions[aid] = {
        auctionId: aid,
        name: lot.auctionName || null,
        bidOpenDateTime: lot.bidOpenDateTime,
        bidCloseDateTime: lot.bidCloseDateTime,
        lotCount: 0,
        isOnline: false,
      };
    }
    auctions[aid].lotCount++;
    if (lot.timeLeftSeconds > 0) {
      auctions[aid].isOnline = true;
    }
  }

  const result = Object.values(auctions).sort(
    (a, b) => new Date(a.bidCloseDateTime) - new Date(b.bidCloseDateTime)
  );
  console.error(`[scraper] Found ${result.length} auction(s): ${result.map((a) => `${a.name} (${a.lotCount} lots, ${a.isOnline ? 'online' : 'webcast'})`).join(', ')}`);
  return { auctions: result, errors };
}

/**
 * Fetch all lots for a specific auction by HiBid auction ID.
 */
export async function fetchAuctionLots(auctionId, subdomain) {
  const fetchedAt = new Date().toISOString();
  console.error(`[scraper] Fetching lots for auction ${auctionId} from ${subdomain}...`);

  const AUCTION_QUERY = `
    query LotSearch($auctionId: Int, $pageNumber: Int!, $pageLength: Int!, $status: AuctionLotStatus = null) {
      lotSearch(
        input: { auctionId: $auctionId, status: $status }
        pageNumber: $pageNumber
        pageLength: $pageLength
      ) {
        pagedResults {
          pageLength pageNumber totalCount
          results {
            id itemId lead lotNumber description estimate quantity
            featuredPicture { fullSizeLocation thumbnailLocation }
            lotState { bidCount highBid minBid buyNow status timeLeft timeLeftSeconds isClosed reserveSatisfied }
            auction { id eventName bidOpenDateTime bidCloseDateTime auctioneer { name } currencyAbbreviation }
          }
        }
      }
    }
  `;

  const allResults = [];
  const errors = [];
  let totalPages = 1;

  try {
    const firstPage = await queryHiBid(AUCTION_QUERY, {
      auctionId, pageNumber: 1, pageLength: PAGE_SIZE, status: 'OPEN',
    }, subdomain);
    const pr = firstPage.lotSearch.pagedResults;
    totalPages = Math.ceil(pr.totalCount / PAGE_SIZE);
    allResults.push(...pr.results);
    console.error(`[scraper] Auction ${auctionId} page 1/${totalPages} — ${pr.results.length} lots (${pr.totalCount} total)`);
  } catch (err) {
    console.error(`[scraper] Failed to fetch auction ${auctionId} page 1: ${err.message}`);
    return { lots: [], auctionId, fetchedAt, errors: [err.message] };
  }

  if (totalPages > 1) {
    const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const results = await Promise.allSettled(
      pageNumbers.map((p) => queryHiBid(AUCTION_QUERY, {
        auctionId, pageNumber: p, pageLength: PAGE_SIZE, status: 'OPEN',
      }, subdomain))
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        allResults.push(...results[i].value.lotSearch.pagedResults.results);
      } else {
        errors.push(`Page ${pageNumbers[i]}: ${results[i].reason.message}`);
      }
    }
  }

  const lots = allResults.map((raw) => normalizeLot(raw, subdomain));
  const auctionName = lots[0]?.auctionName || null;
  console.error(`[scraper] Fetched ${lots.length} lots for auction ${auctionId} ("${auctionName}")`);

  return { lots, auctionId, auctionName, fetchedAt, errors };
}

/**
 * Fetch bid/price data for an auction by auctionId.
 * Tries isArchive=true first for final prices; falls back to isArchive=false for current bids.
 */
export async function fetchFinalPrices(auctionId, subdomain) {
  const fetchedAt = new Date().toISOString();
  console.error(`[scraper] Fetching final prices for auction ${auctionId} from ${subdomain}...`);

  const PRICE_QUERY = `
    query LotSearch($auctionId: Int, $pageNumber: Int!, $pageLength: Int!, $isArchive: Boolean = false) {
      lotSearch(
        input: { auctionId: $auctionId, isArchive: $isArchive }
        pageNumber: $pageNumber
        pageLength: $pageLength
      ) {
        pagedResults {
          pageLength
          pageNumber
          totalCount
          results {
            id
            lotState {
              highBid
              bidCount
              status
              isClosed
              priceRealized
              quantitySold
            }
          }
        }
      }
    }
  `;

  const allResults = [];
  const errors = [];
  let totalPages = 1;

  try {
    const firstPage = await queryHiBid(PRICE_QUERY, {
      auctionId,
      pageNumber: 1,
      pageLength: PAGE_SIZE,
      isArchive: true,
    }, subdomain);
    const pr = firstPage.lotSearch.pagedResults;
    totalPages = Math.ceil(pr.totalCount / PAGE_SIZE);
    allResults.push(...pr.results);
    console.error(`[scraper] Price page 1/${totalPages} — ${pr.results.length} lots (${pr.totalCount} total)`);
  } catch (err) {
    console.error(`[scraper] Failed to fetch price page 1: ${err.message}`);
    return { lots: [], auctionId, fetchedAt, errors: [err.message] };
  }

  if (totalPages > 1) {
    const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const results = await Promise.allSettled(
      pageNumbers.map((p) =>
        queryHiBid(PRICE_QUERY, { auctionId, pageNumber: p, pageLength: PAGE_SIZE, isArchive: true }, subdomain)
      )
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        allResults.push(...results[i].value.lotSearch.pagedResults.results);
      } else {
        errors.push(`Page ${pageNumbers[i]}: ${results[i].reason.message}`);
      }
    }
  }

  const lots = allResults.map((r) => ({
    lotId: r.id,
    priceRealized: r.lotState?.priceRealized ?? null,
    quantitySold: r.lotState?.quantitySold ?? null,
    highBid: r.lotState?.highBid ?? 0,
    bidCount: r.lotState?.bidCount ?? 0,
    isClosed: r.lotState?.isClosed ?? true,
    status: r.lotState?.status ?? 'CLOSED',
  }));

  const withPrices = lots.filter((l) => l.priceRealized != null && l.priceRealized > 0);
  console.error(`[scraper] Got ${lots.length} lots, ${withPrices.length} with prices`);

  // If archive returned no lots or no final prices, try current (non-archive) bids
  if (lots.length === 0 || withPrices.length === 0) {
    console.error(`[scraper] No final prices in archive, fetching current bids for auction ${auctionId}...`);
    return fetchCurrentBids(auctionId, subdomain);
  }

  return { lots, auctionId, fetchedAt, errors, source: 'archive' };
}

/**
 * Fetch current bid data for a live auction (isArchive=false).
 */
async function fetchCurrentBids(auctionId, subdomain) {
  const fetchedAt = new Date().toISOString();

  const BID_QUERY = `
    query LotSearch($auctionId: Int, $pageNumber: Int!, $pageLength: Int!, $isArchive: Boolean = false) {
      lotSearch(
        input: { auctionId: $auctionId, isArchive: $isArchive }
        pageNumber: $pageNumber
        pageLength: $pageLength
      ) {
        pagedResults {
          pageLength
          pageNumber
          totalCount
          results {
            id
            lotState {
              highBid
              bidCount
              status
              isClosed
              priceRealized
              quantitySold
            }
          }
        }
      }
    }
  `;

  const allResults = [];
  const errors = [];
  let totalPages = 1;

  try {
    const firstPage = await queryHiBid(BID_QUERY, {
      auctionId,
      pageNumber: 1,
      pageLength: PAGE_SIZE,
      isArchive: false,
    }, subdomain);
    const pr = firstPage.lotSearch.pagedResults;
    totalPages = Math.ceil(pr.totalCount / PAGE_SIZE);
    allResults.push(...pr.results);
    console.error(`[scraper] Bid page 1/${totalPages} — ${pr.results.length} lots (${pr.totalCount} total)`);
  } catch (err) {
    console.error(`[scraper] Failed to fetch bid page 1: ${err.message}`);
    return { lots: [], auctionId, fetchedAt, errors: [err.message], source: 'current' };
  }

  if (totalPages > 1) {
    const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const results = await Promise.allSettled(
      pageNumbers.map((p) =>
        queryHiBid(BID_QUERY, { auctionId, pageNumber: p, pageLength: PAGE_SIZE, isArchive: false }, subdomain)
      )
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        allResults.push(...results[i].value.lotSearch.pagedResults.results);
      } else {
        errors.push(`Page ${pageNumbers[i]}: ${results[i].reason.message}`);
      }
    }
  }

  const lots = allResults.map((r) => ({
    lotId: r.id,
    priceRealized: r.lotState?.priceRealized ?? null,
    quantitySold: r.lotState?.quantitySold ?? null,
    highBid: r.lotState?.highBid ?? 0,
    bidCount: r.lotState?.bidCount ?? 0,
    isClosed: r.lotState?.isClosed ?? false,
    status: r.lotState?.status ?? 'OPEN',
  }));

  const withBids = lots.filter((l) => l.highBid > 0);
  console.error(`[scraper] Got ${lots.length} current lots, ${withBids.length} with bids`);

  return { lots, auctionId, fetchedAt, errors, source: 'current' };
}

/**
 * Fetch the current auction for an auction house.
 * @param {Object} auctionHouse - { subdomain, auctionDay, timezone }
 */
export async function fetchCurrentAuction(auctionHouse) {
  const { subdomain, auctionDay, timezone } = auctionHouse;
  const fetchedAt = new Date().toISOString();
  console.error(`[scraper] Fetching open lots from ${subdomain}...`);

  const { lots, totalCount, pages, errors } = await fetchAllOpenLots(subdomain);

  if (lots.length === 0) {
    console.error('[scraper] No open lots found.');
    return { lots: [], auctionId: null, bidCloseDateTime: null, fetchedAt, errors };
  }

  // Identify the scheduled auction
  const scheduled = findScheduledAuction(lots, auctionDay, timezone);

  if (!scheduled) {
    const auctionIds = [...new Set(lots.map((l) => l.auctionId))];
    const closeDates = [...new Set(lots.map((l) => l.bidCloseDateTime))];
    console.error(`[scraper] No ${auctionDay} auction found among ${lots.length} open lots.`);
    console.error(`[scraper] Found auction(s): ${auctionIds.join(', ')}`);
    console.error(`[scraper] Close dates: ${closeDates.join(', ')}`);
    return { lots: [], auctionId: null, bidCloseDateTime: null, fetchedAt, errors };
  }

  console.error(`[scraper] ${auctionDay} auction found: ID ${scheduled.auctionId}`);
  console.error(`[scraper]   Opens:  ${scheduled.bidOpenDateTime}`);
  console.error(`[scraper]   Closes: ${scheduled.bidCloseDateTime}`);
  console.error(`[scraper]   Lots:   ${scheduled.lots.length}`);

  return {
    lots: scheduled.lots,
    auctionId: scheduled.auctionId,
    bidOpenDateTime: scheduled.bidOpenDateTime,
    bidCloseDateTime: scheduled.bidCloseDateTime,
    fetchedAt,
    errors,
  };
}
