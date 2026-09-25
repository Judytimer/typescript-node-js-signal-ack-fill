# FORMAL Case #1｜Raw Artifact Acquisition Attempt

日期：2026-09-25  
结果：**BLOCKED BY EXECUTION ENVIRONMENT — NO ARTIFACT ADMITTED**

## Requested artifacts

### Fed event artifact

```text
locator:
https://www.federalreserve.gov/newsevents/pressreleases/monetary20240320a.htm

required persisted evidence:
raw response bytes
publication metadata
retrieval timestamp
source locator
SHA-256 checksum
```

### BTC-USD market artifact

```text
venue: Coinbase Exchange
symbol: BTC-USD
interval: 60 seconds
requested window: 2024-03-20T17:45:00Z through 2024-03-20T18:31:00Z
locator:
https://api.exchange.coinbase.com/products/BTC-USD/candles

required persisted evidence:
raw response bytes
venue / symbol / interval / request parameters
retrieval timestamp
source locator
SHA-256 checksum
```

The requested window is an acquisition envelope only. Candidate selection
must still obey the frozen 18:00 release boundary and exclusive 18:30 cutoff.
No post-Candidate-T0 outcome candle may be scored before the remaining
pre-reveal protocol fields are frozen.

## Attempt evidence

Both available network paths failed before source bytes were returned:

```text
web open: HTTP 401 Unauthorized from the browsing service
curl Fed locator: HTTP 403 from the configured proxy
curl Coinbase endpoint: HTTP 403 from the configured proxy
```

The 403 proxy response headers are not source artifacts and were not added to
the repository. No checksum, publication timestamp, candle, Candidate T0, or
outcome was inferred from these failures.

## Admission consequence

```text
input provenance: not established
Fed official bytes: absent
vendor candle bytes: absent
selector execution on real data: not run
Candidate T0: unset
outcome reveal: not performed
FORMAL Case #1: NOT ADMITTED
```

The next attempt must run in an environment that can reach both authoritative
locators, or receive user-supplied raw files together with their original
request/publication metadata. The bytes must be checksummed before parsing.
If either artifact cannot establish provenance, the FOMC candidate remains
rejected rather than being downgraded into a counted sample.

The Coinbase raw adapter is now ready for that response. It maps Coinbase's
`[bucketStartSeconds, low, high, open, close, volume]` rows, converts seconds to
milliseconds, changes bucket-start timestamps to bucket-end timestamps, sorts
ascending, and rejects non-2xx responses, duplicates, and gaps. It has only
been exercised with synthetic DEMO rows; no real FOMC candle was introduced or
inspected in this environment.
