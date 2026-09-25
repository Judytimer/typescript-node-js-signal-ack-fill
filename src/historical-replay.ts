export type MoveValidity = "SUPPORTED" | "EMOTION_AMPLIFIED" | "INSUFFICIENT_SOURCE" | "UNCONFIRMED";
export type MoveDriver = "FUNDAMENTAL_EVENT" | "NARRATIVE" | "LIQUIDITY" | "MOMENTUM" | "NOISE" | "UNKNOWN";
export type ShadowVerdict = "PASS" | "WOULD_BLOCK" | "ABSTAIN";
export type EvaluationResult = "SUCCESS" | "FAILURE" | "NEUTRAL" | "AMBIGUOUS";
export type EvaluationStatus = "DEMO" | "QUALITATIVE_ONLY" | "FORMAL";
export type OutcomeStatus = "MEASURED" | "NOT_MEASURABLE";
export type InputProvenance = "ARCHIVED" | "RECONSTRUCTED" | "MIXED";

export type ReplayEvidence = {
  sourceId: string;
  publishedAt: number;
  summary: string;
};

export type BaselineDecisionRecord = {
  decision: "LONG" | "SHORT" | "FLAT";
  reason: string;
};

export type ShadowReviewRecord = {
  verdict: ShadowVerdict;
  confidence: number;
  moveValidity: MoveValidity;
  moveDecomposition: readonly MoveDriver[];
  sourceAgreement: "AGREE" | "CONFLICT" | "INSUFFICIENT";
  evidenceSourceIds: readonly string[];
  reason: string;
};

export type GroundTruthRecord = {
  /** Human-defined before the outcome window starts. */
  ruleDefinedAt: number;
  outcomeWindowEndsAt: number;
  rule: string;
  observedAt: number;
  outcome: string;
  baselineResult: EvaluationResult;
  aiShadowResult: EvaluationResult;
};

export type CatalystGroundTruthRecord = {
  status: "CONFIRMED" | "REFUTED" | "AMBIGUOUS";
  assessedAt: number;
  basis: string;
};

export type HistoricalReplayCase = {
  candidateId: string;
  evaluationStatus: EvaluationStatus;
  outcomeStatus: OutcomeStatus;
  inputProvenance: InputProvenance;
  t0: number;
  baseline: BaselineDecisionRecord;
  shadow: ShadowReviewRecord;
  evidence: readonly ReplayEvidence[];
  /** Source/catalyst truth is assessed independently from the trading verdict. */
  catalystGroundTruth: CatalystGroundTruthRecord;
  groundTruth: GroundTruthRecord;
};

export type HistoricalReplayRecord = HistoricalReplayCase & {
  mode: "HISTORICAL_REPLAY";
};

export type FrozenOutcomeHorizon = {
  candidateT0: number;
  horizonMs: number;
  endsAt: number;
  nextIndependentCatalystAt: number;
};

export const FORMAL_REPLAY_PROTOCOL_VERSION = "1.0.0";
export const FORMAL_OUTCOME_HORIZON_MS = 15 * 60_000;
export const FORMAL_OUTCOME_THRESHOLD_BPS = 50;

export type FrozenBaselineCandidateOutcome = FrozenOutcomeHorizon & {
  action: "LONG" | "SHORT";
  method: "T0_ENTRY_HOLD_TO_HORIZON_CLOSE";
  executionAssumption: "ZERO_LATENCY_T0_CLOSE";
  counterfactualUsesSameAssumption: true;
};

export type FormalBaselineScore = {
  result: "SUCCESS" | "FAILURE" | "NEUTRAL";
  directionalReturnBps: number;
};

/** Freezes the 15-minute horizon, which must end before the next catalyst. */
export function freezeOutcomeHorizon(
  candidateT0: number,
  nextIndependentCatalystAt: number
): FrozenOutcomeHorizon {
  if (!Number.isFinite(candidateT0) || !Number.isFinite(nextIndependentCatalystAt)) {
    throw new Error("outcome horizon is invalid");
  }
  const endsAt = candidateT0 + FORMAL_OUTCOME_HORIZON_MS;
  if (!Number.isFinite(endsAt)) {
    throw new Error("outcome horizon is invalid");
  }
  if (endsAt >= nextIndependentCatalystAt) {
    throw new Error("outcome horizon must end before the next independent catalyst");
  }
  return {
    candidateT0,
    horizonMs: FORMAL_OUTCOME_HORIZON_MS,
    endsAt,
    nextIndependentCatalystAt
  };
}

/** Baseline enters at immutable T0 and holds the selected side for 15 minutes. */
export function freezeBaselineCandidateOutcome(
  candidateT0: number,
  action: "LONG" | "SHORT",
  nextIndependentCatalystAt: number
): FrozenBaselineCandidateOutcome {
  return {
    ...freezeOutcomeHorizon(candidateT0, nextIndependentCatalystAt),
    action,
    method: "T0_ENTRY_HOLD_TO_HORIZON_CLOSE",
    executionAssumption: "ZERO_LATENCY_T0_CLOSE",
    counterfactualUsesSameAssumption: true
  };
}

