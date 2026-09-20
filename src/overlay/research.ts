import type { ResearchContext, ResearchSnapshot } from "./types.ts";

export class MockResearchContext implements ResearchContext {
  private index = 0;
  private readonly snapshots: readonly ResearchSnapshot[];

  constructor(snapshots: readonly ResearchSnapshot[]) {
    this.snapshots = snapshots;
  }

  next(): ResearchSnapshot | null {
    const snapshot = this.snapshots[this.index];
    if (snapshot === undefined) {
      return null;
    }

    this.index += 1;
    return snapshot;
  }
}
