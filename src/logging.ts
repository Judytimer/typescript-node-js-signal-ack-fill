import type { Fill, OrderAck, Position, RiskDecision, Signal, Tick } from "./types.ts";
import type { InFlightOrder } from "./order-tracker.ts";

export function formatTick(tick: Tick): string {
  return `[TICK] seq=${tick.seq} symbol=${tick.symbol} price=${tick.price}`;
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
  return `[ACK] orderId=${ack.orderId} side=${ack.request.side} qty=${ack.request.qty} price=${ack.request.price}`;
}

export function formatFill(fill: Fill): string {
  return `[FILL] fillId=${fill.fillId} orderId=${fill.orderId} side=${fill.side} qty=${fill.qty} price=${fill.price} fee=${fill.fee.toFixed(
    4
  )}`;
}

export function formatOrderState(order: InFlightOrder): string {
  return `[ORDER] orderId=${order.orderId} status=${order.status} filled=${order.filledQty} remaining=${order.remainingQty}`;
}

export function formatPosition(position: Position): string {
  return `[POSITION] side=${position.side} qty=${position.qty} entry=${position.entryPrice} realizedPnl=${position.realizedPnl}`;
}

function display(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}
