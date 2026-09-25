import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { adaptCoinbaseCandleResponse } from "../src/coinbase-candle-adapter.ts";

const metadataBase = {
  venue: "Coinbase Exchange" as const,
  symbol: "BTC-USD",
  granularitySeconds: 60,
  requestUrl: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60",
  retrievedAt: 1_700_000_000_000
};

test("maps Coinbase fields, seconds, bucket starts, and descending rows", () => {
  const raw = JSON.stringify([
    [120, 19, 25, 20, 24, 10],
    [60, 9, 15, 10, 14, 20]
  ]);

  const fixture = adaptCoinbaseCandleResponse(200, raw, metadataFor(raw));

  assert.equal(fixture.intervalMs, 60_000);
  assert.deepEqual(fixture.candles, [
    { ts: 120_000, close: 14 },
    { ts: 180_000, close: 24 }
  ]);
});

test("rejects a non-200 Coinbase response", () => {
  assert.throws(
    () => adaptCoinbaseCandleResponse(429, "[]", metadataFor("[]")),
    /failed with status 429/
  );
});

test("rejects a gap or duplicate after ascending sort", () => {
  const gap = JSON.stringify([
    [60, 9, 15, 10, 14, 20],
    [180, 19, 25, 20, 24, 10]
  ]);
  assert.throws(
    () => adaptCoinbaseCandleResponse(200, gap, metadataFor(gap)),
    /duplicate or gap/
  );
});

test("rejects a raw response whose checksum does not match metadata", () => {
  assert.throws(
    () => adaptCoinbaseCandleResponse(200, "[[60,9,15,10,14,20]]", {
      ...metadataBase,
      rawSha256: "a".repeat(64)
    }),
    /checksum mismatch/
  );
});

function metadataFor(rawBody: string) {
  return {
    ...metadataBase,
    rawSha256: createHash("sha256").update(rawBody).digest("hex")
  };
}
