import assert from "node:assert/strict";
import test from "node:test";

import { InFlightOrderTracker } from "../src/order-tracker.ts";
import type { CancelAck, Fill, OrderAck } from "../src/types.ts";

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

test("only reaches CANCELED after an exchange cancel acknowledgment", () => {
  const tracker = new InFlightOrderTracker();
  tracker.trackAck(ack("SIM-2", "BUY", 0.01));

  assert.deepEqual(tracker.requestCancelOpenOrders(), [
    {
      orderId: "SIM-2",
      side: "BUY",
      originalQty: 0.01,
      filledQty: 0,
      remainingQty: 0.01,
      status: "CANCEL_REQUESTED"
    }
  ]);
  assert.equal(tracker.getOpenOrders().length, 1);

  tracker.processCancelAck(cancelAck("SIM-2"));
  assert.equal(tracker.get("SIM-2")?.status, "CANCELED");
  assert.equal(tracker.getOpenOrders().length, 0);
  assert.equal(tracker.processFill(fill("SIM-2-FILL-1", "SIM-2", "BUY", 0.01)).accepted, false);
});

test("restores order state and fill idempotency", () => {
  const original = new InFlightOrderTracker();
  original.trackAck(ack("SIM-7", "BUY", 0.01));
  original.processFill(fill("SIM-7-FILL-1", "SIM-7", "BUY", 0.004));

  const restored = InFlightOrderTracker.fromState(original.exportState());

  assert.equal(restored.processFill(fill("SIM-7-FILL-1", "SIM-7", "BUY", 0.004)).accepted, false);
  assert.deepEqual(restored.get("SIM-7"), original.get("SIM-7"));
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

function cancelAck(orderId: string): CancelAck {
  return { orderId, status: "CANCELED", ts: 2 };
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
