# FORMAL Case #1｜Candidate Screen

日期：2026-09-25  
状态：**NOT ADMITTED — CROSSOVER AND INPUT ACQUISITION REQUIRED**

## Candidate

```text
Event: 2024-03-20 FOMC monetary-policy statement
Symbol: BTC-USD
Event release: 2024-03-20T18:00:00Z (must be verified from the archived artifact)
Candidate cutoff: strictly before the 2024-03-20T18:30:00Z Powell press conference
Candidate T0: not fixed yet
Baseline: unchanged MovingAverageSignal(3,6) on closed one-minute candles
Shadow role: review the official statement and return PASS / WOULD_BLOCK / ABSTAIN
```

## Frozen Candidate Selection Rule

The rule below is frozen before acquiring or inspecting the event-window
candles:

1. Verify the official release time from the archived Federal Reserve bytes
   and metadata.
2. Replay the unchanged `MovingAverageSignal(3,6)` over contiguous, closed,
   vendor one-minute BTC-USD candles with enough pre-release history to have an
   evaluable signal before 18:00 UTC.
3. Starting after the verified event release, find the first evaluable signal
   that changes from the previous evaluable action into `LONG` or `SHORT`.
   `HOLD` (the Baseline's FLAT action) to `LONG`/`SHORT` is valid.
4. The close time of that candle is Candidate T0.
5. Candidate T0 must be strictly earlier than 18:30 UTC, before the Powell
   press conference begins.
6. Warm-up followed by the first evaluable signal is not a crossover.
7. If no qualifying crossover exists, reject the FOMC candidate. Do not move
   T0, change MA windows, or select a later move.

This makes the event-to-candidate relation a deterministic selection rule
rather than a timestamp chosen after viewing the chart.

The rule is implemented as the pure `selectFirstActionableCrossover()`
function. Synthetic DEMO burn-in proves that it selects the first
`SHORT -> LONG` crossover, rejects a warm-up-only first signal, and treats the
18:30 cutoff as exclusive.

## Frozen Baseline Candidate Outcome

The duration and position lifecycle are fixed now:

```text
H = 15 minutes
entry = Candidate T0 close
position = selected LONG or SHORT
exit = Candidate T0 + 15 minutes close
outcomeEnd = Candidate T0 + 15 minutes
outcomeEnd < nextIndependentCatalystAt

LONG:
  return >= +50bps => SUCCESS
  return <= -50bps => FAILURE
  otherwise => NEUTRAL

SHORT:
  return <= -50bps => SUCCESS
  return >= +50bps => FAILURE
  otherwise => NEUTRAL
```

Equality is not clean and must be rejected. `freezeOutcomeHorizon()` enforces
the fixed duration and catalyst boundary. `freezeBaselineCandidateOutcome()`
records the T0-entry/15-minute-hold definition without reading prices or
scoring an outcome.

Protocol version is `1.0.0`. `FORMAL_OUTCOME_THRESHOLD_BPS = 50` is global,
just like the 15-minute horizon. Individual Cases cannot override either
value; changing one requires a new protocol version.

Execution assumption: the Candidate T0 candle close produces the signal and
the Baseline is assumed filled at that same close. This is a
`zero-latency paper simplification`. Baseline and every Shadow counterfactual
use the same mechanical assumption. This protocol does not add slippage,
next-open, latency, or order-book execution models.

Sample limitation: this study only covers conditional samples where a
post-event actionable crossover exists before the fixed cutoff. It does not
estimate unconditional event performance. Baseline Candidate Outcome is a
mechanical momentum-chase comparison: enter in the crossover direction after
the move is already actionable and hold for 15 minutes. Any advantage from
`ABSTAIN` or `WOULD_BLOCK` may therefore include the mechanical benefit of not
chasing an existing directional move; it is not, by itself, AI alpha.

## Pre-Formal Gate

| Gate | Result | Required evidence |
| --- | --- | --- |
| Credible event evidence available by T0 | PENDING | Save the official Federal Reserve release bytes, publication metadata, retrieval metadata, and checksum. Candidate locator: `https://www.federalreserve.gov/newsevents/pressreleases/monetary20240320a.htm`. |
| Archived/vendor market data | FAIL | No raw vendor BTC-USD response for the event window is currently stored in the repository. A source URL written in a fixture is not sufficient. |
| Candle interval and T0 freshness | PENDING | Validate one-minute continuity and require the final input candle to be no more than one interval behind T0. |
| Baseline/catalyst temporal/actionable alignment | PENDING | Apply the frozen selection rule. The first actionable crossover must occur after the release and strictly before 18:30 UTC. |
| Baseline Candidate Outcome | READY | Assume zero-latency fill at immutable T0 close, hold selected side exactly 15 minutes, and score at global ±50bps thresholds; horizon end must be strictly earlier than the next independent catalyst. |
| Shadow mapping / ABSTAIN accounting | DEFERRED | Freeze only after a qualifying Candidate T0 exists, and before evaluating the post-T0 outcome or producing a scored record. |

## Artifact Acquisition Contract

Before running the selection rule, preserve:

```text
Fed official bytes + publication/retrieval metadata + checksum
Vendor BTC-USD 1m raw candles + request/retrieval metadata + checksum
```

Derived or hand-transcribed candles are not substitutes for the raw vendor
artifact. Acquisition does not itself admit the case; interval, freshness and
crossover validation must still pass.

The first acquisition attempt was blocked by this execution environment
before either source returned bytes. No failed proxy response is treated as an
artifact; see
[`formal-case-1-artifact-acquisition-attempt-2026-09-25.md`](formal-case-1-artifact-acquisition-attempt-2026-09-25.md).

## Post-Crossover Gate

Only after the frozen selection rule produces a qualifying Candidate T0:

1. freeze the Shadow verdict-to-result mapping;
2. freeze ABSTAIN counterfactual accounting;
3. build the T0 evidence packet and generate the Shadow review using only information available by Candidate
   T0;
4. reveal the future 15-minute candles and score Baseline/Shadow behavior with
   the already frozen ±50bps rule;
5. construct `FORMAL / MEASURED / ARCHIVED` Case #1.

If no qualifying crossover exists, none of these steps runs for this
candidate.

## Admission Decision

**NO-GO for implementation as a FORMAL record.**

The candidate is promising because it has a scheduled authoritative event and
a clear market-data target. It is not yet a research record: authoritative
event bytes and vendor candle bytes are absent, the release timestamp is not
locally verified, and no qualifying pre-18:30 crossover has been demonstrated.

Next action is bounded acquisition, not Replay framework work:

1. acquire and checksum the official event artifact;
2. acquire and checksum raw vendor one-minute candles spanning warm-up through
   the outcome window;
3. verify timestamps and interval continuity, then apply the frozen crossover
   selection rule;
4. reject the candidate if no qualifying pre-18:30 crossover exists;
5. otherwise make Candidate T0 immutable, then freeze Shadow mapping and
   ABSTAIN accounting before revealing the future 15-minute candles.

If any artifact cannot establish its timestamp or provenance, reject this
candidate rather than downgrade it and count it toward the 3–5 FORMAL target.
