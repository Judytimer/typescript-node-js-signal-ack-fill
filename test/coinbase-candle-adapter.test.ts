import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  adaptCoinbaseCandleResponse,
  admitCoinbaseCandleArtifact
} from "../src/coinbase-candle-adapter.ts";

const start = "1970-01-01T00:01:00.000Z";
const end = "1970-01-01T00:04:00.000Z";
const requestUrl = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

test("admits then maps fields, seconds, bucket starts, and descending rows", () => {
  const raw = JSON.stringify([
    [120, 19, 25, 20, 24, 10],
    [60, 9, 15, 10, 14, 20]
  ]);
  const artifact = admitCoinbaseCandleArtifact(raw, metadataFor(raw));
  const fixture = adaptCoinbaseCandleResponse(artifact);

  assert.equal(fixture.provenance, "VENDOR_ARCHIVE");
  assert.deepEqual(fixture.candles, [
    { ts: 120_000, close: 14 },
    { ts: 180_000, close: 24 }
  ]);
});

test("rejects non-2xx acquisition metadata", () => {
  const raw = "[[60,9,15,10,14,20]]";
  assert.throws(
    () => admitCoinbaseCandleArtifact(raw, { ...metadataFor(raw), httpStatus: 429 }),
    /metadata is invalid/
  );
});

test("rejects URL product, granularity, or envelope mismatch", () => {
  const raw = "[[60,9,15,10,14,20]]";
  const base = metadataFor(raw);
  for (const requestUrl of [
    base.requestUrl.replace("BTC-USD", "ETH-USD"),
    base.requestUrl.replace("granularity=60", "granularity=300"),
    base.requestUrl.replace(encodeURIComponent(start), encodeURIComponent("1970-01-01T00:00:00.000Z"))
  ]) {
    assert.throws(
      () => admitCoinbaseCandleArtifact(raw, { ...base, requestUrl }),
      /URL does not match metadata/
    );
  }
});

test("rejects envelope, OHLC, gap, and checksum violations", () => {
  const outside = "[[240,9,15,10,14,20]]";
  assert.throws(
    () => admitCoinbaseCandleArtifact(outside, metadataFor(outside)),
    /envelope or OHLC/
  );
  const invalidOhlc = "[[60,9,15,8,14,20]]";
  assert.throws(
    () => admitCoinbaseCandleArtifact(invalidOhlc, metadataFor(invalidOhlc)),
    /envelope or OHLC/
  );
  const gap = JSON.stringify([[60, 9, 15, 10, 14, 20], [180, 19, 25, 20, 24, 10]]);
  const admittedGap = admitCoinbaseCandleArtifact(gap, metadataFor(gap));
  assert.throws(() => adaptCoinbaseCandleResponse(admittedGap), /duplicate or gap/);
  assert.throws(
    () => admitCoinbaseCandleArtifact("[[60,9,15,10,14,20]]", {
      ...metadataFor("ignored"),
      rawSha256: "a".repeat(64)
    }),
    /checksum mismatch/
  );
});

function metadataFor(rawBody: string) {
  return {
    venue: "Coinbase Exchange" as const,
    product: "BTC-USD",
    symbol: "BTC-USD",
    granularitySeconds: 60,
    start,
    end,
    requestUrl,
    retrievedAt: 1_700_000_000_000,
    curlExitCode: 0 as const,
    httpStatus: 200,
    rawSha256: createHash("sha256").update(rawBody).digest("hex")
  };
}
