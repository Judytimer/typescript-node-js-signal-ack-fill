import assert from "node:assert/strict";
import test from "node:test";

import { simulateMarket } from "../src/market.ts";

test("simulation exposes deterministic last, mark, and index divergence", () => {
  const ticks = [...simulateMarket({ symbol: "BTC-PERP", startPrice: 100, ticks: 4 })];

  assert.deepEqual(
    ticks.map(({ lastPrice, markPrice, indexPrice }) => ({ lastPrice, markPrice, indexPrice })),
    [
      { lastPrice: 121.59, markPrice: 106.9, indexPrice: 102 },
      { lastPrice: 130.46, markPrice: 108.18, indexPrice: 100.75 },
      { lastPrice: 138.79, markPrice: 109.32, indexPrice: 99.5 },
      { lastPrice: 152.63, markPrice: 111.85, indexPrice: 98.25 }
    ]
  );
});
