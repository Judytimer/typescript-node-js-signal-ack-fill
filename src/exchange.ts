import { round } from "./math.ts";
import type { Fill, OrderAck, OrderRequest } from "./types.ts";

export type SubmittedOrder = {
  ack: OrderAck;
  fills: Promise<Fill>[];
};

export type FillDelay = number | ((orderId: string, order: OrderRequest) => number);
export type FillPlanStep = {
  fraction: number;
  delayMs: number;
};

export class SimulatedExchange {
  private nextOrderId = 1;
  private readonly fillDelayMs: FillDelay;
  private readonly feeRate: number;
  private readonly fillPlan?: readonly FillPlanStep[];

  constructor(fillDelayMs: FillDelay, feeRate = 0.0004, fillPlan?: readonly FillPlanStep[]) {
    this.fillDelayMs = fillDelayMs;
    this.feeRate = feeRate;
    validateFillPlan(fillPlan);
    this.fillPlan = fillPlan;
  }

  submit(order: OrderRequest): SubmittedOrder {
    const orderId = `SIM-${this.nextOrderId++}`;
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

      return new Promise<Fill>((resolve) => {
        setTimeout(() => {
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
