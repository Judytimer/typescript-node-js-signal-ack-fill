import type { BaselineDecisionRecord, HistoricalReplayCase } from "../historical-replay.ts";

const minute = 60_000;

/**
 * Real incident, reconstructed after the fact. This is intentionally not a
 * formal evaluation sample: the deleted T0 post was not captured by this
 * project at event time and the Baseline decision cannot be reproduced from a
 * retained pre-T0 tick stream.
 */
export function createSecXCompromiseCase(
  baseline: BaselineDecisionRecord
): HistoricalReplayCase {
  return {
    candidateId: "BTC-SEC-X-COMPROMISE-2024-01-09",
    evaluationStatus: "QUALITATIVE_ONLY",
    outcomeStatus: "NOT_MEASURABLE",
    inputProvenance: "RECONSTRUCTED",
    // The unauthorized @SECGov post appeared at approximately 16:11 ET. The
    // replay cutoff is one minute later, before the first public correction.
    t0: Date.parse("2024-01-09T21:12:00Z"),
    baseline,
    shadow: {
      verdict: "ABSTAIN",
      confidence: 0.78,
      moveValidity: "UNCONFIRMED",
      moveDecomposition: ["FUNDAMENTAL_EVENT", "MOMENTUM"],
      sourceAgreement: "INSUFFICIENT",
      evidenceSourceIds: ["SEC-X-DELETED-POST"],
      reason: "At T0 the case contains one social-account claim and no independently captured SEC release or second source. Shadow supplies source sufficiency, not trading authority."
    },
    evidence: [
      {
        sourceId: "SEC-X-DELETED-POST",
        publishedAt: Date.parse("2024-01-09T21:11:00Z"),
        summary: "The @SECGov account stated that spot Bitcoin ETFs had been approved. The post was later deleted; its timestamp and content are reconstructed from the SEC incident report, not from a project-owned T0 archive."
      }
    ],
    groundTruth: {
      // This is the replay protocol's logical cutoff, not proof that the rule was
      // durably recorded in 2024. That provenance gap makes the case qualitative.
      ruleDefinedAt: Date.parse("2024-01-09T21:12:00Z"),
      outcomeWindowEndsAt: Date.parse("2024-01-09T21:12:00Z") + 30 * minute,
      rule: "FAILURE if SEC or its Chair publicly repudiates the approval claim within 30 minutes after T0; SUCCESS if the claim remains unrepudiated through the window; otherwise AMBIGUOUS.",
      observedAt: Date.parse("2024-01-09T21:43:00Z"),
      outcome: "SEC Chair Gary Gensler publicly said the SEC account was compromised and that no approval had been granted, approximately 14 minutes after T0.",
      // The event outcome is objective, but comparative scoring is not: neither
      // decision was durably recorded at T0 by this project.
      baselineResult: "AMBIGUOUS",
      aiShadowResult: "AMBIGUOUS"
    }
  };
}

export const secXCompromiseAssessment = {
  t0Assessment: "REAL_CUTOFF_RECONSTRUCTED_AFTER_EVENT" as const,
  hindsightLeakage: "NOT_EXCLUDED" as const,
  aiIncrement: "Source-sufficiency check would abstain on a single uncorroborated social post; predictive increment cannot be measured from a retrospective review." as const,
  baselineCausalCheck: "The first evaluable MA(3,6) LONG is at 21:11 UTC, but all earlier fixture points are warm-up; the retained data does not prove a crossover from a prior evaluable non-LONG signal." as const,
  interviewUse: "Useful for explaining T0 provenance and why Shadow cannot self-certify a win; not valid evidence that AI beats Baseline." as const,
  limitations: [
    "The project did not archive the deleted @SECGov post at T0.",
    "The Shadow review was produced retrospectively rather than committed before the outcome.",
    "The Baseline is reproducible from a retained reconstructed fixture, but the fixture is not a vendor-archived T0 market record."
  ] as const,
  outcomeSources: [
    "https://www.sec.gov/newsroom/press-releases/2024-5",
    "https://x.com/GaryGensler/status/1744833049064288387"
  ] as const
};
