import { round } from "./math.ts";
import type { CancelAck, Fill, OrderAck, OrderSide } from "./types.ts";

export type InFlightOrderStatus =
  | "ACKED"
  | "PARTIALLY_FILLED"
  | "CANCEL_REQUESTED"
  | "FILLED"
  | "CANCELED";

export type InFlightOrder = {
  orderId: string;
  side: OrderSide;
  originalQty: number;
  filledQty: number;
  remainingQty: number;
  status: InFlightOrderStatus;
};

export type FillProcessResult = {
  accepted: boolean;
  order: InFlightOrder;
};

type TrackedOrder = {
  order: InFlightOrder;
  symbol: string;
  processedFillIds: Set<string>;
};

export type OrderTrackerState = {
  orders: Array<{
    order: InFlightOrder;
    symbol: string;
    processedFillIds: string[];
  }>;
};

export class InFlightOrderTracker {
  private readonly orders = new Map<string, TrackedOrder>();

  static fromState(state: OrderTrackerState): InFlightOrderTracker {
    const tracker = new InFlightOrderTracker();
    for (const item of state.orders) {
      if (tracker.orders.has(item.order.orderId)) {
        throw new Error(`duplicate restored order ${item.order.orderId}`);
      }
      tracker.orders.set(item.order.orderId, {
        order: { ...item.order },
        symbol: item.symbol,
        processedFillIds: new Set(item.processedFillIds)
      });
    }
    return tracker;
  }

  exportState(): OrderTrackerState {
    return {
      orders: [...this.orders.values()].map((tracked) => ({
        order: { ...tracked.order },
        symbol: tracked.symbol,
        processedFillIds: [...tracked.processedFillIds]
      }))
    };
  }

  trackAck(ack: OrderAck): InFlightOrder {
    if (this.orders.has(ack.orderId)) {
      throw new Error(`order ${ack.orderId} is already tracked`);
    }

    const order: InFlightOrder = {
      orderId: ack.orderId,
      side: ack.request.side,
      originalQty: ack.request.qty,
      filledQty: 0,
      remainingQty: ack.request.qty,
      status: "ACKED"
    };
    this.orders.set(ack.orderId, {
      order,
      symbol: ack.request.symbol,
      processedFillIds: new Set<string>()
    });
    return { ...order };
  }

  processFill(fill: Fill): FillProcessResult {
    const tracked = this.orders.get(fill.orderId);
    if (tracked === undefined) {
      throw new Error(`fill ${fill.fillId} belongs to unknown order ${fill.orderId}`);
    }

    if (tracked.order.status === "CANCELED") {
      return { accepted: false, order: { ...tracked.order } };
    }

    if (tracked.processedFillIds.has(fill.fillId)) {
      return { accepted: false, order: { ...tracked.order } };
    }

    if (fill.symbol !== tracked.symbol || fill.side !== tracked.order.side) {
      throw new Error(`fill ${fill.fillId} does not match order ${fill.orderId}`);
    }
    if (fill.qty <= 0 || fill.qty > tracked.order.remainingQty) {
      throw new Error(`fill ${fill.fillId} exceeds remaining quantity`);
    }

    const filledQty = round(tracked.order.filledQty + fill.qty);
    const remainingQty = round(tracked.order.originalQty - filledQty);
    tracked.order = {
      ...tracked.order,
      filledQty,
      remainingQty,
      status: remainingQty === 0 ? "FILLED" : "PARTIALLY_FILLED"
    };
    tracked.processedFillIds.add(fill.fillId);

    return { accepted: true, order: { ...tracked.order } };
  }

  requestCancelOpenOrders(): InFlightOrder[] {
    const requested: InFlightOrder[] = [];
    for (const tracked of this.orders.values()) {
      if (tracked.order.status === "ACKED" || tracked.order.status === "PARTIALLY_FILLED") {
        tracked.order = { ...tracked.order, status: "CANCEL_REQUESTED" };
        requested.push({ ...tracked.order });
      }
    }
    return requested;
  }

  processCancelAck(ack: CancelAck): InFlightOrder {
    const tracked = this.orders.get(ack.orderId);
    if (tracked === undefined) {
      throw new Error(`cancel acknowledgment belongs to unknown order ${ack.orderId}`);
    }
    if (tracked.order.status !== "CANCEL_REQUESTED") {
      throw new Error(`order ${ack.orderId} is not awaiting cancel confirmation`);
    }

    tracked.order = { ...tracked.order, status: "CANCELED" };
    return { ...tracked.order };
  }

  get(orderId: string): InFlightOrder | undefined {
    const tracked = this.orders.get(orderId);
    return tracked === undefined ? undefined : { ...tracked.order };
  }

  getOpenOrders(): InFlightOrder[] {
    return [...this.orders.values()]
      .filter(
        (tracked) =>
          tracked.order.status === "ACKED" ||
          tracked.order.status === "PARTIALLY_FILLED" ||
          tracked.order.status === "CANCEL_REQUESTED"
      )
      .map((tracked) => ({ ...tracked.order }));
  }
}
