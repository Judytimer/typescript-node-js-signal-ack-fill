import assert from "node:assert/strict";
import test from "node:test";

import { InFlightOrderTracker } from "../src/order-tracker.ts";
import type { Fill, OrderAck } from "../src/types.ts";

test("tracks partial fills, remaining quantity, terminal state, and duplicate fill ids", () => {
  const tracker = new InFlightOrderTracker();
  tracker.trackAck(ack());

  assert.deepEqual(tracker.get("SIM-1"), {
    orderId: "SIM-1",
    side: "BUY",
    originalQty: 0.01,
    filledQty: 0,
    remainingQty: 0.01,
    status: "ACKED"
  });

  const first = tracker.processFill(fill("SIM-1-FILL-1", 0.004));
  assert.equal(first.accepted, true);
  assert.deepEqual(tracker.get("SIM-1"), {
    orderId: "SIM-1",
    side: "BUY",
    originalQty: 0.01,
    filledQty: 0.004,
    remainingQty: 0.006,
    status: "PARTIALLY_FILLED"
  });
  assert.equal(tracker.getOpenOrders().length, 1);

  const duplicate = tracker.processFill(fill("SIM-1-FILL-1", 0.004));
  assert.equal(duplicate.accepted, false);
  assert.equal(tracker.get("SIM-1")?.filledQty, 0.004);

  const second = tracker.processFill(fill("SIM-1-FILL-2", 0.006));
  assert.equal(second.accepted, true);
  assert.deepEqual(tracker.get("SIM-1"), {
    orderId: "SIM-1",
    side: "BUY",
    originalQty: 0.01,
    filledQty: 0.01,
    remainingQty: 0,
    status: "FILLED"
  });
  assert.equal(tracker.getOpenOrders().length, 0);
});

test("cancels open orders and rejects fills arriving after cancellation", () => {
  const tracker = new InFlightOrderTracker();
  tracker.trackAck(ack("SIM-2", "BUY", 0.01));

  assert.deepEqual(tracker.cancelOpenOrders(), [
    {
      orderId: "SIM-2",
      side: "BUY",
      originalQty: 0.01,
      filledQty: 0,
      remainingQty: 0.01,
      status: "CANCELED"
    }
  ]);
  assert.equal(tracker.getOpenOrders().length, 0);
  assert.equal(tracker.processFill(fill("SIM-2-FILL-1", "SIM-2", "BUY", 0.01)).accepted, false);
});

function ack(orderId = "SIM-1", side: Fill["side"] = "BUY", qty = 0.01): OrderAck {
  return {
    orderId,
    status: "ACKED",
    request: {
      symbol: "BTC-PERP",
      side,
      qty,
      price: 100,
      reason: "test",
      ts: 1
    },
    ts: 1
  };
}

function fill(
  fillId: string,
  orderIdOrQty: string | number,
  side: Fill["side"] = "BUY",
  explicitQty?: number
): Fill {
  const orderId = typeof orderIdOrQty === "string" ? orderIdOrQty : "SIM-1";
  const qty = typeof orderIdOrQty === "number" ? orderIdOrQty : explicitQty ?? 0;
  return {
    fillId,
    orderId,
    symbol: "BTC-PERP",
    side,
    qty,
    price: 100,
    fee: 0,
    ts: 1
  };
}
