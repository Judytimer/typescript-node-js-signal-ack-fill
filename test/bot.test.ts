import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { PerpBot } from "../src/bot.ts";
import type { Tick } from "../src/types.ts";

test("runs signal -> risk -> ack -> delayed fill -> position update", async () => {
  const ticks: Tick[] = [
    { seq: 1, symbol: "BTC-PERP", price: 100, ts: 1 },
    { seq: 2, symbol: "BTC-PERP", price: 101, ts: 2 },
    { seq: 3, symbol: "BTC-PERP", price: 102, ts: 3 },
    { seq: 4, symbol: "BTC-PERP", price: 103, ts: 4 },
    { seq: 5, symbol: "BTC-PERP", price: 104, ts: 5 }
  ];

  const logs: string[] = [];
  const bot = new PerpBot({
    symbol: "BTC-PERP",
    shortWindow: 2,
    longWindow: 4,
    orderQty: 0.01,
    maxAbsPosition: 0.03,
    fillDelayMs: 1,
    logger: (line) => logs.push(line)
  });

  for (const tick of ticks) {
    await bot.onTick(tick);
  }

  await bot.waitForIdle();

  assert.equal(bot.getPosition().side, "LONG");
  assert.equal(bot.getPosition().qty, 0.01);
  assert.match(logs.join("\n"), /SIGNAL/);
  assert.match(logs.join("\n"), /ACK/);
  assert.match(logs.join("\n"), /FILL/);
  assert.match(logs.join("\n"), /POSITION/);
});

test("uses pending orders as projected position while fills are delayed", async () => {
  const logs: string[] = [];
  const bot = new PerpBot({
    symbol: "BTC-PERP",
    shortWindow: 2,
    longWindow: 4,
    orderQty: 0.01,
    maxAbsPosition: 0.03,
    fillDelayMs: 20,
    logger: (line) => logs.push(line)
  });

  for (const [index, price] of [100, 101, 102, 103, 104, 105].entries()) {
    await bot.onTick({ seq: index + 1, symbol: "BTC-PERP", price, ts: index + 1 });
  }

  await bot.waitForIdle();

  assert.equal(logs.filter((line) => line.startsWith("[ACK]")).length, 1);
  assert.doesNotMatch(logs.join("\n"), /waiting for .* pending fill/);
  assert.match(logs.join("\n"), /already LONG/);
  assert.deepEqual(bot.getPosition(), {
    symbol: "BTC-PERP",
    side: "LONG",
    qty: 0.01,
    entryPrice: 103,
    realizedPnl: -0.000412
  });
});

test("matches out-of-order fills to pending orders by orderId", async () => {
  const logs: string[] = [];
  const bot = new PerpBot({
    symbol: "BTC-PERP",
    shortWindow: 2,
    longWindow: 4,
    orderQty: 0.01,
    maxAbsPosition: 0.03,
    fillDelayMs: (orderId: string) => (orderId === "SIM-1" ? 30 : 5),
    logger: (line) => logs.push(line)
  });

  for (const [index, price] of [100, 101, 102, 103, 80].entries()) {
    await bot.onTick({ seq: index + 1, symbol: "BTC-PERP", price, ts: index + 1 });
  }

  await bot.waitForIdle();

  const fillOrder = logs
    .filter((line) => line.startsWith("[FILL]"))
    .map((line) => line.match(/orderId=(SIM-\d+)/)?.[1]);
  assert.deepEqual(fillOrder, ["SIM-2", "SIM-1"]);
  assert.equal(bot.getPosition().side, "SHORT");
  assert.equal(bot.getPosition().qty, 0.01);
});

test("keeps remaining exposure pending until all partial fills complete", async () => {
  const logs: string[] = [];
  const bot = new PerpBot({
    symbol: "BTC-PERP",
    shortWindow: 2,
    longWindow: 4,
    orderQty: 0.01,
    maxAbsPosition: 0.03,
    fillDelayMs: 1,
    fillPlan: [
      { fraction: 0.4, delayMs: 1 },
      { fraction: 0.6, delayMs: 50 }
    ],
    logger: (line) => logs.push(line)
  });

  for (const [index, price] of [100, 101, 102, 103].entries()) {
    await bot.onTick({ seq: index + 1, symbol: "BTC-PERP", price, ts: index + 1 });
  }
  await sleep(10);
  await bot.onTick({ seq: 5, symbol: "BTC-PERP", price: 104, ts: 5 });
  await bot.onTick({ seq: 6, symbol: "BTC-PERP", price: 105, ts: 6 });
  await bot.waitForIdle();

  assert.equal(logs.filter((line) => line.startsWith("[ACK]")).length, 1);
  assert.match(logs.join("\n"), /status=PARTIALLY_FILLED filled=0\.004 remaining=0\.006/);
  assert.match(logs.join("\n"), /status=FILLED filled=0\.01 remaining=0/);
  assert.match(logs.join("\n"), /filled=0\.004 pending=0\.006 projected=0\.01/);
  assert.equal(bot.getPosition().side, "LONG");
  assert.equal(bot.getPosition().qty, 0.01);
});

test("liquidates an under-margined position at mark and halts new strategy orders", async () => {
  const logs: string[] = [];
  const bot = new PerpBot({
    symbol: "BTC-PERP",
    shortWindow: 2,
    longWindow: 4,
    orderQty: 0.01,
    maxAbsPosition: 0.03,
    fillDelayMs: 1,
    margin: { collateral: 0.1, leverage: 20, maintenanceMarginRate: 0.01 },
    logger: (line) => logs.push(line)
  });

  for (const [index, price] of [100, 101, 102, 103].entries()) {
    await bot.onTick({ seq: index + 1, symbol: "BTC-PERP", price, ts: index + 1 });
  }
  await bot.waitForIdle();

  await bot.onTick({ seq: 5, symbol: "BTC-PERP", price: 90, ts: 5 });
  await bot.onTick({ seq: 6, symbol: "BTC-PERP", price: 110, ts: 6 });

  assert.equal(bot.getPosition().side, "FLAT");
  assert.equal(logs.filter((line) => line.startsWith("[ACK]")).length, 1);
  assert.match(logs.join("\n"), /\[LIQUIDATION\].*mark=90/);
  assert.match(logs.join("\n"), /halted after liquidation/);
});

test("blocks an order when initial margin exceeds marked equity", async () => {
  const logs: string[] = [];
  const bot = new PerpBot({
    symbol: "BTC-PERP",
    shortWindow: 2,
    longWindow: 4,
    orderQty: 0.01,
    maxAbsPosition: 0.03,
    fillDelayMs: 1,
    margin: { collateral: 0.01, leverage: 2, maintenanceMarginRate: 0.005 },
    logger: (line) => logs.push(line)
  });

  for (const [index, price] of [100, 101, 102, 103].entries()) {
    await bot.onTick({ seq: index + 1, symbol: "BTC-PERP", price, ts: index + 1 });
  }

  assert.equal(logs.filter((line) => line.startsWith("[ACK]")).length, 0);
  assert.match(logs.join("\n"), /\[MARGIN_RISK\] blocked/);
});
