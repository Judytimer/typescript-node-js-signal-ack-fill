import assert from "node:assert/strict";
import test from "node:test";

import { OverlayRiskManager } from "../src/overlay/risk.ts";
import { MemePredictionOverlayStrategy } from "../src/overlay/strategy.ts";
import type { ResearchSnapshot } from "../src/overlay/types.ts";

test("buys YES only after the meme rise threshold for a higher FDV target", () => {
  const strategy = new MemePredictionOverlayStrategy({
    spotRiseTriggerPct: 0.5,
    exitYesPrice: 0.7
  });

  assert.equal(strategy.onSnapshot(snapshot(1, 100, 1_000, 2_000, 0.3), 0).action, "HOLD");
  assert.equal(strategy.onSnapshot(snapshot(2, 140, 1_400, 2_000, 0.32), 0).action, "HOLD");
  assert.equal(strategy.onSnapshot(snapshot(3, 150, 1_500, 1_500, 0.34), 0).action, "HOLD");

  const entry = strategy.onSnapshot(snapshot(4, 155, 1_550, 2_000, 0.35), 0);
  assert.equal(entry.action, "BUY_YES");
  assert.equal(entry.yesPrice, 0.35);
});

test("sells all projected YES shares at the price exit threshold", () => {
  const strategy = new MemePredictionOverlayStrategy({
    spotRiseTriggerPct: 0.5,
    exitYesPrice: 0.7
  });
  strategy.onSnapshot(snapshot(1, 100, 1_000, 2_000, 0.3), 0);

  assert.equal(strategy.onSnapshot(snapshot(2, 160, 1_600, 2_000, 0.69), 10).action, "HOLD");
  assert.equal(strategy.onSnapshot(snapshot(3, 160, 1_600, 2_000, 0.7), 10).action, "SELL_YES");
});

test("caps entry premium at the fixed maximum risk budget", () => {
  const risk = new OverlayRiskManager({ maxRiskBudget: 100 });
  const strategy = new MemePredictionOverlayStrategy({
    spotRiseTriggerPct: 0.5,
    exitYesPrice: 0.7
  });
  strategy.onSnapshot(snapshot(1, 100, 1_000, 2_000, 0.3), 0);
  const signal = strategy.onSnapshot(snapshot(2, 160, 1_600, 2_000, 0.35), 0);

  const decision = risk.evaluate(signal, 0);
  assert.equal(decision.approved, true);
  if (decision.approved) {
    assert.equal(decision.order.side, "BUY");
    assert.ok(decision.order.qty * decision.order.price <= 100);
    assert.ok(decision.order.qty > 285.71);
  }
});

function snapshot(
  seq: number,
  spotPrice: number,
  fdv: number,
  targetFdv: number,
  yesPrice: number
): ResearchSnapshot {
  return {
    seq,
    ts: seq,
    meme: { symbol: "DOGE", spotPrice, fdv },
    prediction: {
      marketId: "DOGE-FDV-2B",
      question: "Will DOGE exceed $2B FDV?",
      targetFdv,
      yesPrice
    }
  };
}
