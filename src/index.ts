import { PerpBot } from "./bot.ts";
import { simulateMarket } from "./market.ts";
import { setTimeout as sleep } from "node:timers/promises";

const symbol = "BTC-PERP";
const bot = new PerpBot({
  symbol,
  shortWindow: 3,
  longWindow: 6,
  orderQty: 0.01,
  maxAbsPosition: 0.03,
  margin: { collateral: 1_000, leverage: 5, maintenanceMarginRate: 0.005 },
  fillDelayMs: 350
});

for (const tick of simulateMarket({ symbol, startPrice: 65000, ticks: 24 })) {
  await bot.onTick(tick);
  await sleep(120);
}

await bot.waitForIdle();

console.log("[DONE]", bot.getPosition());
