---
title: "Calm-Trend Regime: Trading Strategies for Bitcoin and Ether"
date: 2026-10-26
tags: ["Quant","Trading","Python","Inter IIT","Project"]
summary: "Two daily trading strategies for BTC and ETH. The strategies do not predict direction. They change the position size to fit the market."
description: "Two daily trading strategies for BTC and ETH. The strategies do not predict direction. They change the position size to fit the market."
cover:
  image: "blog-media/calm-trend-regime/cover.png"
  relative: false
  hiddenInList: true
---

{{< repo-card repo="PriyanshuIITGHY2006/InterIIT_Quant_Jain-Streeter" title="Calm-Trend Regime (CTR)" desc="Daily BTC/USDT and ETH/USDT strategies with a custom backtest engine. Inter IIT Tech Meet 15.0." >}}

This project is from the Inter IIT Tech Meet 15.0 quant problem. Kushagra Verma and I made it as team Jain Streeter. This post explains the task, the research and the method.

## Problem statement

The task is to build two trading strategies. One strategy is for BTC/USDT. The other is for ETH/USDT. The data is from Binance, from 2021 to 2025.

Each strategy has its own risk plan. The plan includes stop losses and a risk-to-reward ratio.

The rules are strict:

- Each trade has a cost of 0.15% (fee and slippage). This includes entries, exits, size changes and stops.
- Backtesting libraries are not permitted. The engine, the metrics and the indicators use only numpy, pandas and scipy.
- Each strategy must report 15 metrics, a 5-year equity curve and a trade history.
- The judges also test the strategies on hidden data.

The score rewards four things: return for each unit of risk, small drawdowns, fast recovery, and better results than buy-and-hold in more than half of the quarters. Robustness is more important than the highest return. This rule guided every decision.

## Research results

We studied the training data (2021 to 2023) before we wrote any rule. We found three important facts.

**Fact 1: Direction is almost random. Volatility is not.**

No indicator predicted the direction of the next week. Machine learning classifiers had an AUC of 0.40 to 0.51. A random guess has an AUC of 0.5. A test with shuffled labels had an AUC of 0.52. Trades from the classifiers lost 22% on BTC and 82% on ETH.

Volatility is different. A simple HAR model explains 60% (BTC) and 73% (ETH) of the next-day log volatility. This test used data that the model did not see.

**Fact 2: Trend following makes money only in calm, orderly trends.**

We divided the days by volatility and trend quality. A momentum trade made money in calm trends in 4 of 4 years. In high volatility, it made almost no money.

**Fact 3: Bear markets cause most of the damage to buy-and-hold.**

BTC fell 77% in 2022. It then stayed below its old high for about 780 days. After a loss of 65%, a gain of 186% is necessary to recover. For this reason, it is more important to avoid the fall than to catch each rise.

## The method

{{< diagram name="idea" caption="Two separate jobs. Multiply them to get the position." >}}

The method has two parts. The trend signal decides whether to hold. The market state decides how much to hold.

The trend signal uses 7 votes. A vote is up when the close price is above a moving average. The averages are 20, 30, 50, 75, 100, 150 and 200 days. We use the share of the votes that are up.

We do not use only one lookback period. Results change too much between neighbors. For example, 30-day momentum has a Sharpe ratio of 1.08. The 20-day and 45-day values are 0.77 and 0.68.

Each day, the code gives the market a state. It uses only data up to the close of that day.

{{< diagram name="states" caption="Average long position in each state (BTC, 2021 to 2025). The position is large only in a calm uptrend." >}}

All thresholds use the history of the data itself. No threshold is a fixed number. For this reason, the same code works on a new coin or a new price level.

### The daily decision

The long position is the product of these layers:

