import { SimulatedExchange } from "./exchange.ts";
import type { FillDelay, FillPlanStep } from "./exchange.ts";
import {
  formatAck,
  formatAccount,
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
import { IsolatedMarginAccount } from "./margin.ts";
import type { MarginConfig, MarginSnapshot } from "./margin.ts";
import type { Logger, OrderRequest, Position, PositionSide, Tick } from "./types.ts";
import type { BotCheckpoint, BotStateStore } from "./state-store.ts";

export type BotConfig = {
  symbol: string;
  shortWindow: number;
  longWindow: number;
  orderQty: number;
  maxAbsPosition: number;
  fillDelayMs: FillDelay;
  fillPlan?: readonly FillPlanStep[];
  margin?: MarginConfig;
  stateStore?: BotStateStore;
  logger?: Logger;
};

export class PerpBot {
  private readonly strategy: MovingAverageSignal;
  private readonly risk: RiskManager;
  private readonly exchange: SimulatedExchange;
  private positions: PositionBook;
  private readonly logger: Logger;
  private readonly pendingFills: Promise<void>[] = [];
  private orderTracker = new InFlightOrderTracker();
  private readonly margin: IsolatedMarginAccount;
  private lastAccountSnapshot: MarginSnapshot | null = null;
  private halted = false;
  private recoveryRequired = false;
  private readonly stateStore?: BotStateStore;
  private persistTail: Promise<void> = Promise.resolve();

  constructor(config: BotConfig) {
    this.strategy = new MovingAverageSignal(config.shortWindow, config.longWindow);
    this.risk = new RiskManager({
      orderQty: config.orderQty,
      maxAbsPosition: config.maxAbsPosition
    });
    this.exchange = new SimulatedExchange(config.fillDelayMs, 0.0004, config.fillPlan);
    this.positions = new PositionBook(config.symbol);
    this.margin = new IsolatedMarginAccount(
      config.margin ?? { collateral: 10_000, leverage: 5, maintenanceMarginRate: 0.005 }
    );
    this.logger = config.logger ?? console.log;
    this.stateStore = config.stateStore;
  }

  static async create(config: BotConfig): Promise<PerpBot> {
    const bot = new PerpBot(config);
    await bot.restore();
    return bot;
  }

  async onTick(tick: Tick): Promise<void> {
    this.logger(formatTick(tick));

    const markedPosition = this.positions.get();
    this.lastAccountSnapshot = this.margin.snapshot(markedPosition, tick.price);
    this.logger(formatAccount(this.lastAccountSnapshot));

    if (this.recoveryRequired) {
      this.logger(`[RECOVERY] blocked openOrders=${this.orderTracker.getOpenOrders().length}`);
      return;
    }

    if (this.halted) {
      this.logger('[MARGIN_RISK] blocked reason="halted after liquidation"');
      return;
    }

    if (this.lastAccountSnapshot.liquidatable) {
      await this.liquidate(markedPosition, tick, this.lastAccountSnapshot);
      return;
    }

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

    const postOrderPosition = projectOrder(projectedPosition, decision.order);
    const postOrderAccount = this.margin.snapshot(postOrderPosition, tick.price);
    if (postOrderAccount.initialMargin > this.lastAccountSnapshot.equity) {
      this.logger(
        `[MARGIN_RISK] blocked requiredInitialMargin=${postOrderAccount.initialMargin} equity=${this.lastAccountSnapshot.equity}`
      );
      return;
    }
    this.logger(
      `[MARGIN_RISK] approved requiredInitialMargin=${postOrderAccount.initialMargin} equity=${this.lastAccountSnapshot.equity}`
    );

    const submitted = this.exchange.submit(decision.order);
    this.orderTracker.trackAck(submitted.ack);
    this.logger(formatAck(submitted.ack));
    await this.persist();

    const fillTasks = submitted.fills.map((fillPromise) =>
      fillPromise.then(async (fill) => {
        this.logger(formatFill(fill));
        const result = this.orderTracker.processFill(fill);
        this.logger(formatOrderState(result.order));
        if (!result.accepted) {
          return;
        }
        const position = this.positions.applyFill(fill);
        this.logger(formatPosition(position));
        this.lastAccountSnapshot = this.margin.snapshot(position, fill.price);
        this.logger(formatAccount(this.lastAccountSnapshot));
        await this.persist();
      })
    );

    this.pendingFills.push(...fillTasks);
  }

  async waitForIdle(): Promise<void> {
    await Promise.all(this.pendingFills);
    await this.persistTail;
  }

  getPosition(): Position {
    return this.positions.get();
  }

  getAccountSnapshot(): MarginSnapshot | null {
    return this.lastAccountSnapshot === null ? null : { ...this.lastAccountSnapshot };
  }

  isRecoveryRequired(): boolean {
    return this.recoveryRequired;
  }

  private async liquidate(position: Position, tick: Tick, snapshot: MarginSnapshot): Promise<void> {
    for (const canceled of this.orderTracker.cancelOpenOrders()) {
      this.logger(formatOrderState(canceled));
    }

    const side = position.side === "LONG" ? "SELL" : "BUY";
    const fill = {
      fillId: `LIQ-${tick.seq}-FILL-1`,
      orderId: `LIQ-${tick.seq}`,
      symbol: position.symbol,
      side,
      qty: position.qty,
      price: tick.price,
      fee: 0,
      ts: tick.ts
    } as const;
    this.logger(
      `[LIQUIDATION] side=${side} qty=${position.qty} mark=${tick.price} equity=${snapshot.equity} maintenanceMargin=${snapshot.maintenanceMargin}`
    );
    const closedPosition = this.positions.applyFill(fill);
    this.logger(formatPosition(closedPosition));
    this.lastAccountSnapshot = this.margin.snapshot(closedPosition, tick.price);
    this.logger(formatAccount(this.lastAccountSnapshot));
    this.halted = true;
    await this.persist();
  }

  private async restore(): Promise<void> {
    if (this.stateStore === undefined) {
      return;
    }
    const checkpoint = await this.stateStore.load();
    if (checkpoint === null) {
      return;
    }
    if (checkpoint.symbol !== this.positions.get().symbol) {
      throw new Error(
        `checkpoint symbol ${checkpoint.symbol} does not match bot symbol ${this.positions.get().symbol}`
      );
    }

    this.positions = PositionBook.fromState(checkpoint.positionState);
    this.orderTracker = InFlightOrderTracker.fromState(checkpoint.orderTrackerState);
    this.exchange.restoreNextOrderId(checkpoint.nextOrderId);
    this.halted = checkpoint.halted;
    this.recoveryRequired = this.orderTracker.getOpenOrders().length > 0;
    if (checkpoint.lastMarkPrice !== null) {
      this.lastAccountSnapshot = this.margin.snapshot(this.positions.get(), checkpoint.lastMarkPrice);
    }
    this.logger(
      `[RECOVERY] restored position=${this.positions.get().side} openOrders=${this.orderTracker.getOpenOrders().length} nextOrderId=${checkpoint.nextOrderId}`
    );
  }

  private persist(): Promise<void> {
    if (this.stateStore === undefined) {
      return Promise.resolve();
    }
    this.persistTail = this.persistTail.then(() => this.stateStore?.save(this.buildCheckpoint()));
    return this.persistTail;
  }

  private buildCheckpoint(): BotCheckpoint {
    return {
      version: 1,
      symbol: this.positions.get().symbol,
      positionState: this.positions.exportState(),
      orderTrackerState: this.orderTracker.exportState(),
      nextOrderId: this.exchange.getNextOrderId(),
      halted: this.halted,
      lastMarkPrice: this.lastAccountSnapshot?.markPrice ?? null
    };
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

function projectOrder(position: Position, order: OrderRequest): Position {
  const oldQty = signedQty(position);
  const orderQty = order.side === "BUY" ? order.qty : -order.qty;
  const nextQty = round(oldQty + orderQty);
  let entryPrice = position.entryPrice;

  if (nextQty === 0) {
    entryPrice = 0;
  } else if (oldQty === 0 || Math.sign(oldQty) !== Math.sign(nextQty)) {
    entryPrice = order.price;
  } else if (Math.sign(oldQty) === Math.sign(orderQty)) {
    entryPrice = round(
      (Math.abs(oldQty) * position.entryPrice + Math.abs(orderQty) * order.price) / Math.abs(nextQty)
    );
  }

  return {
    ...position,
    side: sideFromSignedQty(nextQty),
    qty: Math.abs(nextQty),
    entryPrice
  };
}
