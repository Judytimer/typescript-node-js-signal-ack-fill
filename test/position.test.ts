import assert from "node:assert/strict";
import test from "node:test";

import { PositionBook } from "../src/position.ts";
import type { Fill } from "../src/types.ts";

test("partial SELL fills can reduce LONG and cross zero into SHORT", () => {
  const book = new PositionBook("BTC-PERP");
  book.applyFill(fill("SETUP", "BUY", 0.01));

  assert.deepEqual(book.applyFill(fill("SIM-1-A", "SELL", 0.006)), {
    symbol: "BTC-PERP",
    side: "LONG",
    qty: 0.004,
    entryPrice: 100,
    realizedPnl: 0
  });
  assert.deepEqual(book.applyFill(fill("SIM-1-B", "SELL", 0.006)), {
    symbol: "BTC-PERP",
    side: "SHORT",
    qty: 0.002,
    entryPrice: 100,
    realizedPnl: 0
  });
  assert.deepEqual(book.applyFill(fill("SIM-1-C", "SELL", 0.008)), {
    symbol: "BTC-PERP",
    side: "SHORT",
    qty: 0.01,
    entryPrice: 100,
    realizedPnl: 0
  });
});

test("applying the same identifiable fill twice changes position only once", () => {
  const book = new PositionBook("BTC-PERP");
  const duplicateFill = {
    ...fill("SIM-1", "BUY", 0.01),
    fillId: "SIM-1-FILL-1",
    fee: 0.4
  };

  const firstResult = book.applyFill(duplicateFill);
  const duplicateResult = book.applyFill(duplicateFill);

  assert.deepEqual(duplicateResult, firstResult);
  assert.deepEqual(book.get(), {
    symbol: "BTC-PERP",
    side: "LONG",
    qty: 0.01,
    entryPrice: 100,
    realizedPnl: -0.4
  });
});

function fill(orderId: string, side: Fill["side"], qty: number): Fill {
  return {
    fillId: `${orderId}-FILL-1`,
    orderId,
    symbol: "BTC-PERP",
    side,
    qty,
    price: 100,
    fee: 0,
    ts: 1
  };
}
