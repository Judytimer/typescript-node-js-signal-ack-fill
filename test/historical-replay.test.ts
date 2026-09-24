import assert from "node:assert/strict";
import test from "node:test";

import { runHistoricalReplay } from "../src/historical-replay.ts";
import type { HistoricalReplayCase } from "../src/historical-replay.ts";

test("emits a reproducible shadow record without granting trading authority", () => {
  const input = replayCase();
  const [record] = runHistoricalReplay([input]);

  assert.equal(record.mode, "HISTORICAL_REPLAY");
  assert.equal(record.baseline.decision, "LONG");
  assert.equal(record.shadow.verdict, "WOULD_BLOCK");
  assert.equal(record.groundTruth.aiShadowResult, "SUCCESS");
  assert.notEqual(record, input);
});

test("rejects evidence published after T0", () => {
  const base = replayCase();
  const input: HistoricalReplayCase = {
    ...base,
    evidence: [{ ...base.evidence[0], publishedAt: base.t0 + 1 }]
  };

  assert.throws(() => runHistoricalReplay([input]), /violates T0/);
});

test("rejects ground truth defined late or observed before the outcome window closes", () => {
  const lateRule = replayCase();
  lateRule.groundTruth.ruleDefinedAt = lateRule.t0 + 1;
  assert.throws(() => runHistoricalReplay([lateRule]), /rule must be defined by T0/);

  const earlyOutcome = replayCase();
  earlyOutcome.groundTruth.observedAt = earlyOutcome.groundTruth.outcomeWindowEndsAt - 1;
  assert.throws(() => runHistoricalReplay([earlyOutcome]), /before its window ends/);
});

function replayCase(): HistoricalReplayCase {
  return {
    candidateId: "CASE-001",
    t0: 1_000,
    baseline: { decision: "LONG", reason: "baseline signal" },
    shadow: {
      verdict: "WOULD_BLOCK",
      confidence: 0.8,
      moveValidity: "INSUFFICIENT_SOURCE",
      moveDecomposition: ["NARRATIVE", "MOMENTUM"],
      sourceAgreement: "INSUFFICIENT",
      evidenceSourceIds: ["SOURCE-1"],
      reason: "single unconfirmed source"
    },
    evidence: [{ sourceId: "SOURCE-1", publishedAt: 900, summary: "available before T0" }],
    groundTruth: {
      ruleDefinedAt: 950,
      outcomeWindowEndsAt: 2_000,
      rule: "success if objective outcome occurs by window end",
      observedAt: 2_001,
      outcome: "objective outcome did not occur",
      baselineResult: "FAILURE",
      aiShadowResult: "SUCCESS"
    }
  };
}
