import type { Tick } from "./types.ts";

export type MarketConfig = {
  symbol: string;
  startPrice: number;
  ticks: number;
};

export function* simulateMarket(config: MarketConfig): Generator<Tick> {
  let lastPrice = config.startPrice;
  let indexPrice = config.startPrice;

  for (let seq = 1; seq <= config.ticks; seq++) {
    const trend = seq < config.ticks / 2 ? 8 : -5;
    const wave = Math.sin(seq / 2) * 18;
    const noise = Math.sin(seq * 1.7) * 5;
    lastPrice = roundPrice(Math.max(1, lastPrice + trend + wave + noise));

    // A deliberately small deterministic reference move makes price roles
    // observable. This is a scenario generator, not an exchange mark engine.
    indexPrice = roundPrice(Math.max(1, indexPrice + trend * 0.25));
    const markPrice = roundPrice(indexPrice + (lastPrice - indexPrice) * 0.25);

    yield {
      seq,
      symbol: config.symbol,
      lastPrice,
      markPrice,
      indexPrice,
      ts: Date.now()
    };
  }
}

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}
