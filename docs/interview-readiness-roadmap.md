# Interview Readiness｜完成度与剩余交付线

日期：2026-09-24  
目标：可运行、可解释的 Crypto Perpetual Exchange Trading Development 面试项目，而非真钱交易系统。

## 当前完成度

整体约 **75%**。这个比例只表示面试项目交付度，不表示 production readiness 或策略盈利能力。

| 能力 | 状态 | 当前证据 | 仍缺什么 |
| --- | --- | --- | --- |
| Order Lifecycle | 基本完成 | ACK、partial/multi-fill、out-of-order、duplicate、cancel intent/ack | reject、真正 execution/arrival 分离的 late fill |
| Position / Projected Position | 基本完成 | Fill 驱动净仓位；pending remaining qty 进入 projected exposure | 多品种与 venue position snapshot 收敛 |
| Deterministic Risk | 部分完成 | target-position delta、max position、initial-margin gate | reduce-only、显式 leverage constraint、close/reverse policy 字段 |
| Isolated Margin | 面试可演示 | equity、IM、MM、available margin、mark valuation | 交易所阶梯维持保证金和手续费细节 |
| Price Semantics | 面试可演示 | last / mark / index 分离 | exchange-grade mark derivation（当前不需要） |
| Funding | 最小完成 | rate、timestamp、side effect、idempotency | attribution 字段与 funding-triggered risk policy |
| Liquidation | 最小完成 | mark trigger 与 execution boundary 分离 | venue liquidation event 与 reopened exposure recovery |
| Recovery | 部分完成 | checkpoint、atomic save、unresolved order fail-closed | authoritative snapshot 驱动的恢复完成路径 |
| Reconciliation | 起步完成 | Position/order read-only mismatch report | resolution policy 与状态收敛 |
| Historical Replay | 基础设施完成 | T0、Shadow labels、predefined ground truth、runner | 3–5 个真实代表性案例 |
| Prospective Sampling | Roadmap | 已明确不阻塞求职版 | Freeze 后再开始未来样本 |

## 面试完成线：剩余四个里程碑

### M1｜Perp failure demo 收口 ✅

挑选现有 deterministic traces，形成一次可运行演示：

```text
Signal → Risk → ACK → Partial Fill → Position
Cancel Intent → CancelAck → CANCELED
Mark → Liquidation
Restart → Recovery Required → Reconciliation Report
```

不新增完整 Connector 或 EventLog。

当前可通过 `npm run demo` 重复运行上述三段 trace。

### M2｜最小 recovery completion（M2A evidence contract ✅）

M2A 已定义 authoritative recovery evidence contract；当前仍只验证 evidence，不修改本地状态。M2B 只有获得满足 contract 的真实 snapshot 后，才定义窄的恢复完成路径。当前只读 reconciliation 已足够发现差异，但尚不能安全解除 `RECOVERY_REQUIRED`。

### M3｜3–5 个真实 Historical Replay 案例

每个案例必须具备真实 T0、T0 前来源、预定义 outcome rule 和窗口结束后的 outcome。当前 `npm run replay` 只是 schema smoke，不计入样本。

### M4｜面试叙事与演示脚本

整理一条 10–15 分钟演示：架构图、两个 failure trace、一个 recovery/reconciliation trace、一个 Historical Replay record，以及明确的非目标。

## 暂不阻塞完成线

- Prospective Paper Sampling；
- Binance 实盘 Connector；
- Cross Margin；
- exchange-grade liquidation engine；
- 大型 UI / backtest；
- AI 自动 gating 或下单；
- Prediction / YES → PerpIntent 映射。

## 下一步

下一步准备 **M3：3–5 个真实 Historical Replay 案例**。M2 recovery mutation 继续等待 authoritative exchange evidence，不阻塞案例与面试材料整理。
