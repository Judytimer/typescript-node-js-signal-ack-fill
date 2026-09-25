# FORMAL Case #1｜Candidate Screen

日期：2026-09-25  
状态：**NOT ADMITTED — INPUT ACQUISITION REQUIRED**

## Candidate

```text
Event: 2024-03-20 FOMC monetary-policy statement
Symbol: BTC-USD
Proposed T0: 2024-03-20T18:01:00Z
Baseline: unchanged MovingAverageSignal(3,6), evaluated on one-minute closes through T0
Shadow role: review the official statement and return PASS / WOULD_BLOCK / ABSTAIN
```

The proposed T0 is one minute after the scheduled 18:00 UTC release so that
the official statement can be an event input and the first post-release
one-minute candle can be part of the Baseline decision. The timestamp remains
provisional until both source artifacts are acquired and their timestamps are
verified locally.

## Pre-Formal Gate

| Gate | Result | Required evidence |
| --- | --- | --- |
| Credible event evidence available by T0 | PENDING | Save the official Federal Reserve release artifact, publication metadata, retrieval metadata, and checksum. Candidate locator: `https://www.federalreserve.gov/newsevents/pressreleases/monetary20240320a.htm`. |
| Archived/vendor market data | FAIL | No raw vendor BTC-USD response for the event window is currently stored in the repository. A source URL written in a fixture is not sufficient. |
| Candle interval and T0 freshness | PENDING | Validate one-minute continuity and require the final input candle to be no more than one interval behind T0. |
| Baseline/catalyst causal alignment | PENDING | Replay enough pre-event candles to observe the prior evaluable MA state and determine whether LONG/SHORT first changes at or after the release. Warm-up followed by a first signal is not a crossover. |
| Outcome rule can be frozen | PASS | Freeze the rule below before loading post-T0 candles or producing the Shadow review. |

## Frozen Outcome Rule Candidate

This rule is a proposal recorded before this repository acquires or inspects
the post-T0 outcome candles:

```text
Window end: T0 + 30 minutes
Reference: BTC-USD close at T0
Outcome: BTC-USD close at the window end

For Baseline LONG:
  SUCCESS if return >= +0.50%
  FAILURE if return <= -0.50%
  NEUTRAL otherwise

For Baseline SHORT:
  SUCCESS if return <= -0.50%
  FAILURE if return >= +0.50%
  NEUTRAL otherwise

For Baseline FLAT:
  NEUTRAL
```

The Shadow result must be derived mechanically from its pre-outcome verdict
and the Baseline result; it must not be assigned after reading the outcome.
The exact mapping remains unimplemented and must be frozen before admitting
the case.

## Admission Decision

**NO-GO for implementation as a FORMAL record.**

The candidate is promising because it has a scheduled authoritative event and
a clear market-data target. It is not yet a research record: authoritative
event bytes and vendor candle bytes are absent, the proposed T0 is not locally
verified, and the Baseline crossover has not been demonstrated.

Next action is bounded acquisition, not Replay framework work:

1. acquire and checksum the official event artifact;
2. acquire and checksum raw vendor one-minute candles spanning warm-up through
   the outcome window;
3. verify timestamps, interval continuity, freshness, and crossover;
4. only then construct `FORMAL / MEASURED / ARCHIVED` Case #1.

If any artifact cannot establish its timestamp or provenance, reject this
candidate rather than downgrade it and count it toward the 3–5 FORMAL target.
