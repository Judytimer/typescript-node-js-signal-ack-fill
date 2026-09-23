import assert from "node:assert/strict";
import test from "node:test";

import { PaperLiquidationExecutor } from "../src/liquidation.ts";

test("paper liquidation records trigger mark separately from execution price", () => {
  const execution = new PaperLiquidationExecutor().execute(
    { symbol: "BTC-PERP", side: "LONG", qty: 1, entryPrice: 100, realizedPnl: 0 },
    { seq: 7, symbol: "BTC-PERP", lastPrice: 88, markPrice: 90, indexPrice: 92, ts: 7 }
  );

  assert.equal(execution.triggerMarkPrice, 90);
  assert.equal(execution.executionPrice, 90);
  assert.equal(execution.fill.price, execution.executionPrice);
});
