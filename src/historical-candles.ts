import { readFile } from "node:fs/promises";

import { MovingAverageSignal } from "./strategy.ts";
import type { BaselineDecisionRecord } from "./historical-replay.ts";

export type HistoricalCandle = {
  ts: number;
  close: number;
};

export type HistoricalCandleFixture = {
  symbol: string;
  source: string;
  provenance: "VENDOR_ARCHIVE" | "RECONSTRUCTED";
  candles: readonly HistoricalCandle[];
};

export async function loadHistoricalCandles(
  path: URL,
  expectedSymbol: string,
  t0: number
): Promise<HistoricalCandleFixture> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed) || parsed.symbol !== expectedSymbol || typeof parsed.source !== "string") {
    throw new Error("historical candle identity is invalid");
  }
  if (parsed.provenance !== "VENDOR_ARCHIVE" && parsed.provenance !== "RECONSTRUCTED") {
    throw new Error("historical candle provenance is invalid");
  }
  if (!Array.isArray(parsed.candles) || parsed.candles.length === 0) {
    throw new Error("historical candle fixture is empty");
  }

  let previousTs = -Infinity;
  const candles = parsed.candles.map((value) => {
    if (
      !isRecord(value) ||
      !Number.isFinite(value.ts) ||
      !Number.isFinite(value.close) ||
      Number(value.close) <= 0 ||
      Number(value.ts) <= previousTs ||
      Number(value.ts) > t0
    ) {
      throw new Error("historical candles must be ordered, positive, and no later than T0");
    }
    previousTs = Number(value.ts);
    return { ts: Number(value.ts), close: Number(value.close) };
  });

  return {
    symbol: parsed.symbol,
    source: parsed.source,
    provenance: parsed.provenance,
    candles
  };
}

export function replayMovingAverageBaseline(
  fixture: HistoricalCandleFixture,
  shortWindow: number,
  longWindow: number
): BaselineDecisionRecord {
  const strategy = new MovingAverageSignal(shortWindow, longWindow);
  let finalSignal = strategy.onTick(toTick(fixture, 0));
  for (let index = 1; index < fixture.candles.length; index++) {
    finalSignal = strategy.onTick(toTick(fixture, index));
  }
  if (finalSignal.shortMa === null || finalSignal.longMa === null) {
    throw new Error("historical candle fixture does not warm up the Baseline");
  }

  return {
    decision: finalSignal.action === "HOLD" ? "FLAT" : finalSignal.action,
    reason: `MovingAverageSignal(${shortWindow},${longWindow}) from ${fixture.source}: ${finalSignal.reason}`
  };
}

function toTick(fixture: HistoricalCandleFixture, index: number) {
  const candle = fixture.candles[index];
  return {
    seq: index + 1,
    symbol: fixture.symbol,
    lastPrice: candle.close,
    markPrice: candle.close,
    indexPrice: candle.close,
    ts: candle.ts
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
