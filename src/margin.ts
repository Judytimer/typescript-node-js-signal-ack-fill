import { round } from "./math.ts";
import type { Position } from "./types.ts";

export type MarginConfig = {
  collateral: number;
  leverage: number;
  maintenanceMarginRate: number;
};

export type MarginSnapshot = {
  collateral: number;
  markPrice: number;
  notional: number;
  unrealizedPnl: number;
  equity: number;
  initialMargin: number;
  maintenanceMargin: number;
  availableMargin: number;
  marginRatio: number;
  liquidatable: boolean;
};

export class IsolatedMarginAccount {
  private readonly config: MarginConfig;

  constructor(config: MarginConfig) {
    assertPositive(config.collateral, "collateral");
    assertPositive(config.leverage, "leverage");
    if (
      !Number.isFinite(config.maintenanceMarginRate) ||
      config.maintenanceMarginRate <= 0 ||
      config.maintenanceMarginRate >= 1
    ) {
      throw new Error("maintenanceMarginRate must be between 0 and 1");
    }
    this.config = { ...config };
  }

  snapshot(position: Position, markPrice: number): MarginSnapshot {
    assertPositive(markPrice, "markPrice");
    const signedQty = position.side === "LONG" ? position.qty : position.side === "SHORT" ? -position.qty : 0;
    const notional = round(Math.abs(signedQty) * markPrice);
    const unrealizedPnl = round(signedQty * (markPrice - position.entryPrice));
    const equity = round(this.config.collateral + position.realizedPnl + unrealizedPnl);
    const initialMargin = round((Math.abs(signedQty) * position.entryPrice) / this.config.leverage);
    const maintenanceMargin = round(notional * this.config.maintenanceMarginRate);
    const availableMargin = round(equity - initialMargin);
    const marginRatio = maintenanceMargin === 0 ? Infinity : round(equity / maintenanceMargin);

    return {
      collateral: this.config.collateral,
      markPrice,
      notional,
      unrealizedPnl,
      equity,
      initialMargin,
      maintenanceMargin,
      availableMargin,
      marginRatio,
      liquidatable: signedQty !== 0 && equity <= maintenanceMargin
    };
  }

  canSupport(position: Position, markPrice: number): boolean {
    const snapshot = this.snapshot(position, markPrice);
    return snapshot.equity >= snapshot.initialMargin;
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive`);
  }
}