| Layer | Condition | Multiplier |
|---|---|---|
| Trend votes | Share of the 7 averages below the close | 0 to 1 |
| Regime | Calm trend, stormy, or neither | 1.5, 0.6 or 1.0 |
| Storm brake | Downside risk is more than 1.5 times its 1-year median | 0.5 |
| Squeeze | Bollinger Bands are inside the Keltner Channel | 0.75 |
| 200-day gate | The long-term trend is down | 0.5 |

The long target is `min(votes x regime x brake x squeeze, 1.5) x gate`. It is a fraction of the equity.

Each layer has evidence. For example, the 200-day gate reduced the loss in 2022 from -34% to -16%. Rallies in the 2022 bear market caused most of the loss without the gate.

### The short side (BTC only)

The BTC strategy (CTR-S) can open a short position of 0.5 times the equity. It opens a short only when all five conditions are true:

1. The long target is zero.
2. The 200-day gate is down.
3. All 7 votes are down.
4. Volatility is calm.
5. BTC is less than 60% below its 365-day high.

Condition 5 is necessary because rebounds are strongest after a crash.

We defined four variants before we ran any test. We also defined the pass criteria before the test. Only one variant passed all criteria. The same four variants made ETH worse. For this reason, ETH is long only.

## Timing without look-ahead

A backtest is not valid if it uses future data. For this reason, the engine has a strict rule. A decision from bar t is executed at the open of bar t+1 or later.

{{< diagram name="timing" caption="The decision uses only closed data. The order fills later." >}}

We also use truncation tests. We cut the data at a chosen point and run the code again. All decisions before the cut must be identical. If they are not identical, the code used future data and the test fails.

## Results

Each test starts with 10,000 USDT. It includes the 0.15% cost on each fill, execution at the next open, and interest on borrowed money.

| 2021 to 2025 | BTC CTR-S | BTC buy-and-hold | ETH CTR-ETH | ETH buy-and-hold |
|---|---|---|---|---|
| Total return | **+368.4%** | +197.9% | **+481.7%** | +306.5% |
| Sharpe ratio | **0.98** | 0.67 | **0.96** | 0.75 |
| Maximum drawdown | **-29.6%** | -76.6% | **-37.3%** | -79.3% |

{{< diagram name="years" caption="BTC return for each year. The strategy is behind in bull years and ahead in bear years." >}}

In strong bull years, the strategy returns less than buy-and-hold. In bear years, it loses much less. In 2022, the strategy lost 1.1%. Buy-and-hold lost 64.2%.

## What did not work

Failed tests are part of the evidence. They show that we did not select only the good results. These ideas failed:

- **A fixed trailing stop of 3 times the ATR.** It triggered 37 times. The BTC Sharpe ratio fell from 1.16 to 0.71.
- **Machine learning and reinforcement learning.** Q-learning lost about 79% on BTC and 83% on ETH, with all five seeds. The final strategies do not use ML or RL.
- **Short-term mean reversion.** The edge for each trade was smaller than the round-trip cost of 0.30%.

The cost explains most of the failures. The result is approximately N x (e - 0.30%). N is the number of round trips in a year. The letter e is the average edge for each trade. Published intraday effects are 2 to 15 basis points. Each round trip costs 30 basis points here.

## Limitations

- The strategy is slower than buy-and-hold in strong rallies. It is better over a full market cycle, but not in each year.
- Jumps often start in calm markets. In those markets, the strategy holds up to 1.5 times the equity.
- The borrow cost for the short is an assumption (10% a year).
- The BTC short made only 23 trades in almost nine years. Two bear markets caused most of the gain.
- BTC and ETH fall together. The two strategies do not give diversification in a crash.

## Run the code

```bash
docker build -t ctr . && docker run --rm ctr selftest
docker run --rm -v "$PWD/runs:/app/runs" ctr run data/raw/BTCUSDT_1h.csv
```

The repository contains the technical report, the presentation and all results.

{{< repo-card repo="PriyanshuIITGHY2006/InterIIT_Quant_Jain-Streeter" title="Calm-Trend Regime (CTR)" desc="Code, technical report, presentation and results." >}}
