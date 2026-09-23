import { round } from "./math.ts";
import type { Fill, FundingSettlement, Position, PositionSide } from "./types.ts";

export type PositionBookState = {
  position: Position;
  processedFillIds: string[];
  processedFundingIds?: string[];
};

export type FundingResult = {
  accepted: boolean;
  payment: number;
  position: Position;
};

export class PositionBook {
  private position: Position;
  private readonly processedFillIds = new Set<string>();
  private readonly processedFundingIds = new Set<string>();

  constructor(symbol: string) {
    this.position = {
      symbol,
      side: "FLAT",
      qty: 0,
      entryPrice: 0,
      realizedPnl: 0
    };
  }

  get(): Position {
    return { ...this.position };
  }

  static fromState(state: PositionBookState): PositionBook {
    const book = new PositionBook(state.position.symbol);
    book.position = { ...state.position };
    for (const fillId of state.processedFillIds) {
      book.processedFillIds.add(fillId);
    }
    for (const fundingId of state.processedFundingIds ?? []) {
      book.processedFundingIds.add(fundingId);
    }
    return book;
  }

  exportState(): PositionBookState {
    return {
      position: this.get(),
      processedFillIds: [...this.processedFillIds],
      processedFundingIds: [...this.processedFundingIds]
    };
  }

  applyFill(fill: Fill): Position {
    if (this.processedFillIds.has(fill.fillId)) {
      return this.get();
    }

    const oldSignedQty = toSignedQty(this.position);
    const fillSignedQty = fill.side === "BUY" ? fill.qty : -fill.qty;
    const newSignedQty = round(oldSignedQty + fillSignedQty);

    let nextEntryPrice = this.position.entryPrice;
    let realizedPnl = this.position.realizedPnl - fill.fee;

    if (oldSignedQty === 0 || Math.sign(oldSignedQty) === Math.sign(fillSignedQty)) {
      const oldNotional = Math.abs(oldSignedQty) * this.position.entryPrice;
      const fillNotional = Math.abs(fillSignedQty) * fill.price;
      nextEntryPrice = (oldNotional + fillNotional) / Math.abs(newSignedQty);
    } else {
      const closedQty = Math.min(Math.abs(oldSignedQty), Math.abs(fillSignedQty));
      const pnlDirection = oldSignedQty > 0 ? 1 : -1;
      realizedPnl += closedQty * (fill.price - this.position.entryPrice) * pnlDirection;

      if (newSignedQty === 0) {
        nextEntryPrice = 0;
      } else if (Math.sign(newSignedQty) !== Math.sign(oldSignedQty)) {
        nextEntryPrice = fill.price;
      }
    }

    this.position = {
      symbol: this.position.symbol,
      side: toSide(newSignedQty),
      qty: Math.abs(newSignedQty),
      entryPrice: round(nextEntryPrice),
      realizedPnl: round(realizedPnl)
    };
    this.processedFillIds.add(fill.fillId);

    return this.get();
  }

  applyFunding(settlement: FundingSettlement): FundingResult {
    if (settlement.symbol !== this.position.symbol) {
      throw new Error(`funding symbol ${settlement.symbol} does not match ${this.position.symbol}`);
    }
    if (
      settlement.fundingId.length === 0 ||
      !Number.isFinite(settlement.rate) ||
      !Number.isFinite(settlement.markPrice) ||
      settlement.markPrice <= 0 ||
      !Number.isFinite(settlement.ts)
    ) {
      throw new Error("invalid funding settlement");
    }
    if (this.processedFundingIds.has(settlement.fundingId)) {
      return { accepted: false, payment: 0, position: this.get() };
    }

    // Positive rates transfer value from longs to shorts; negative rates reverse it.
    const payment = round(-toSignedQty(this.position) * settlement.markPrice * settlement.rate);
    this.position = {
      ...this.position,
      realizedPnl: round(this.position.realizedPnl + payment)
    };
    this.processedFundingIds.add(settlement.fundingId);
    return { accepted: true, payment, position: this.get() };
  }
}

function toSignedQty(position: Position): number {
  if (position.side === "LONG") {
    return position.qty;
  }

  if (position.side === "SHORT") {
    return -position.qty;
  }

  return 0;
}

function toSide(signedQty: number): PositionSide {
  if (signedQty > 0) {
    return "LONG";
  }

  if (signedQty < 0) {
    return "SHORT";
  }

  return "FLAT";
}
