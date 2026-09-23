export type PositionSide = "FLAT" | "LONG" | "SHORT";
export type OrderSide = "BUY" | "SELL";
export type SignalAction = "HOLD" | "LONG" | "SHORT";

export type Tick = {
  seq: number;
  symbol: string;
  /** Most recent trade price; strategy signals and simulated limit orders use this. */
  lastPrice: number;
  /** Fair price used for unrealized PnL, margin, and liquidation checks. */
  markPrice: number;
  /** External spot-basket reference price; recorded but not traded directly. */
  indexPrice: number;
  ts: number;
};

export type Signal = {
  action: SignalAction;
  shortMa: number | null;
  longMa: number | null;
  reason: string;
};

export type OrderRequest = {
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
  reason: string;
  ts: number;
};

export type OrderAck = {
  orderId: string;
  status: "ACKED";
  request: OrderRequest;
  ts: number;
};

export type Fill = {
  fillId: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
  fee: number;
  ts: number;
};

export type Position = {
  symbol: string;
  side: PositionSide;
  qty: number;
  entryPrice: number;
  realizedPnl: number;
};

export type RiskDecision =
  | { approved: false; reason: string }
  | { approved: true; order: OrderRequest };

export type Logger = (line: string) => void;
