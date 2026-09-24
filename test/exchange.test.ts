import assert from "node:assert/strict";
import test from "node:test";

import { SimulatedExchange } from "../src/exchange.ts";
import { InFlightOrderTracker } from "../src/order-tracker.ts";

test("continues simulated order ids from a restored sequence", () => {
  const exchange = new SimulatedExchange(1);
  exchange.restoreNextOrderId(8);

  const submitted = exchange.submit({
    symbol: "BTC-PERP",
    side: "BUY",
    qty: 0.01,
    price: 100,
    reason: "test",
    ts: 1
  });

  assert.equal(submitted.ack.orderId, "SIM-8");
  assert.equal(exchange.getNextOrderId(), 9);
});

test("exchange cancel acknowledgment prevents an unexecuted fill", async () => {
  const exchange = new SimulatedExchange(30);
  const submitted = exchange.submit(order());

  const cancelAck = await exchange.requestCancel(submitted.ack.orderId);

  assert.deepEqual(cancelAck, {
    orderId: submitted.ack.orderId,
    status: "CANCELED",
    ts: cancelAck.ts
  });
  assert.equal(await submitted.fills[0], null);
});

test("partial fill remains recorded when exchange cancels only the remainder", async () => {
  const exchange = new SimulatedExchange(1, 0, [
    { fraction: 0.4, delayMs: 1 },
    { fraction: 0.6, delayMs: 40 }
  ]);
  const tracker = new InFlightOrderTracker();
  const submitted = exchange.submit(order());
  tracker.trackAck(submitted.ack);

  const firstFill = await submitted.fills[0];
  assert.notEqual(firstFill, null);
  tracker.processFill(firstFill!);

  tracker.requestCancelOpenOrders();
  const cancelAck = await exchange.requestCancel(submitted.ack.orderId);
  tracker.processCancelAck(cancelAck);

  assert.equal(await submitted.fills[1], null);
  assert.deepEqual(tracker.get(submitted.ack.orderId), {
    orderId: submitted.ack.orderId,
    side: "BUY",
    originalQty: 0.01,
    filledQty: 0.004,
    remainingQty: 0.006,
    status: "CANCELED"
  });
});

function order() {
  return {
    symbol: "BTC-PERP",
    side: "BUY" as const,
    qty: 0.01,
    price: 100,
    reason: "test",
    ts: 1
  };
}
