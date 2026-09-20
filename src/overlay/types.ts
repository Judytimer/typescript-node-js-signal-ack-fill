import type { OrderRequest } from "../types.ts";

export type ResearchSnapshot = {
  seq: number;
  ts: number;
  meme: {
    symbol: string;
    spotPrice: number;
    fdv: number;
  };
  prediction: {
    marketId: string;
    question: string;
    targetFdv: number;
    yesPrice: number;
  };
};

export interface ResearchContext {
  next(): ResearchSnapshot | null;
}

export type OverlayAction = "HOLD" | "BUY_YES" | "SELL_YES";

export type OverlaySignal = {
  action: OverlayAction;
  marketId: string;
  yesPrice: number;
  ts: number;
  reason: string;
};

export type OverlayRiskDecision =
  | { approved: false; reason: string }
  | { approved: true; order: OrderRequest };

export type PredictionPosition = {
  marketId: string;
  shares: number;
  averageEntryPrice: number;
  premiumAtRisk: number;
  realizedPnl: number;
};
