import type {
  CancelAck,
  Fill,
  FundingSettlement,
  OrderAck,
  Position,
  RiskDecision,
  Signal,
  Tick
} from "./types.ts";
import type { InFlightOrder } from "./order-tracker.ts";
import type { MarginSnapshot } from "./margin.ts";

export function formatTick(tick: Tick): string {
  return `[TICK] seq=${tick.seq} symbol=${tick.symbol} last=${tick.lastPrice} mark=${tick.markPrice} index=${tick.indexPrice}`;
}

export function formatSignal(signal: Signal): string {
  return `[SIGNAL] action=${signal.action} shortMa=${display(signal.shortMa)} longMa=${display(
    signal.longMa
  )} reason="${signal.reason}"`;
}

export function formatRisk(decision: RiskDecision): string {
  if (!decision.approved) {
    return `[RISK] blocked reason="${decision.reason}"`;
  }

  return `[RISK] approved side=${decision.order.side} qty=${decision.order.qty} price=${decision.order.price}`;
}

export function formatAck(ack: OrderAck): string {
  return `[ACK] clientOrderId=${ack.clientOrderId} exchangeOrderId=${ack.exchangeOrderId} side=${ack.request.side} qty=${ack.request.qty} price=${ack.request.price}`;
}

export function formatCancelAck(ack: CancelAck): string {
  return `[CANCEL_ACK] clientOrderId=${ack.clientOrderId} exchangeOrderId=${ack.exchangeOrderId} status=${ack.status} ts=${ack.ts}`;
}

export function formatFill(fill: Fill): string {
  return `[FILL] fillId=${fill.fillId} clientOrderId=${fill.clientOrderId} exchangeOrderId=${fill.exchangeOrderId} side=${fill.side} qty=${fill.qty} price=${fill.price} fee=${fill.fee.toFixed(
    4
  )}`;
}

export function formatFunding(settlement: FundingSettlement, payment: number): string {
  return `[FUNDING] fundingId=${settlement.fundingId} rate=${settlement.rate} settlementMark=${settlement.markPrice} payment=${payment} ts=${settlement.ts}`;
}

export function formatOrderState(order: InFlightOrder): string {
  return `[ORDER] clientOrderId=${order.clientOrderId} exchangeOrderId=${order.exchangeOrderId ?? "pending"} status=${order.status} filled=${order.filledQty} remaining=${order.remainingQty}`;
}

export function formatAccount(snapshot: MarginSnapshot): string {
  return `[ACCOUNT] mark=${snapshot.markPrice} equity=${snapshot.equity} unrealizedPnl=${snapshot.unrealizedPnl} initialMargin=${snapshot.initialMargin} maintenanceMargin=${snapshot.maintenanceMargin} availableMargin=${snapshot.availableMargin} marginRatio=${snapshot.marginRatio}`;
}

export function formatPosition(position: Position): string {
  return `[POSITION] side=${position.side} qty=${position.qty} entry=${position.entryPrice} realizedPnl=${position.realizedPnl}`;
}

function display(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}
