import assert from "node:assert/strict";
import test from "node:test";

import { IsolatedMarginAccount } from "../src/margin.ts";
import type { Position } from "../src/types.ts";

test("marks long and short positions into isolated-margin account snapshots", () => {
  const account = new IsolatedMarginAccount({
    collateral: 100,
    leverage: 10,
    maintenanceMarginRate: 0.05
  });

  assert.deepEqual(account.snapshot(position("LONG", 1, 100), 90), {
    collateral: 100,
    markPrice: 90,
    notional: 90,
    unrealizedPnl: -10,
    equity: 90,
    initialMargin: 10,
    maintenanceMargin: 4.5,
    availableMargin: 80,
    marginRatio: 20,
    liquidatable: false
  });
  assert.equal(account.snapshot(position("SHORT", 1, 100), 110).unrealizedPnl, -10);
});

test("flags liquidation when marked equity reaches maintenance margin", () => {
  const account = new IsolatedMarginAccount({
    collateral: 10,
    leverage: 10,
    maintenanceMarginRate: 0.05
  });

  const snapshot = account.snapshot(position("LONG", 1, 100), 94);

  assert.equal(snapshot.equity, 4);
  assert.equal(snapshot.maintenanceMargin, 4.7);
  assert.equal(snapshot.liquidatable, true);
});

test("rejects exposure whose required initial margin exceeds equity", () => {
  const account = new IsolatedMarginAccount({
    collateral: 10,
    leverage: 10,
    maintenanceMarginRate: 0.005
  });

  assert.equal(account.canSupport(position("LONG", 2, 100), 100), false);
  assert.equal(account.canSupport(position("LONG", 1, 100), 100), true);
});

test("rejects invalid isolated-margin configuration", () => {
  assert.throws(
    () => new IsolatedMarginAccount({ collateral: 0, leverage: 10, maintenanceMarginRate: 0.005 }),
    /collateral must be positive/
  );
  assert.throws(
    () => new IsolatedMarginAccount({ collateral: 10, leverage: 0, maintenanceMarginRate: 0.005 }),
    /leverage must be positive/
  );
  assert.throws(
    () => new IsolatedMarginAccount({ collateral: 10, leverage: 10, maintenanceMarginRate: 1 }),
    /maintenanceMarginRate must be between 0 and 1/
  );
});

function position(side: Position["side"], qty: number, entryPrice: number): Position {
  return { symbol: "BTC-PERP", side, qty, entryPrice, realizedPnl: 0 };
}
