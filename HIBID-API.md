# HiBid GraphQL API Reference

Reverse-engineered from the HiBid Angular PWA bundle (v1.17.6) on 2026-02-19.

## Endpoint

```
POST https://kleinfelters.hibid.com/graphql
```

## Required Headers

```
Accept: application/json
Content-Type: application/json
SITE_SUBDOMAIN: kleinfelters.hibid.com
```

No authentication is required for reading public lot data.

## How It Works

HiBid runs an Angular PWA served from `cdn.hibid.com/cdn/pwa/`. The initial HTML is just a shell with a `window.hibid_site` config object and an `<app-root>` tag. All auction data is loaded via Apollo GraphQL calls to `/graphql` on the same subdomain.

The GraphQL endpoint URL is constructed as:
```
https://{hostname}/graphql
```
where `{hostname}` is the subdomain (e.g. `kleinfelters.hibid.com`). The `SITE_SUBDOMAIN` header scopes the query to that auction house.

## Primary Query: lotSearch

### Full Query (all supported variables)

```graphql
query LotSearch(
  $auctionId: Int = null
  $pageNumber: Int!
  $pageLength: Int!
  $category: CategoryId = null
  $searchText: String = null
  $zip: String = null
  $miles: Int = null
  $shippingOffered: Boolean = false
  $countryName: String = null
  $status: AuctionLotStatus = null
  $sortOrder: EventItemSortOrder = null
  $filter: AuctionLotFilter = null
  $isArchive: Boolean = false
  $dateStart: DateTime
  $dateEnd: DateTime
  $countAsView: Boolean = true
  $hideGoogle: Boolean = false
) {
  lotSearch(
    input: {
      auctionId: $auctionId
      category: $category
      searchText: $searchText
      zip: $zip
      miles: $miles
      shippingOffered: $shippingOffered
      countryName: $countryName
      status: $status
      sortOrder: $sortOrder
      filter: $filter
      isArchive: $isArchive
      dateStart: $dateStart
      dateEnd: $dateEnd
      countAsView: $countAsView
      hideGoogle: $hideGoogle
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
```

### Enum Values

**AuctionLotStatus:** `OPEN`, `TOP`

**EventItemSortOrder:** `SALE_ORDER`

### Pagination

- `pageNumber`: 1-based page index
- `pageLength`: items per page (tested up to 100)
- Response includes `totalCount` and `filteredCount` for calculating total pages

## Lot Data Fields

| Field | Type | Description |
|---|---|---|
| `id` | Int | Unique lot ID (e.g. `286460681`) |
| `itemId` | Int | Item identifier |
| `lead` | String | **Primary title/headline** — this is the main listing text |
| `description` | String | Detailed description (can be empty) |
| `lotNumber` | String | Lot number within auction (e.g. "1", "1a", "2000") |
| `estimate` | String | Estimated value |
| `quantity` | Int | Number of items in lot |
| `featuredPicture.fullSizeLocation` | String | Full-size image URL on cdn.hibid.com |
| `featuredPicture.thumbnailLocation` | String | Thumbnail image URL |
| `lotState.highBid` | Float | Current highest bid |
| `lotState.bidCount` | Int | Number of bids placed |
| `lotState.minBid` | Float | Minimum next bid |
| `lotState.buyNow` | Float | Buy-now price (if available) |
| `lotState.status` | String | e.g. `OPEN` |
| `lotState.timeLeft` | String | Human-readable time remaining (e.g. "2h 53m", "9d 2h 53m") |
| `lotState.timeLeftSeconds` | Int | Seconds remaining |
| `lotState.isClosed` | Boolean | Whether bidding has ended |
| `lotState.reserveSatisfied` | Boolean | Whether reserve price is met |
| `auction.auctioneer.name` | String | Auction house name |
| `auction.currencyAbbreviation` | String | Currency code |

## Other Queries Found in Bundle

### TopLotsSearch
Fetches featured/top lots. Uses `input: {status: TOP}`.

### LiveCatalogLotsPage
Fetches lots for a specific live auction. Takes `$auctionId` and uses `status: OPEN, sortOrder: SALE_ORDER`.

### SitemapQuery
Returns category tree: `sitemap { categories { id, categoryName, fullCategory, uRLPath, children { ... } } }`

### LotSearchPrint
Lightweight version returning only: `id`, `description`, `estimate`, `lead`, `lotNumber`, `quantity`, `ringNumber`, plus thumbnail.

## Example: Minimal Fetch (Node.js, zero dependencies)

```javascript
const result = await fetch('https://kleinfelters.hibid.com/graphql', {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'SITE_SUBDOMAIN': 'kleinfelters.hibid.com',
  },
  body: JSON.stringify({
    query: `query { lotSearch(input: { status: OPEN }, pageNumber: 1, pageLength: 10) {
      pagedResults { totalCount results { id lead description lotNumber lotState { highBid bidCount timeLeft } } }
    } }`,
  }),
});
const data = await result.json();
console.log(data.data.lotSearch.pagedResults);
```

## Notes

- Discovered by analyzing the minified Angular bundle at `cdn.hibid.com/cdn/pwa/1.17.6/main.*.js`
- The older HiBid rendering (pre-PWA) embedded lot data as `var lotModels = [...]` in script tags — this no longer applies to Kleinfelter's
- The `SITE_SUBDOMAIN` header is what scopes queries to a specific auction house
- Tested 2026-02-19: 877 open lots returned successfully
- No rate limiting observed during testing, but be respectful with request frequency
