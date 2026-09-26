import assert from "node:assert/strict";
import test from "node:test";

import { reconcileState } from "../src/reconciliation.ts";
import type { InFlightOrder } from "../src/order-tracker.ts";
import type { Position } from "../src/types.ts";

test("reports a consistent local and exchange snapshot", () => {
  const report = reconcileState(position("LONG", 0.01), [openOrder("SIM-1", 0.006)], {
    position: position("LONG", 0.01),
    openOrders: [{ orderId: "SIM-1", side: "BUY", remainingQty: 0.006 }]
  });

  assert.deepEqual(report, { consistent: true, issues: [] });
});

test("reports position, missing order, unexpected order, and remaining quantity mismatches", () => {
  const report = reconcileState(
    position("LONG", 0.01),
    [openOrder("LOCAL-ONLY", 0.01), openOrder("DIFFERENT-QTY", 0.006)],
    {
      position: position("SHORT", 0.02),
      openOrders: [
        { orderId: "EXCHANGE-ONLY", side: "SELL", remainingQty: 0.02 },
        { orderId: "DIFFERENT-QTY", side: "BUY", remainingQty: 0.002 }
      ]
    }
  );

  assert.deepEqual(report, {
    consistent: false,
    issues: [
      { type: "POSITION_MISMATCH", localSignedQty: 0.01, exchangeSignedQty: -0.02 },
      { type: "MISSING_EXCHANGE_ORDER", orderId: "LOCAL-ONLY" },
      {
        type: "ORDER_REMAINING_MISMATCH",
        orderId: "DIFFERENT-QTY",
        localRemainingQty: 0.006,
        exchangeRemainingQty: 0.002
      },
      { type: "UNEXPECTED_EXCHANGE_ORDER", orderId: "EXCHANGE-ONLY" }
    ]
  });
});

test("reports a side mismatch without treating one order id as two missing orders", () => {
  const report = reconcileState(position("FLAT", 0), [openOrder("SIM-1", 0.01)], {
    position: position("FLAT", 0),
    openOrders: [{ orderId: "SIM-1", side: "SELL", remainingQty: 0.01 }]
  });

  assert.deepEqual(report.issues, [
    {
      type: "ORDER_SIDE_MISMATCH",
      orderId: "SIM-1",
      localSide: "BUY",
      exchangeSide: "SELL"
    }
  ]);
});

function position(side: Position["side"], qty: number): Position {
  return {
    symbol: "BTC-PERP",
    side,
    qty,
    entryPrice: qty === 0 ? 0 : 100,
    realizedPnl: 0
  };
}

function openOrder(orderId: string, remainingQty: number): InFlightOrder {
  return {
    clientOrderId: orderId,
    exchangeOrderId: `VENUE-${orderId}`,
    side: "BUY",
    originalQty: 0.01,
    filledQty: 0.01 - remainingQty,
    remainingQty,
    status: remainingQty === 0.01 ? "ACKED" : "PARTIALLY_FILLED"
  };
}
