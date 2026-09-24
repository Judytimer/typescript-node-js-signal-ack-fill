import { round } from "./math.ts";
import type { InFlightOrder } from "./order-tracker.ts";
import type { OrderSide, Position } from "./types.ts";

export type ExchangeOpenOrder = {
  orderId: string;
  side: OrderSide;
  remainingQty: number;
};

export type ExchangeStateSnapshot = {
  position: Position;
  openOrders: readonly ExchangeOpenOrder[];
};

export type ReconciliationIssue =
  | { type: "POSITION_MISMATCH"; localSignedQty: number; exchangeSignedQty: number }
  | { type: "MISSING_EXCHANGE_ORDER"; orderId: string }
  | { type: "UNEXPECTED_EXCHANGE_ORDER"; orderId: string }
  | {
      type: "ORDER_SIDE_MISMATCH";
      orderId: string;
      localSide: OrderSide;
      exchangeSide: OrderSide;
    }
  | {
      type: "ORDER_REMAINING_MISMATCH";
      orderId: string;
      localRemainingQty: number;
      exchangeRemainingQty: number;
    };

export type ReconciliationReport = {
  consistent: boolean;
  issues: ReconciliationIssue[];
};

/**
 * Read-only comparison boundary. It reports differences without guessing which
 * side to overwrite or mutating orders and positions during recovery.
 */
export function reconcileState(
  localPosition: Position,
  localOpenOrders: readonly InFlightOrder[],
  exchange: ExchangeStateSnapshot
): ReconciliationReport {
  if (localPosition.symbol !== exchange.position.symbol) {
    throw new Error(
      `exchange position symbol ${exchange.position.symbol} does not match ${localPosition.symbol}`
    );
  }

  const issues: ReconciliationIssue[] = [];
  const localSignedQty = signedQty(localPosition);
  const exchangeSignedQty = signedQty(exchange.position);
  if (localSignedQty !== exchangeSignedQty) {
    issues.push({ type: "POSITION_MISMATCH", localSignedQty, exchangeSignedQty });
  }

  const localById = uniqueByOrderId(localOpenOrders, "local");
  const exchangeById = uniqueByOrderId(exchange.openOrders, "exchange");

  for (const [orderId, localOrder] of localById) {
    const exchangeOrder = exchangeById.get(orderId);
    if (exchangeOrder === undefined) {
      issues.push({ type: "MISSING_EXCHANGE_ORDER", orderId });
      continue;
    }
    if (localOrder.side !== exchangeOrder.side) {
      issues.push({
        type: "ORDER_SIDE_MISMATCH",
        orderId,
        localSide: localOrder.side,
        exchangeSide: exchangeOrder.side
      });
      continue;
    }
    if (localOrder.remainingQty !== exchangeOrder.remainingQty) {
      issues.push({
        type: "ORDER_REMAINING_MISMATCH",
        orderId,
        localRemainingQty: localOrder.remainingQty,
        exchangeRemainingQty: exchangeOrder.remainingQty
      });
    }
  }

  for (const orderId of exchangeById.keys()) {
    if (!localById.has(orderId)) {
      issues.push({ type: "UNEXPECTED_EXCHANGE_ORDER", orderId });
    }
  }

  return { consistent: issues.length === 0, issues };
}

function uniqueByOrderId<T extends { orderId: string }>(
  orders: readonly T[],
  owner: "local" | "exchange"
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const order of orders) {
    if (byId.has(order.orderId)) {
      throw new Error(`duplicate ${owner} order ${order.orderId}`);
    }
    byId.set(order.orderId, order);
  }
  return byId;
}

function signedQty(position: Position): number {
  const qty = position.side === "LONG" ? position.qty : position.side === "SHORT" ? -position.qty : 0;
  return round(qty);
}
