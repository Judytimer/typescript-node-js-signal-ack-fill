import { SimulatedExchange } from "../exchange.ts";
import type { FillDelay } from "../exchange.ts";
import { round } from "../math.ts";
import type { Logger, OrderRequest } from "../types.ts";
import {
  formatOverlayAck,
  formatOverlayFill,
  formatOverlayPosition,
  formatOverlayRisk,
  formatOverlaySignal,
  formatPending,
  formatResearch
} from "./logging.ts";
import { PredictionPositionBook } from "./position.ts";
import { OverlayRiskManager } from "./risk.ts";
import { MemePredictionOverlayStrategy } from "./strategy.ts";
import type { PredictionPosition, ResearchSnapshot } from "./types.ts";

export type MemePredictionOverlayBotConfig = {
  spotRiseTriggerPct: number;
  exitYesPrice: number;
  maxRiskBudget: number;
  fillDelayMs: FillDelay;
  logger?: Logger;
};

export class MemePredictionOverlayBot {
  private readonly strategy: MemePredictionOverlayStrategy;
  private readonly risk: OverlayRiskManager;
  private readonly exchange: SimulatedExchange;
  private readonly logger: Logger;
  private readonly pendingOrders = new Map<string, OrderRequest>();
  private readonly pendingFills: Promise<void>[] = [];
  private positionBook: PredictionPositionBook | null = null;

  constructor(config: MemePredictionOverlayBotConfig) {
    this.strategy = new MemePredictionOverlayStrategy(config);
    this.risk = new OverlayRiskManager({ maxRiskBudget: config.maxRiskBudget });
    this.exchange = new SimulatedExchange(config.fillDelayMs);
    this.logger = config.logger ?? console.log;
  }

  async onSnapshot(snapshot: ResearchSnapshot): Promise<void> {
    this.positionBook ??= new PredictionPositionBook(snapshot.prediction.marketId);
    this.logger(formatResearch(snapshot));

    const projectedShares = this.getProjectedShares();
    this.logger(
      `[OVERLAY_EXPOSURE] filled=${this.positionBook.get().shares} pending=${round(
        projectedShares - this.positionBook.get().shares,
        6
      )} projected=${projectedShares}`
    );

    const signal = this.strategy.onSnapshot(snapshot, projectedShares);
    this.logger(formatOverlaySignal(signal));
    const decision = this.risk.evaluate(signal, projectedShares);
    this.logger(formatOverlayRisk(decision));
    if (!decision.approved) {
      return;
    }

    const submitted = this.exchange.submit(decision.order);
    this.pendingOrders.set(submitted.ack.orderId, submitted.ack.request);
    this.logger(formatOverlayAck(submitted.ack));
    this.logger(formatPending(submitted.ack.orderId, submitted.ack.request));

    const fillTasks = submitted.fills.map((fillPromise, index) =>
      fillPromise.then((fill) => {
        this.logger(formatOverlayFill(fill));
        if (index === submitted.fills.length - 1) {
          this.pendingOrders.delete(fill.orderId);
        }
        const position = this.positionBook!.applyFill(fill);
        this.logger(formatOverlayPosition(position));
      })
    );
    this.pendingFills.push(...fillTasks);
  }

  async waitForIdle(): Promise<void> {
    await Promise.all(this.pendingFills);
  }

  getPosition(): PredictionPosition {
    if (this.positionBook === null) {
      throw new Error("no research snapshot has been processed");
    }
    return this.positionBook.get();
  }

  private getProjectedShares(): number {
    let shares = this.positionBook!.get().shares;
    for (const order of this.pendingOrders.values()) {
      shares += order.side === "BUY" ? order.qty : -order.qty;
    }
    return round(shares, 6);
  }
}
