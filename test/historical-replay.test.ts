import assert from "node:assert/strict";
import test from "node:test";

import { filterFormal, runHistoricalReplay } from "../src/historical-replay.ts";
import type { HistoricalReplayCase } from "../src/historical-replay.ts";
import {
  diagnoseFirstLong,
  loadHistoricalCandles,
  replayMovingAverageBaseline,
  validateHistoricalCandleFixture
} from "../src/historical-candles.ts";
import {
  secXCompromiseAssessment,
  createSecXCompromiseCase
} from "../src/replay-cases/sec-x-compromise-2024-01-09.ts";

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

test("derives the qualitative case Baseline from its candle fixture", async () => {
  const fixture = await loadHistoricalCandles(
    new URL("../fixtures/historical/sec-x-compromise-2024-01-09.json", import.meta.url),
    "BTC-USD",
    Date.parse("2024-01-09T21:12:00Z")
  );
  const baseline = replayMovingAverageBaseline(fixture, 3, 6);
  const [record] = runHistoricalReplay([createSecXCompromiseCase(baseline)]);

  assert.equal(record.candidateId, "BTC-SEC-X-COMPROMISE-2024-01-09");
  assert.equal(record.evaluationStatus, "QUALITATIVE_ONLY");
  assert.equal(record.outcomeStatus, "NOT_MEASURABLE");
  assert.equal(record.inputProvenance, "RECONSTRUCTED");
  assert.equal(record.baseline.decision, "LONG");
  assert.match(record.baseline.reason, /MovingAverageSignal\(3,6\).*short MA > long MA/);
  assert.equal(record.shadow.verdict, "ABSTAIN");
  assert.equal(record.groundTruth.baselineResult, "AMBIGUOUS");
  assert.equal(record.groundTruth.aiShadowResult, "AMBIGUOUS");
  assert.equal(secXCompromiseAssessment.hindsightLeakage, "NOT_EXCLUDED");
  assert.match(secXCompromiseAssessment.aiIncrement, /cannot be measured/);
  assert.match(secXCompromiseAssessment.interviewUse, /not valid evidence/);

  const diagnostic = diagnoseFirstLong(fixture, 3, 6);
  assert.equal(diagnostic.firstLongAt, Date.parse("2024-01-09T21:11:00Z"));
  assert.equal(diagnostic.previousEvaluableAction, null);
  assert.equal(diagnostic.observedCrossover, false);
});

test("filterFormal excludes demo, qualitative, and unmeasurable records", () => {
  const demo = replayCase("DEMO", "NOT_MEASURABLE", "DEMO-CASE");
  const qualitative = replayCase("QUALITATIVE_ONLY", "MEASURED", "QUALITATIVE-CASE");
  const formal = replayCase("FORMAL", "MEASURED", "FORMAL-CASE");
  const records = runHistoricalReplay([demo, qualitative, formal]);

  assert.deepEqual(filterFormal(records).map((record) => record.candidateId), ["FORMAL-CASE"]);
});

test("rejects a FORMAL record whose outcome is not measurable", () => {
  assert.throws(
    () => runHistoricalReplay([replayCase("FORMAL", "NOT_MEASURABLE", "INVALID-FORMAL")]),
    /formal replay outcome must be measurable/
  );
});

test("rejects FORMAL records backed by reconstructed or mixed inputs", () => {
  for (const inputProvenance of ["RECONSTRUCTED", "MIXED"] as const) {
    const input = replayCase("FORMAL", "MEASURED", `FORMAL-${inputProvenance}`);
    input.inputProvenance = inputProvenance;
    assert.throws(() => runHistoricalReplay([input]), /formal replay inputs must be archived/);
  }
});

test("validates candle interval consistency and freshness at T0", () => {
  const base = {
    symbol: "BTC-USD",
    source: "vendor fixture",
    provenance: "VENDOR_ARCHIVE",
    intervalMs: 60_000,
    candles: [
      { ts: 880_000, close: 100 },
      { ts: 940_000, close: 101 }
    ]
  };
  assert.equal(validateHistoricalCandleFixture(base, "BTC-USD", 1_000_000).intervalMs, 60_000);

  const inconsistent = structuredClone(base);
  inconsistent.candles[1].ts = 950_000;
  assert.throws(
    () => validateHistoricalCandleFixture(inconsistent, "BTC-USD", 1_000_000),
    /interval is inconsistent/
  );

  assert.throws(
    () => validateHistoricalCandleFixture(base, "BTC-USD", 1_000_001),
    /stale at T0/
  );
});

function replayCase(
  evaluationStatus: HistoricalReplayCase["evaluationStatus"] = "FORMAL",
  outcomeStatus: HistoricalReplayCase["outcomeStatus"] = "MEASURED",
  candidateId = "CASE-001"
): HistoricalReplayCase {
  return {
    candidateId,
    evaluationStatus,
    outcomeStatus,
    inputProvenance: "ARCHIVED",
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
