import assert from "node:assert/strict";
import test from "node:test";

import { MemePredictionOverlayBot } from "../src/overlay/bot.ts";
import type { ResearchSnapshot } from "../src/overlay/types.ts";

test("runs meme research -> YES signal -> risk -> ACK -> pending -> fill -> exit", async () => {
  const logs: string[] = [];
  const bot = new MemePredictionOverlayBot({
    spotRiseTriggerPct: 0.5,
    exitYesPrice: 0.7,
    maxRiskBudget: 100,
    fillDelayMs: 15,
    logger: (line) => logs.push(line)
  });

  await bot.onSnapshot(snapshot(1, 100, 1_000, 2_000, 0.3));
  await bot.onSnapshot(snapshot(2, 160, 1_600, 2_000, 0.35));
  await bot.onSnapshot(snapshot(3, 165, 1_650, 2_000, 0.36));
  await bot.waitForIdle();

  assert.ok(bot.getPosition().shares > 0);
  assert.ok(bot.getPosition().premiumAtRisk <= 100);

  await bot.onSnapshot(snapshot(4, 170, 1_700, 2_000, 0.75));
  await bot.onSnapshot(snapshot(5, 172, 1_720, 2_000, 0.76));
  await bot.waitForIdle();

  const ackLines = logs.filter((line) => line.startsWith("[OVERLAY_ACK]"));
  assert.equal(ackLines.length, 2);
  assert.match(ackLines[0], /side=BUY/);
  assert.match(ackLines[1], /side=SELL/);
  assert.match(logs.join("\n"), /\[OVERLAY_PENDING\]/);
  assert.match(logs.join("\n"), /\[OVERLAY_FILL\]/);
  assert.equal(bot.getPosition().shares, 0);
  assert.equal(bot.getPosition().premiumAtRisk, 0);
  assert.ok(bot.getPosition().realizedPnl > 0);
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
