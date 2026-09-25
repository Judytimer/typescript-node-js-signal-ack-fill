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
  intervalMs: number;
  candles: readonly HistoricalCandle[];
};

export type FirstLongDiagnostic = {
  firstLongAt: number | null;
  previousEvaluableAction: "LONG" | "SHORT" | "HOLD" | null;
  observedCrossover: boolean;
};

export async function loadHistoricalCandles(
  path: URL,
  expectedSymbol: string,
  t0: number
): Promise<HistoricalCandleFixture> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return validateHistoricalCandleFixture(parsed, expectedSymbol, t0);
}

export function validateHistoricalCandleFixture(
  parsed: unknown,
  expectedSymbol: string,
  t0: number
): HistoricalCandleFixture {
  if (!isRecord(parsed) || parsed.symbol !== expectedSymbol || typeof parsed.source !== "string") {
    throw new Error("historical candle identity is invalid");
  }
  if (parsed.provenance !== "VENDOR_ARCHIVE" && parsed.provenance !== "RECONSTRUCTED") {
    throw new Error("historical candle provenance is invalid");
  }
  if (!Array.isArray(parsed.candles) || parsed.candles.length === 0) {
    throw new Error("historical candle fixture is empty");
  }
  if (!Number.isFinite(parsed.intervalMs) || Number(parsed.intervalMs) <= 0) {
    throw new Error("historical candle interval is invalid");
  }

  let previousTs = -Infinity;
  const intervalMs = Number(parsed.intervalMs);
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
    if (previousTs !== -Infinity && Number(value.ts) - previousTs !== intervalMs) {
      throw new Error("historical candle interval is inconsistent");
    }
    previousTs = Number(value.ts);
    return { ts: Number(value.ts), close: Number(value.close) };
  });
  if (t0 - candles.at(-1)!.ts > intervalMs) {
    throw new Error("historical candles are stale at T0");
  }

  return {
    symbol: parsed.symbol,
    source: parsed.source,
    provenance: parsed.provenance,
    intervalMs,
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

export function diagnoseFirstLong(
  fixture: HistoricalCandleFixture,
  shortWindow: number,
  longWindow: number
): FirstLongDiagnostic {
  const strategy = new MovingAverageSignal(shortWindow, longWindow);
  let previousEvaluableAction: FirstLongDiagnostic["previousEvaluableAction"] = null;

  for (let index = 0; index < fixture.candles.length; index++) {
    const signal = strategy.onTick(toTick(fixture, index));
    if (signal.shortMa === null || signal.longMa === null) {
      continue;
    }
    if (signal.action === "LONG") {
      return {
        firstLongAt: fixture.candles[index].ts,
        previousEvaluableAction,
        observedCrossover: previousEvaluableAction !== null && previousEvaluableAction !== "LONG"
      };
    }
    previousEvaluableAction = signal.action;
  }

  return { firstLongAt: null, previousEvaluableAction, observedCrossover: false };
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
