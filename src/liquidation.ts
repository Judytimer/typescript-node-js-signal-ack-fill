import type { Fill, Position, Tick } from "./types.ts";

export type LiquidationExecution = {
  triggerMarkPrice: number;
  executionPrice: number;
  fill: Fill;
};

/**
 * Minimal paper executor boundary. The mark decides whether liquidation is
 * required; this component owns the resulting execution fact.
 *
 * Paper simplification: liquidation execution is currently assumed at mark.
 * A venue adapter may later model slippage without changing trigger semantics.
 */
export class PaperLiquidationExecutor {
  execute(position: Position, tick: Tick): LiquidationExecution {
    const executionPrice = tick.markPrice;
    const side = position.side === "LONG" ? "SELL" : "BUY";
    const fill: Fill = {
      fillId: `LIQ-${tick.seq}-FILL-1`,
      clientOrderId: `LIQ-${tick.seq}`,
      exchangeOrderId: `PAPER-LIQ-${tick.seq}`,
      symbol: position.symbol,
      side,
      qty: position.qty,
      price: executionPrice,
      fee: 0,
      ts: tick.ts
    };

    return { triggerMarkPrice: tick.markPrice, executionPrice, fill };
  }
}
