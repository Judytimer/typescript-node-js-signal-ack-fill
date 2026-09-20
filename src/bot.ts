import { SimulatedExchange } from "./exchange.ts";
import type { FillDelay, FillPlanStep } from "./exchange.ts";
import {
  formatAck,
  formatFill,
  formatOrderState,
  formatPosition,
  formatRisk,
  formatSignal,
  formatTick
} from "./logging.ts";
import { PositionBook } from "./position.ts";
import { InFlightOrderTracker } from "./order-tracker.ts";
import type { InFlightOrder } from "./order-tracker.ts";
import { RiskManager } from "./risk.ts";
import { MovingAverageSignal } from "./strategy.ts";
import { round } from "./math.ts";
import type { Logger, Position, PositionSide, Tick } from "./types.ts";

export type BotConfig = {
  symbol: string;
  shortWindow: number;
  longWindow: number;
  orderQty: number;
  maxAbsPosition: number;
  fillDelayMs: FillDelay;
  fillPlan?: readonly FillPlanStep[];
  logger?: Logger;
};

export class PerpBot {
  private readonly strategy: MovingAverageSignal;
  private readonly risk: RiskManager;
  private readonly exchange: SimulatedExchange;
  private readonly positions: PositionBook;
  private readonly logger: Logger;
  private readonly pendingFills: Promise<void>[] = [];
  private readonly orderTracker = new InFlightOrderTracker();

  constructor(config: BotConfig) {
    this.strategy = new MovingAverageSignal(config.shortWindow, config.longWindow);
    this.risk = new RiskManager({
      orderQty: config.orderQty,
      maxAbsPosition: config.maxAbsPosition
    });
    this.exchange = new SimulatedExchange(config.fillDelayMs, 0.0004, config.fillPlan);
    this.positions = new PositionBook(config.symbol);
    this.logger = config.logger ?? console.log;
  }

  async onTick(tick: Tick): Promise<void> {
    this.logger(formatTick(tick));

    const signal = this.strategy.onTick(tick);
    this.logger(formatSignal(signal));

    const filledPosition = this.positions.get();
    const projectedPosition = projectPosition(filledPosition, this.orderTracker.getOpenOrders());
    this.logger(
      `[EXPOSURE] filled=${signedQty(filledPosition)} pending=${round(
        signedQty(projectedPosition) - signedQty(filledPosition)
      )} projected=${signedQty(projectedPosition)}`
    );

    const decision = this.risk.evaluate(signal, projectedPosition, tick);
    this.logger(formatRisk(decision));

    if (!decision.approved) {
      return;
    }

    const submitted = this.exchange.submit(decision.order);
    this.orderTracker.trackAck(submitted.ack);
    this.logger(formatAck(submitted.ack));

    const fillTasks = submitted.fills.map((fillPromise) =>
      fillPromise.then((fill) => {
        this.logger(formatFill(fill));
        const result = this.orderTracker.processFill(fill);
        this.logger(formatOrderState(result.order));
        if (!result.accepted) {
          return;
        }
        const position = this.positions.applyFill(fill);
        this.logger(formatPosition(position));
      })
    );

    this.pendingFills.push(...fillTasks);
  }

  async waitForIdle(): Promise<void> {
    await Promise.all(this.pendingFills);
  }

  getPosition(): Position {
    return this.positions.get();
  }
}

function projectPosition(position: Position, pendingOrders: Iterable<InFlightOrder>): Position {
  let projectedQty = signedQty(position);

  for (const order of pendingOrders) {
    projectedQty += order.side === "BUY" ? order.remainingQty : -order.remainingQty;
  }

  projectedQty = round(projectedQty);
  return {
    ...position,
    side: sideFromSignedQty(projectedQty),
    qty: Math.abs(projectedQty)
  };
}

function signedQty(position: Position): number {
  return position.side === "LONG" ? position.qty : position.side === "SHORT" ? -position.qty : 0;
}

function sideFromSignedQty(qty: number): PositionSide {
  return qty > 0 ? "LONG" : qty < 0 ? "SHORT" : "FLAT";
}
