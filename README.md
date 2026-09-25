# Minimal Perp Quant Bot

一个只跑本地模拟的 TypeScript + Node.js 永续合约量化机器人。它不连接交易所、不碰真钱、不做 UI，也不是完整回测框架。

## 数据流

```text
simulateMarket
  -> MovingAverageSignal
  -> RiskManager
  -> SimulatedExchange ACK
  -> delayed FILL
  -> PositionBook
  -> console logs
```

风控使用 `已成交 Position + 已 ACK 未 Fill 的 Pending Orders` 计算预计仓位，避免 Fill 延迟期间重复下单。Pending 以 `orderId` 关联，因此模拟 Fill 乱序时仍能删除正确的在途订单。

订单生命周期由 `InFlightOrderTracker` 持有：成交路径为 `ACKED -> PARTIALLY_FILLED -> FILLED`；撤单路径为 `ACKED/PARTIALLY_FILLED -> CANCEL_REQUESTED -> CANCELED`。只有 `SimulatedExchange` 返回 `CancelAck` 后 tracker 才能确认 `CANCELED`。发生 Partial Fill 后，预计仓位使用已成交 Position 加订单 `remainingQty`，不会把整张原始订单重复计入，也不会过早移除 Pending。

第二轮加入了最小逐仓保证金账户。行情明确区分 `lastPrice / markPrice / indexPrice`：Baseline 双均线和模拟订单价格只使用 last，逐仓账户、未实现盈亏与强平触发只使用 mark，index 目前仅代表外部参考输入；本模拟器没有实现交易所级 mark-price 推导。强平触发与执行已分开建模，但当前 paper simplification 仍假设 `liquidation execution price = mark price`，日志会同时记录 trigger mark 与 execution price。下单前检查目标仓位初始保证金，`equity <= maintenanceMargin` 时模拟强平、取消本地在途订单并停止策略继续下单。它仍然只是 paper model，不代表真实交易所清算流程。

第三轮加入版本化 checkpoint。ACK、有效 Fill 和模拟强平后会原子写入 `.runtime/perp-bot-state.json`，保存仓位、Fill 幂等集合、订单状态和下一模拟订单编号。正常完成的状态可恢复；如果重启时仍有 unresolved order，机器人进入 `RECOVERY_REQUIRED` 并停止下单，不猜测该订单最终是否成交。

Reconciliation 目前提供只读比较边界：输入本地 Position / open orders 与权威 exchange snapshot，报告 position mismatch、missing/unexpected order 和 remaining quantity mismatch。它不会自动覆盖任一侧状态；恢复策略仍保持 fail-closed。

Recovery Evidence contract 进一步要求 venue/account/symbol identity、`asOf`、完整 open-orders 声明、权威 position、terminal order facts 与 checkpoint 后 fills。该 contract 只验证 evidence 是否足够进入未来 M2B 设计，不修改本地状态，也不包含 fresh mark。

Funding 作为独立结算事件输入：事件携带 `fundingId / rate / markPrice / ts`，正费率下多仓支付、空仓收取，负费率方向相反。Funding 修改 realized equity，但无权覆盖最新 market mark；`fundingId` 会进入 checkpoint，以保证重启后的重复结算仍然幂等。当前不包含 funding alpha 或交易所费率预测。

Historical Replay 提供最小研究记录边界：Baseline 与 AI Shadow 同时留档，所有证据必须满足 T0，Ground Truth 规则必须在 T0 前定义，outcome 只能在预设窗口结束后记录。该 runner 只产出研究记录，不把 Shadow verdict 映射成订单或 PerpIntent。

```bash
npm run replay
```

该命令输出 schema smoke fixture，以及第一个真实事件 replay：2024-01-09 SEC X 账号被入侵事件。真实事件缺少项目在 T0 留存的原始快照，Shadow 也由事后重放，因此明确标记为 `QUALITATIVE_ONLY`；它不能计入 AI vs Baseline 的正式成绩，也不会为了凑满 3 个案例而被包装成无泄漏样本。

## 运行

```bash
npm start
npm run demo
```

`npm run demo` 会依次展示 Partial Fill 生命周期、exchange-confirmed cancel 后的模拟强平，以及 restart 后的只读 reconciliation report。

你会看到类似这些日志：

```text
[TICK] ...
[SIGNAL] ...
[RISK] approved ...
[ACK] ...
[FILL] ...
[POSITION] ...
```

## 测试

```bash
npm test
```

测试覆盖了核心闭环：价格 tick 触发双均线信号，风控批准订单，模拟交易所先 ACK，延迟 Fill 后更新 Position；也覆盖 projected position、乱序 Fill、目标仓位 delta 和跨零 Partial Fill。

实验过程、故障日志与字段卡见 [`docs/learning-report.md`](docs/learning-report.md)。

## 代码入口

- `src/index.ts`: 可运行示例
- `src/bot.ts`: 闭环编排
- `src/market.ts`: 模拟行情
- `src/strategy.ts`: 简单双均线信号
- `src/risk.ts`: 最小风控
- `src/exchange.ts`: 模拟 ACK 和延迟 Fill
- `src/order-tracker.ts`: In-flight order、累计成交、剩余数量与状态
- `src/margin.ts`: 逐仓权益、保证金门槛与强平条件
- `src/state-store.ts`: 版本化 checkpoint 与原子 JSON 文件存储
- `src/reconciliation.ts`: 本地状态与 exchange snapshot 的只读一致性报告
- `src/recovery-evidence.ts`: M2A authoritative recovery evidence contract 与 validation
- `src/historical-replay.ts`: T0-safe Historical Replay schema 与研究记录 runner
- `src/position.ts`: 持仓更新
- `src/logging.ts`: 日志格式

> 运行依赖 Node.js 22 的 `--experimental-strip-types`，所以不需要安装 TypeScript 编译器。

## Meme + Prediction Overlay

另有一条纯模拟策略链：Meme 现货明显上涨后，不增加现货仓位，而是在固定最大 premium 风险预算内 paper BUY 更高 FDV 目标的 YES；YES 价格达到退出阈值后 paper SELL 全部份额。

```bash
npm run overlay
```

这条链复用现有 `OrderRequest -> SimulatedExchange -> ACK -> Pending -> Fill`，并新增 Prediction 专用策略、风险与 long-only YES 仓位账本。`ResearchContext` 已预留，但当前只有确定性的 `MockResearchContext`，不连接 News、X、Reddit 或真实 Prediction Market。

实现说明和未经验证的假设见 [`docs/overlay-learning-report.md`](docs/overlay-learning-report.md)。

Partial Fill 实验见 [`docs/partial-fill-learning-report.md`](docs/partial-fill-learning-report.md)。

逐仓保证金与模拟强平说明见 [`docs/isolated-margin-learning-report.md`](docs/isolated-margin-learning-report.md)。

持久化与重启恢复说明见 [`docs/checkpoint-recovery-learning-report.md`](docs/checkpoint-recovery-learning-report.md)。
