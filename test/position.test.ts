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

test("restores position and processed fill ids without applying a duplicate again", () => {
  const original = new PositionBook("BTC-PERP");
  const firstFill = { ...fill("SIM-9", "BUY", 0.01), fee: 0.4 };
  original.applyFill(firstFill);

  const restored = PositionBook.fromState(original.exportState());
  restored.applyFill(firstFill);

  assert.deepEqual(restored.get(), original.get());
  assert.deepEqual(restored.exportState(), original.exportState());
});

test("funding debits longs, credits shorts, and is idempotent", () => {
  const long = new PositionBook("BTC-PERP");
  long.applyFill(fill("LONG", "BUY", 1));
  const settlement = {
    fundingId: "BTC-1000",
    symbol: "BTC-PERP",
    rate: 0.001,
    markPrice: 110,
    ts: 1_000
  };

  assert.equal(long.applyFunding(settlement).payment, -0.11);
  assert.deepEqual(long.applyFunding(settlement), {
    accepted: false,
    payment: 0,
    position: long.get()
  });

  const restored = PositionBook.fromState(long.exportState());
  assert.equal(restored.applyFunding(settlement).accepted, false);

  const short = new PositionBook("BTC-PERP");
  short.applyFill(fill("SHORT", "SELL", 1));
  assert.equal(short.applyFunding({ ...settlement, fundingId: "BTC-2000" }).payment, 0.11);
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
