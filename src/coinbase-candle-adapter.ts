import { createHash } from "node:crypto";

import type { HistoricalCandleFixture } from "./historical-candles.ts";

export type CoinbaseCandleRequestMetadata = {
  venue: "Coinbase Exchange";
  product: string;
  symbol: string;
  granularitySeconds: number;
  start: string;
  end: string;
  requestUrl: string;
  retrievedAt: number;
  curlExitCode: 0;
  httpStatus: number;
  rawSha256: string;
};

const admittedArtifact = Symbol("admittedCoinbaseArtifact");

export type AdmittedCoinbaseCandleArtifact = {
  readonly rawBody: string;
  readonly metadata: CoinbaseCandleRequestMetadata;
  readonly rows: readonly CoinbaseRow[];
  readonly [admittedArtifact]: true;
};

type CoinbaseRow = readonly [number, number, number, number, number, number];

/** Owns the VENDOR_ARCHIVE admission decision before mapping can occur. */
export function admitCoinbaseCandleArtifact(
  rawBody: string,
  metadata: CoinbaseCandleRequestMetadata
): AdmittedCoinbaseCandleArtifact {
  validateMetadata(metadata);
  const actualSha256 = createHash("sha256").update(rawBody).digest("hex");
  if (actualSha256 !== metadata.rawSha256.toLowerCase()) {
    throw new Error("Coinbase candle response checksum mismatch");
  }

  const startMs = Date.parse(metadata.start);
  const endMs = Date.parse(metadata.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new Error("Coinbase request envelope is invalid");
  }

  const parsed: unknown = JSON.parse(rawBody);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Coinbase candle response must be a non-empty array");
  }
  const rows = parsed.map((row) => validateRow(row, startMs, endMs));
  return { rawBody, metadata, rows, [admittedArtifact]: true };
}

/** Maps an admitted Coinbase artifact into ascending closed-candle semantics. */
export function adaptCoinbaseCandleResponse(
  artifact: AdmittedCoinbaseCandleArtifact
): HistoricalCandleFixture {
  if (artifact[admittedArtifact] !== true) {
    throw new Error("Coinbase artifact has not passed admission");
  }
  const { metadata } = artifact;
  const intervalMs = metadata.granularitySeconds * 1_000;
  const candles = artifact.rows.map((row) => ({
    // Coinbase timestamps identify bucket start; Replay ticks use close time.
    ts: row[0] * 1_000 + intervalMs,
    close: row[4]
  }));

  candles.sort((left, right) => left.ts - right.ts);
  for (let index = 1; index < candles.length; index++) {
    if (candles[index].ts - candles[index - 1].ts !== intervalMs) {
      throw new Error("Coinbase candle response has a duplicate or gap");
    }
  }

  return {
    symbol: metadata.symbol,
    source: `${metadata.venue} ${metadata.requestUrl} sha256:${metadata.rawSha256}`,
    provenance: "VENDOR_ARCHIVE",
    intervalMs,
    candles
  };
}

function validateMetadata(metadata: CoinbaseCandleRequestMetadata): void {
  if (
    metadata.venue !== "Coinbase Exchange" ||
    metadata.product.length === 0 ||
    metadata.symbol !== metadata.product ||
    !Number.isInteger(metadata.granularitySeconds) ||
    metadata.granularitySeconds <= 0 ||
    !Number.isFinite(metadata.retrievedAt) ||
    metadata.curlExitCode !== 0 ||
    metadata.httpStatus < 200 ||
    metadata.httpStatus >= 300 ||
    !/^[a-f0-9]{64}$/i.test(metadata.rawSha256)
  ) {
    throw new Error("Coinbase candle request metadata is invalid");
  }
  const url = new URL(metadata.requestUrl);
  const expectedPath = `/products/${encodeURIComponent(metadata.product)}/candles`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.exchange.coinbase.com" ||
    url.pathname !== expectedPath ||
    url.searchParams.get("granularity") !== String(metadata.granularitySeconds) ||
    url.searchParams.get("start") !== metadata.start ||
    url.searchParams.get("end") !== metadata.end
  ) {
    throw new Error("Coinbase request URL does not match metadata");
  }
}

function validateRow(row: unknown, startMs: number, endMs: number): CoinbaseRow {
  if (
    !Array.isArray(row) ||
    row.length < 6 ||
    !row.slice(0, 6).every((value) => Number.isFinite(value)) ||
    !Number.isInteger(row[0])
  ) {
    throw new Error("Coinbase candle row is invalid");
  }
  const [startSeconds, low, high, open, close, volume] = row;
  const bucketStartMs = startSeconds * 1_000;
  if (
    bucketStartMs < startMs ||
    bucketStartMs >= endMs ||
    low <= 0 ||
    high < low ||
    open < low ||
    open > high ||
    close < low ||
    close > high ||
    volume < 0
  ) {
    throw new Error("Coinbase candle row violates envelope or OHLC constraints");
  }
  return [startSeconds, low, high, open, close, volume];
}
