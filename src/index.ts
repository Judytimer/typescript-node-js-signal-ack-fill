import { PerpBot } from "./bot.ts";
import { simulateMarket } from "./market.ts";
import { setTimeout as sleep } from "node:timers/promises";
import { JsonFileBotStateStore } from "./state-store.ts";

const symbol = "BTC-PERP";
const bot = await PerpBot.create({
  symbol,
  shortWindow: 3,
  longWindow: 6,
  orderQty: 0.01,
  maxAbsPosition: 0.03,
  margin: { collateral: 1_000, leverage: 5, maintenanceMarginRate: 0.005 },
  stateStore: new JsonFileBotStateStore(".runtime/perp-bot-state.json"),
  fillDelayMs: 350
});

for (const tick of simulateMarket({ symbol, startPrice: 65000, ticks: 24 })) {
  await bot.onTick(tick);
  await sleep(120);
}

await bot.waitForIdle();

console.log("[DONE]", bot.getPosition());
