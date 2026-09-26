import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { JsonFileBotStateStore } from "../src/state-store.ts";
import type { BotCheckpoint } from "../src/state-store.ts";

test("atomically saves and loads a versioned bot checkpoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "perp-state-"));
  const store = new JsonFileBotStateStore(join(directory, "bot-state.json"));
  const checkpoint = sampleCheckpoint();

  assert.equal(await store.load(), null);
  await store.save(checkpoint);
  assert.deepEqual(await store.load(), checkpoint);
});

test("rejects malformed or unsupported checkpoint files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "perp-state-"));
  const path = join(directory, "bot-state.json");
  const store = new JsonFileBotStateStore(path);

  await writeFile(path, "not-json", "utf8");
  await assert.rejects(store.load(), /invalid checkpoint JSON/);

  await writeFile(path, JSON.stringify({ ...sampleCheckpoint(), version: 2 }), "utf8");
  await assert.rejects(store.load(), /unsupported checkpoint version/);

  const malformedPosition = sampleCheckpoint();
  Object.assign(malformedPosition.positionState.position, { qty: "not-a-number" });
  await writeFile(path, JSON.stringify(malformedPosition), "utf8");
  await assert.rejects(store.load(), /invalid checkpoint shape/);
});

function sampleCheckpoint(): BotCheckpoint {
  return {
    version: 1,
    symbol: "BTC-PERP",
    positionState: {
      position: { symbol: "BTC-PERP", side: "FLAT", qty: 0, entryPrice: 0, realizedPnl: 0 },
      processedFillIds: []
    },
    orderTrackerState: { orders: [] },
    nextClientOrderSequence: 1,
    halted: false,
    lastMarkPrice: null
  };
}
