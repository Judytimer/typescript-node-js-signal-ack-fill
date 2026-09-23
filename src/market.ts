import type { Tick } from "./types.ts";

export type MarketConfig = {
  symbol: string;
  startPrice: number;
  ticks: number;
};

export function* simulateMarket(config: MarketConfig): Generator<Tick> {
  let price = config.startPrice;

  for (let seq = 1; seq <= config.ticks; seq++) {
    const trend = seq < config.ticks / 2 ? 8 : -5;
    const wave = Math.sin(seq / 2) * 18;
    const noise = Math.sin(seq * 1.7) * 5;
    price = Math.max(1, price + trend + wave + noise);

    const lastPrice = Math.round(price * 100) / 100;
    yield {
      seq,
      symbol: config.symbol,
      lastPrice,
      markPrice: lastPrice,
      indexPrice: lastPrice,
      ts: Date.now()
    };
  }
}
