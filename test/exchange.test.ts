import assert from "node:assert/strict";
import test from "node:test";

import { SimulatedExchange } from "../src/exchange.ts";

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