/** Scores the globally frozen T0-close to T0+15m-close mechanical comparison. */
export function scoreFormalBaselineOutcome(
  action: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number
): FormalBaselineScore {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(exitPrice) ||
    entryPrice <= 0 ||
    exitPrice <= 0
  ) {
    throw new Error("formal outcome prices must be positive and finite");
  }
  const rawReturnBps = ((exitPrice - entryPrice) / entryPrice) * 10_000;
  const directionalReturnBps = action === "LONG" ? rawReturnBps : -rawReturnBps;
  const result =
    directionalReturnBps >= FORMAL_OUTCOME_THRESHOLD_BPS
      ? "SUCCESS"
      : directionalReturnBps <= -FORMAL_OUTCOME_THRESHOLD_BPS
        ? "FAILURE"
        : "NEUTRAL";
  return { result, directionalReturnBps };
}

/**
 * Validates the T0 and ground-truth contract, then emits immutable research
 * records. It does not map reviewer output to orders or tune reviewer prompts.
 */
export function runHistoricalReplay(
  cases: readonly HistoricalReplayCase[]
): readonly HistoricalReplayRecord[] {
  const candidateIds = new Set<string>();
  return cases.map((replayCase) => {
    validateReplayCase(replayCase, candidateIds);
    candidateIds.add(replayCase.candidateId);
    return structuredClone({ ...replayCase, mode: "HISTORICAL_REPLAY" as const });
  });
}

/** Returns only scored, formally eligible records. */
export function filterFormal(
  records: readonly HistoricalReplayRecord[]
): readonly HistoricalReplayRecord[] {
  return records.filter(
    (record) => record.evaluationStatus === "FORMAL" && record.outcomeStatus === "MEASURED"
  );
}

function validateReplayCase(replayCase: HistoricalReplayCase, candidateIds: Set<string>): void {
  if (replayCase.candidateId.length === 0) {
    throw new Error("candidateId is required");
  }
  if (candidateIds.has(replayCase.candidateId)) {
    throw new Error(`duplicate candidateId ${replayCase.candidateId}`);
  }
  if (!["DEMO", "QUALITATIVE_ONLY", "FORMAL"].includes(replayCase.evaluationStatus)) {
    throw new Error("evaluationStatus is invalid");
  }
  if (!["MEASURED", "NOT_MEASURABLE"].includes(replayCase.outcomeStatus)) {
    throw new Error("outcomeStatus is invalid");
  }
  if (!["ARCHIVED", "RECONSTRUCTED", "MIXED"].includes(replayCase.inputProvenance)) {
    throw new Error("inputProvenance is invalid");
  }
  if (replayCase.evaluationStatus === "FORMAL" && replayCase.outcomeStatus !== "MEASURED") {
    throw new Error("formal replay outcome must be measurable");
  }
  if (replayCase.evaluationStatus === "FORMAL" && replayCase.inputProvenance !== "ARCHIVED") {
    throw new Error("formal replay inputs must be archived");
  }
  if (!Number.isFinite(replayCase.t0)) {
    throw new Error("T0 must be finite");
  }
  if (
    !Number.isFinite(replayCase.shadow.confidence) ||
    replayCase.shadow.confidence < 0 ||
    replayCase.shadow.confidence > 1
  ) {
    throw new Error("reviewer confidence must be between 0 and 1");
  }

  const sourceIds = new Set<string>();
  for (const evidence of replayCase.evidence) {
    if (sourceIds.has(evidence.sourceId)) {
      throw new Error(`duplicate sourceId ${evidence.sourceId}`);
    }
    sourceIds.add(evidence.sourceId);
    if (evidence.publishedAt > replayCase.t0) {
      throw new Error(`source ${evidence.sourceId} violates T0`);
    }
  }
  for (const sourceId of replayCase.shadow.evidenceSourceIds) {
    if (!sourceIds.has(sourceId)) {
      throw new Error(`review cites unknown source ${sourceId}`);
    }
  }

  const catalystTruth = replayCase.catalystGroundTruth;
  if (
    !["CONFIRMED", "REFUTED", "AMBIGUOUS"].includes(catalystTruth.status) ||
    !Number.isFinite(catalystTruth.assessedAt) ||
    catalystTruth.basis.length === 0
  ) {
    throw new Error("catalyst ground truth is invalid");
  }

  const truth = replayCase.groundTruth;
  if (truth.rule.length === 0 || truth.ruleDefinedAt > replayCase.t0) {
    throw new Error("ground-truth rule must be defined by T0");
  }
  if (truth.outcomeWindowEndsAt <= replayCase.t0) {
    throw new Error("outcome window must end after T0");
  }
  if (truth.observedAt < truth.outcomeWindowEndsAt) {
    throw new Error("outcome cannot be recorded before its window ends");
  }
}
