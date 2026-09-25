import { createHash } from "node:crypto";

import type { HistoricalCandleFixture } from "./historical-candles.ts";

export type CoinbaseCandleRequestMetadata = {
  venue: "Coinbase Exchange";
  symbol: string;
  granularitySeconds: number;
  requestUrl: string;
  retrievedAt: number;
  rawSha256: string;
};

/**
 * Maps an archived Coinbase candles response into closed-candle semantics.
 * Coinbase rows are [bucketStartSeconds, low, high, open, close, volume].
 */
export function adaptCoinbaseCandleResponse(
  status: number,
  rawBody: string,
  metadata: CoinbaseCandleRequestMetadata
): HistoricalCandleFixture {
  if (status < 200 || status >= 300) {
    throw new Error(`Coinbase candles request failed with status ${status}`);
  }
  if (
    metadata.venue !== "Coinbase Exchange" ||
    metadata.symbol.length === 0 ||
    !Number.isInteger(metadata.granularitySeconds) ||
    metadata.granularitySeconds <= 0 ||
    metadata.requestUrl.length === 0 ||
    !Number.isFinite(metadata.retrievedAt) ||
    !/^[a-f0-9]{64}$/i.test(metadata.rawSha256)
  ) {
    throw new Error("Coinbase candle request metadata is invalid");
  }
  const actualSha256 = createHash("sha256").update(rawBody).digest("hex");
  if (actualSha256 !== metadata.rawSha256.toLowerCase()) {
    throw new Error("Coinbase candle response checksum mismatch");
  }

  const parsed: unknown = JSON.parse(rawBody);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Coinbase candle response must be a non-empty array");
  }

  const intervalMs = metadata.granularitySeconds * 1_000;
  const candles = parsed.map((row) => {
    if (
      !Array.isArray(row) ||
      row.length < 6 ||
      !row.slice(0, 6).every((value) => Number.isFinite(value)) ||
      !Number.isInteger(row[0]) ||
      row[0] < 0 ||
      row[4] <= 0
    ) {
      throw new Error("Coinbase candle row is invalid");
    }
    return {
      // Coinbase timestamps identify bucket start; Replay ticks use close time.
      ts: row[0] * 1_000 + intervalMs,
      close: row[4]
    };
  });

  candles.sort((left, right) => left.ts - right.ts);
  for (let index = 1; index < candles.length; index++) {
    if (candles[index].ts - candles[index - 1].ts !== intervalMs) {
      throw new Error("Coinbase candle response has a duplicate or gap");
    }
  }

  return {
    symbol: metadata.symbol,
    source: `${metadata.venue} ${metadata.requestUrl} sha256:${actualSha256}`,
    provenance: "VENDOR_ARCHIVE",
    intervalMs,
    candles
  };
}
