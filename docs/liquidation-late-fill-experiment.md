# Liquidation × Late Fill：复现实验

## Scope

本轮只复现事故，不修改订单或持仓处理规则。

## Deterministic event order

```text
SIM-1 BUY fill
→ Position LONG 0.01
→ SIM-2 reversal SELL 0.02 ACK
→ SIM-2 fill remains delayed
→ mark falls to liquidation threshold
→ SIM-2 locally becomes CANCELED
→ liquidation fill closes LONG
→ Position FLAT
→ delayed SIM-2 fill arrives
→ InFlightOrderTracker returns accepted=false because status=CANCELED
→ Position remains FLAT
```

覆盖该交错的测试是 `documents current cancel-then-late-fill behavior after liquidation`。

## Observed ownership and state

| Moment | SIM-2 order state | Position |
| --- | --- | --- |
| reversal ACK | `ACKED` | `LONG 0.01` |
| local liquidation cancel | `CANCELED` | `LONG 0.01` |
| liquidation fill | `CANCELED` | `FLAT` |
| delayed exchange fill | `CANCELED` | `FLAT` |

`SimulatedExchange` 已经创建并排队的 Fill promise 不会因本地 `cancelOpenOrders()` 而消失。Fill 仍会到达 Bot；当前 `InFlightOrderTracker.processFill()` 因订单已是 `CANCELED` 而返回 `accepted=false`，所以该 Fill 不进入 `PositionBook`。

## Broken invariant / unresolved semantic

> 本地 `CANCELED` 状态不能证明交易所侧没有发生成交。

当前实现把本地取消状态当成拒绝后续 Fill 的充分条件。如果这个 late Fill 代表交易所已经发生且随后才送达的成交事实，系统会漏记真实 exposure，并错误地保持 `FLAT`。

本实验不决定 late Fill 应被接受还是拒绝。下一步必须先明确 Cancel ACK、撮合时间与事件到达时间的语义，再决定状态机和 reconciliation 规则。
