import type { OrderSide, PositionSide } from "./types.ts";

export type RecoveryPositionFact = {
  symbol: string;
  side: PositionSide;
  qty: number;
};

export type RecoveryOpenOrderFact = {
  orderId: string;
  side: OrderSide;
  remainingQty: number;
};

export type RecoveryTerminalOrderFact = {
  orderId: string;
  status: "FILLED" | "CANCELED" | "REJECTED" | "EXPIRED";
};

export type RecoveryFillFact = {
  fillId: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
  fee: number;
  ts: number;
};

export type RecoveryEvidence = {
  venue: string;
  accountId: string;
  symbol: string;
  asOf: number;
  openOrdersComplete: true;
  position: RecoveryPositionFact;
  openOrders: readonly RecoveryOpenOrderFact[];
  terminalOrders: readonly RecoveryTerminalOrderFact[];
  fillsSinceCheckpoint: readonly RecoveryFillFact[];
};

/**
 * Validates evidence sufficiency only. It does not mutate local state, decide
 * how mismatches converge, or certify that recovery may be cleared.
 */
export function validateRecoveryEvidence(
  value: unknown,
  unresolvedLocalOrderIds: readonly string[]
): RecoveryEvidence {
  if (!isRecord(value)) {
    throw new Error("recovery evidence must be an object");
  }
  if ("markPrice" in value) {
    throw new Error("fresh mark must come from a market Tick, not recovery evidence");
  }
  for (const field of ["venue", "accountId", "symbol"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      throw new Error(`${field} is required`);
    }
  }
  if (!Number.isFinite(value.asOf)) {
    throw new Error("asOf is required");
  }
  if (value.openOrdersComplete !== true) {
    throw new Error("open-orders snapshot must be complete");
  }
  if (!isRecoveryPosition(value.position, value.symbol)) {
    throw new Error("invalid authoritative position");
  }
  if (!Array.isArray(value.openOrders) || !value.openOrders.every(isOpenOrder)) {
    throw new Error("invalid open-orders snapshot");
  }
  if (!Array.isArray(value.terminalOrders) || !value.terminalOrders.every(isTerminalOrder)) {
    throw new Error("invalid terminal-order evidence");
  }
  if (!Array.isArray(value.fillsSinceCheckpoint) || !value.fillsSinceCheckpoint.every(isFill)) {
    throw new Error("invalid fill evidence");
  }

  assertUnique(value.openOrders, "orderId", "open order");
  assertUnique(value.terminalOrders, "orderId", "terminal order");
  assertUnique(value.fillsSinceCheckpoint, "fillId", "fill");

  const openOrderIds = new Set(value.openOrders.map((fact: RecoveryOpenOrderFact) => fact.orderId));
  for (const fact of value.terminalOrders as RecoveryTerminalOrderFact[]) {
    if (openOrderIds.has(fact.orderId)) {
      throw new Error(`order ${fact.orderId} cannot be both open and terminal`);
    }
  }
  for (const fill of value.fillsSinceCheckpoint as RecoveryFillFact[]) {
    if (fill.symbol !== value.symbol) {
      throw new Error(`fill ${fill.fillId} does not match recovery symbol ${value.symbol}`);
    }
    if (fill.ts > value.asOf) {
      throw new Error(`fill ${fill.fillId} occurs after recovery snapshot`);
    }
  }

  const terminalOrderIds = new Set(
    value.terminalOrders.map((fact: RecoveryTerminalOrderFact) => fact.orderId)
  );
  const orderIdsWithFills = new Set(
    value.fillsSinceCheckpoint.map((fill: RecoveryFillFact) => fill.orderId)
  );
  for (const orderId of unresolvedLocalOrderIds) {
    if (!terminalOrderIds.has(orderId) && !orderIdsWithFills.has(orderId)) {
      throw new Error(`insufficient evidence for unresolved order ${orderId}`);
    }
  }

  return structuredClone(value) as RecoveryEvidence;
}

function isRecoveryPosition(value: unknown, symbol: unknown): value is RecoveryPositionFact {
  return (
    isRecord(value) &&
    value.symbol === symbol &&
    (value.side === "FLAT" || value.side === "LONG" || value.side === "SHORT") &&
    isNonNegativeNumber(value.qty)
  );
}

function isOpenOrder(value: unknown): value is RecoveryOpenOrderFact {
  return (
    isRecord(value) &&
    isNonEmptyString(value.orderId) &&
    (value.side === "BUY" || value.side === "SELL") &&
    isNonNegativeNumber(value.remainingQty)
  );
}

function isTerminalOrder(value: unknown): value is RecoveryTerminalOrderFact {
  return (
    isRecord(value) &&
    isNonEmptyString(value.orderId) &&
    ["FILLED", "CANCELED", "REJECTED", "EXPIRED"].includes(String(value.status))
  );
}

function isFill(value: unknown): value is RecoveryFillFact {
  return (
    isRecord(value) &&
    isNonEmptyString(value.fillId) &&
    isNonEmptyString(value.orderId) &&
    isNonEmptyString(value.symbol) &&
    (value.side === "BUY" || value.side === "SELL") &&
    isPositiveNumber(value.qty) &&
    isPositiveNumber(value.price) &&
    isNonNegativeNumber(value.fee) &&
    Number.isFinite(value.ts)
  );
}

function assertUnique<T extends Record<K, string>, K extends keyof T>(
  values: readonly T[],
  key: K,
  label: string
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value[key])) {
      throw new Error(`duplicate ${label} ${value[key]}`);
    }
    seen.add(value[key]);
  }
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
