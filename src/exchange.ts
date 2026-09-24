import { round } from "./math.ts";
import type { CancelAck, Fill, OrderAck, OrderRequest } from "./types.ts";

export type SubmittedOrder = {
  ack: OrderAck;
  fills: Promise<Fill | null>[];
};

export type FillDelay = number | ((orderId: string, order: OrderRequest) => number);
export type FillPlanStep = {
  fraction: number;
  delayMs: number;
};

export class SimulatedExchange {
  private nextOrderId = 1;
  private readonly orders = new Map<
    string,
    { request: OrderRequest; executedQty: number; status: "OPEN" | "CANCELED" | "FILLED" }
  >();
  private readonly fillDelayMs: FillDelay;
  private readonly feeRate: number;
  private readonly fillPlan?: readonly FillPlanStep[];

  constructor(fillDelayMs: FillDelay, feeRate = 0.0004, fillPlan?: readonly FillPlanStep[]) {
    this.fillDelayMs = fillDelayMs;
    this.feeRate = feeRate;
    validateFillPlan(fillPlan);
    this.fillPlan = fillPlan;
  }

  restoreNextOrderId(nextOrderId: number): void {
    if (!Number.isInteger(nextOrderId) || nextOrderId < 1) {
      throw new Error("nextOrderId must be a positive integer");
    }
    this.nextOrderId = nextOrderId;
  }

  getNextOrderId(): number {
    return this.nextOrderId;
  }

  submit(order: OrderRequest): SubmittedOrder {
    const orderId = `SIM-${this.nextOrderId++}`;
    this.orders.set(orderId, { request: order, executedQty: 0, status: "OPEN" });
    const ack: OrderAck = {
      orderId,
      status: "ACKED",
      request: order,
      ts: Date.now()
    };

    const delayMs =
      typeof this.fillDelayMs === "function"
        ? this.fillDelayMs(orderId, order)
        : this.fillDelayMs;
    const plan = this.fillPlan ?? [{ fraction: 1, delayMs }];
    let allocatedQty = 0;
    const fills = plan.map((step, index) => {
      const qty =
        index === plan.length - 1
          ? round(order.qty - allocatedQty)
          : round(order.qty * step.fraction);
      allocatedQty = round(allocatedQty + qty);

      return new Promise<Fill | null>((resolve) => {
        setTimeout(() => {
          const venueOrder = this.orders.get(orderId);
          if (venueOrder === undefined) {
            throw new Error(`missing simulated order ${orderId}`);
          }
          if (venueOrder.status === "CANCELED") {
            resolve(null);
            return;
          }

          venueOrder.executedQty = round(venueOrder.executedQty + qty);
          if (venueOrder.executedQty === order.qty) {
            venueOrder.status = "FILLED";
          }
          resolve({
            fillId: `${orderId}-FILL-${index + 1}`,
            orderId,
            symbol: order.symbol,
            side: order.side,
            qty,
            price: order.price,
            fee: qty * order.price * this.feeRate,
            ts: Date.now()
          });
        }, step.delayMs);
      });
    });

    return { ack, fills };
  }

  async requestCancel(orderId: string): Promise<CancelAck> {
    const order = this.orders.get(orderId);
    if (order === undefined) {
      throw new Error(`cannot cancel unknown order ${orderId}`);
    }
    if (order.status !== "OPEN") {
      throw new Error(`cannot cancel ${order.status.toLowerCase()} order ${orderId}`);
    }

    order.status = "CANCELED";
    return { orderId, status: "CANCELED", ts: Date.now() };
  }
}

function validateFillPlan(fillPlan?: readonly FillPlanStep[]): void {
  if (fillPlan === undefined) {
    return;
  }
  if (fillPlan.length === 0) {
    throw new Error("fillPlan must contain at least one step");
  }

  const totalFraction = fillPlan.reduce((total, step) => {
    if (step.fraction <= 0 || step.delayMs < 0) {
      throw new Error("fillPlan fractions must be positive and delays must be non-negative");
    }
    return total + step.fraction;
  }, 0);
  if (Math.abs(totalFraction - 1) > 1e-9) {
    throw new Error("fillPlan fractions must sum to 1");
  }
}
