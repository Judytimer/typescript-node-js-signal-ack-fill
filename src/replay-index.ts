import { filterFormal, runHistoricalReplay } from "./historical-replay.ts";
import type { HistoricalReplayCase } from "./historical-replay.ts";
import {
  diagnoseFirstLong,
  loadHistoricalCandles,
  replayMovingAverageBaseline
} from "./historical-candles.ts";
import {
  secXCompromiseAssessment,
  createSecXCompromiseCase
} from "./replay-cases/sec-x-compromise-2024-01-09.ts";

// Schema smoke fixture only. It is deliberately not counted as historical evidence.
const schemaDemo: HistoricalReplayCase = {
  candidateId: "DEMO-NOT-FORMAL-EVALUATION",
  evaluationStatus: "DEMO",
  outcomeStatus: "NOT_MEASURABLE",
  inputProvenance: "RECONSTRUCTED",
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
  catalystGroundTruth: {
    status: "CONFIRMED",
    assessedAt: 2_001,
    basis: "synthetic source-truth fixture; it does not imply a PASS verdict"
  },
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

const t0 = Date.parse("2024-01-09T21:12:00Z");
const candles = await loadHistoricalCandles(
  new URL("../fixtures/historical/sec-x-compromise-2024-01-09.json", import.meta.url),
  "BTC-USD",
  t0
);
const realCase = createSecXCompromiseCase(replayMovingAverageBaseline(candles, 3, 6));
const records = runHistoricalReplay([schemaDemo, realCase]);
console.log(
  JSON.stringify(
    {
      records,
      formalRecords: filterFormal(records),
      diagnostics: [{ candidateId: realCase.candidateId, ...diagnoseFirstLong(candles, 3, 6) }],
      assessments: [secXCompromiseAssessment]
    },
    null,
    2
  )
);
