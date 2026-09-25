import { runHistoricalReplay } from "./historical-replay.ts";
import type { HistoricalReplayCase } from "./historical-replay.ts";

// Schema smoke fixture only. It is deliberately not counted as historical evidence.
const schemaDemo: HistoricalReplayCase = {
  candidateId: "DEMO-NOT-FORMAL-EVALUATION",
  t0: 1_000,
  baseline: {
    decision: "LONG",
    reason: "deterministic demo baseline"
  },
  shadow: {
    verdict: "ABSTAIN",
    confidence: 0.4,
    moveValidity: "INSUFFICIENT_SOURCE",
    moveDecomposition: ["UNKNOWN"],
    sourceAgreement: "INSUFFICIENT",
    evidenceSourceIds: ["DEMO-SOURCE"],
    reason: "schema demo has no independent corroboration"
  },
  evidence: [
    {
      sourceId: "DEMO-SOURCE",
      publishedAt: 900,
      summary: "synthetic pre-T0 input used only to exercise the runner"
    }
  ],
  groundTruth: {
    ruleDefinedAt: 950,
    outcomeWindowEndsAt: 2_000,
    rule: "synthetic demo outcome evaluated after the fixed window",
    observedAt: 2_001,
    outcome: "synthetic neutral outcome",
    baselineResult: "NEUTRAL",
    aiShadowResult: "NEUTRAL"
  }
};

const records = runHistoricalReplay([schemaDemo]);
console.log(JSON.stringify(records, null, 2));
