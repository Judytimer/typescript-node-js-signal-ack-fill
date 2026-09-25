import assert from "node:assert/strict";
import test from "node:test";

import { validateRecoveryEvidence } from "../src/recovery-evidence.ts";

test("accepts complete authoritative evidence without a market mark", () => {
  const evidence = validateRecoveryEvidence(validEvidence(), ["SIM-1"]);

  assert.equal(evidence.venue, "SIMULATED");
  assert.equal(evidence.openOrdersComplete, true);
  assert.equal("markPrice" in evidence, false);
});

test("rejects missing venue, account, or symbol identity", () => {
  for (const field of ["venue", "accountId", "symbol"] as const) {
    const evidence = validEvidence();
    delete evidence[field];
    assert.throws(() => validateRecoveryEvidence(evidence, ["SIM-1"]), new RegExp(field));
  }
});

test("rejects missing asOf or an incomplete open-orders snapshot", () => {
  const missingAsOf = validEvidence();
  delete missingAsOf.asOf;
  assert.throws(() => validateRecoveryEvidence(missingAsOf, ["SIM-1"]), /asOf is required/);

  const incomplete = validEvidence();
  incomplete.openOrdersComplete = false;
  assert.throws(() => validateRecoveryEvidence(incomplete, ["SIM-1"]), /must be complete/);
});

test("rejects an unresolved local order with neither terminal nor fill evidence", () => {
  const evidence = validEvidence();
  evidence.terminalOrders = [];

  assert.throws(
    () => validateRecoveryEvidence(evidence, ["SIM-1"]),
    /insufficient evidence for unresolved order SIM-1/
  );
});

test("rejects duplicate fill ids", () => {
  const evidence = validEvidence();
  const fill = {
    fillId: "FILL-1",
    orderId: "SIM-1",
    symbol: "BTC-PERP",
    side: "BUY",
    qty: 0.01,
    price: 100,
    fee: 0.0004,
    ts: 1_100
  };
  evidence.fillsSinceCheckpoint = [fill, { ...fill }];

  assert.throws(() => validateRecoveryEvidence(evidence, ["SIM-1"]), /duplicate fill FILL-1/);
});

test("rejects a mark embedded in recovery evidence", () => {
  const evidence = { ...validEvidence(), markPrice: 100 };

  assert.throws(() => validateRecoveryEvidence(evidence, ["SIM-1"]), /fresh mark must come/);
});

test("rejects internally contradictory snapshot evidence", () => {
  const evidence = validEvidence();
  evidence.openOrders = [{ orderId: "SIM-1", side: "BUY", remainingQty: 0.01 }];

  assert.throws(() => validateRecoveryEvidence(evidence, ["SIM-1"]), /both open and terminal/);
});

function validEvidence(): Record<string, unknown> {
  return {
    venue: "SIMULATED",
    accountId: "PAPER-ACCOUNT",
    symbol: "BTC-PERP",
    asOf: 1_200,
    openOrdersComplete: true,
    position: { symbol: "BTC-PERP", side: "FLAT", qty: 0 },
    openOrders: [],
    terminalOrders: [{ orderId: "SIM-1", status: "CANCELED" }],
    fillsSinceCheckpoint: []
  };
}
