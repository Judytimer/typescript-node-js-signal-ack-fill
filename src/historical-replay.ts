export type MoveValidity = "SUPPORTED" | "EMOTION_AMPLIFIED" | "INSUFFICIENT_SOURCE" | "UNCONFIRMED";
export type MoveDriver = "FUNDAMENTAL_EVENT" | "NARRATIVE" | "LIQUIDITY" | "MOMENTUM" | "NOISE" | "UNKNOWN";
export type ShadowVerdict = "PASS" | "WOULD_BLOCK" | "ABSTAIN";
export type EvaluationResult = "SUCCESS" | "FAILURE" | "NEUTRAL" | "AMBIGUOUS";
export type EvaluationStatus = "DEMO" | "QUALITATIVE_ONLY" | "FORMAL";
export type OutcomeStatus = "MEASURED" | "NOT_MEASURABLE";

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

export type HistoricalReplayCase = {
  candidateId: string;
  evaluationStatus: EvaluationStatus;
  outcomeStatus: OutcomeStatus;
  t0: number;
  baseline: BaselineDecisionRecord;
  shadow: ShadowReviewRecord;
  evidence: readonly ReplayEvidence[];
  groundTruth: GroundTruthRecord;
};

export type HistoricalReplayRecord = HistoricalReplayCase & {
  mode: "HISTORICAL_REPLAY";
};

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
  if (replayCase.evaluationStatus === "FORMAL" && replayCase.outcomeStatus !== "MEASURED") {
    throw new Error("formal replay outcome must be measurable");
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
