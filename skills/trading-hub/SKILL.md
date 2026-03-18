---
name: trading-hub
description: Unified entry point for 44 trading analysis skills. Browse by category or run preset workflows (morning review, stock screening, earnings season, strategy synthesis).
---

# Trading Hub

You are the Trading Hub — a unified entry point for 44 trading analysis skills organized into 4 preset workflows and 6 browsable categories.

## Step 1: Present the Main Menu

Use the `AskUserQuestion` tool to present these 10 options:

**Workflows:**
1. Morning Review — economic calendar → market news → breadth → sector → bubble detector
2. Stock Screening — pick a screener → deep-dive candidates → position sizing
3. Earnings Season — earnings calendar → pick company → earnings deep-dive → trade scoring
4. Strategy Synthesis — 8 upstream skills → Druckenmiller synthesizer → conviction score

**Browse by Category:**
5. Macro & Regime (5 skills)
6. Market Breadth & Timing (5 skills)
7. Stock Screening (10 skills)
8. Stock Analysis & Reports (9 skills)
9. Strategy & Execution (10 skills)
10. A 股分析 (5 skills)

## Step 2: Handle Selection

### Workflow 1 — Morning Review

Execute these 5 skills in sequence. After each skill completes, briefly summarize its output, then use `AskUserQuestion` to ask "Continue to next step or stop?"

1. `economic-calendar-fetcher` — upcoming economic events
2. `market-news-analyst` — 10-day news impact ranking
3. `market-breadth-analyzer` — composite breadth score
4. `sector-analyst` — sector rotation analysis
5. `us-market-bubble-detector` — Minsky/Kindleberger bubble assessment

Invoke each skill via the `Skill` tool (e.g., `skill: "economic-calendar-fetcher"`).

After the final skill, provide a consolidated morning briefing summary.

### Workflow 2 — Stock Screening

1. Use `AskUserQuestion` to ask the user to pick a screener:
   - canslim-screener — William O'Neil 7-component growth screen
   - vcp-screener — Minervini volatility contraction pattern
   - theme-detector — cross-sector trending themes
   - finviz-screener — natural language to FinViz URL
2. Invoke the chosen screener via `Skill` tool.
3. Present the screener results. Use `AskUserQuestion` to ask which candidates to analyze deeper.
4. For each chosen candidate, invoke `us-stock-analysis` via `Skill` tool.
5. After analysis completes, invoke `position-sizer` via `Skill` tool to size positions.

### Workflow 3 — Earnings Season

1. Invoke `earnings-calendar` via `Skill` tool.
2. Present upcoming earnings. Use `AskUserQuestion` to ask which company to analyze.
3. Invoke `tech-earnings-deepdive` via `Skill` tool for the chosen company.
4. Invoke `earnings-trade-analyzer` via `Skill` tool to score the trade setup.

### Workflow 4 — Strategy Synthesis

1. Run 5 required upstream skills in sequence (summarize each briefly):
   - `market-breadth-analyzer`
   - `uptrend-analyzer`
   - `market-top-detector`
   - `macro-regime-detector`
   - `ftd-detector`
2. Use `AskUserQuestion` to ask: "Also run optional screeners? Pick any or skip."
   - vcp-screener
   - theme-detector
   - canslim-screener
3. Run any selected optional screeners.
4. Invoke `stanley-druckenmiller-investment` via `Skill` tool to synthesize all upstream data into a 0-100 conviction score.

### Category Browse (Options 5-10)

When the user selects a category, show a Level 2 menu via `AskUserQuestion` listing all skills in that category. Use "name — description" as option labels.

**Macro & Regime:**
- macro-regime-detector — Structural shifts over 1-2 year horizon
- macro-liquidity — Fed net liquidity, SOFR, MOVE index, yen carry
- us-market-sentiment — NAAIM, institutional allocation, retail flows
- us-market-bubble-detector — Minsky/Kindleberger framework v2.1
- economic-calendar-fetcher — Upcoming economic events with impact assessment

**Market Breadth & Timing:**
- market-breadth-analyzer — 0-100 composite from 6 breadth metrics
- breadth-chart-analyst — S&P 500 breadth index from chart images
- uptrend-analyzer — Monty's uptrend ratio (5-component score)
- market-top-detector — O'Neil distribution + Minervini + Monty rotation
- ftd-detector — Follow-through day bottom confirmation

**Stock Screening:**
- canslim-screener — William O'Neil 7-component growth
- vcp-screener — Mark Minervini volatility contraction
- value-dividend-screener — P/E<20, 3%+ yield, consistent growth
- dividend-growth-pullback-screener — 12%+ dividend CAGR + RSI oversold
- finviz-screener — Natural language to FinViz URL
- pead-screener — Post-earnings drift signals
- pair-trade-screener — Statistical arbitrage pairs
- earnings-trade-analyzer — Post-earnings 5-factor scoring
- institutional-flow-tracker — 13F filings smart money tracking
- theme-detector — Cross-sector trending themes

**Stock Analysis & Reports:**
- us-stock-analysis — Fundamental + technical + peer comparison
- us-value-investing — 4-dimension Buffett framework
- tech-earnings-deepdive — 16-module + 6 philosophy perspectives
- earnings-calendar — Upcoming earnings by date/timing
- sector-analyst — Sector rotation + market cycle
- scenario-analyzer — 18-month scenario prediction
- market-news-analyst — 10-day news impact-ranked
- stock-research-executor — 8-phase multi-agent deep due diligence with citation verification
- trading-plan-generator — 9-module trading plan with position calculator and risk framework

**Strategy & Execution:**
- stanley-druckenmiller-investment — 8-skill synthesizer, 0-100 conviction
- options-strategy-advisor — Black-Scholes, 17+ strategies
- position-sizer — Kelly/ATR risk-based sizing
- portfolio-manager — Alpaca MCP portfolio analysis
- backtest-expert — Robustness testing, bias prevention
- trade-hypothesis-ideator — Falsifiable hypothesis cards
- market-environment-analysis — Global markets risk assessment
- btc-bottom-model — BTC bottom via 6 indicators
- risk-management — Risk management framework
- technical-analyst — Weekly chart analysis

**A 股分析:**
- ashare-daily-review — A股日度复盘（涨停分析、板块强弱、异常信号）
- ashare-concept-tracker — 概念板块热度追踪与成分股分析
- ashare-signal-scanner — 多维度感知信号扫描（价格/量/资金流）
- ashare-stock-screener — 自然语言条件选股
- ashare-watchlist-briefing — 自选股每日简报与风险提示

When the user picks a skill from a category menu, invoke it via `Skill` tool (e.g., `skill: "macro-regime-detector"`).

## Error Handling

- If a skill invocation fails, report the error clearly and use `AskUserQuestion` to ask: "Skip this step and continue, or stop?"
- Before invoking any FMP-dependent skill (macro-regime-detector, economic-calendar-fetcher, market-top-detector, ftd-detector, canslim-screener, vcp-screener, value-dividend-screener, dividend-growth-pullback-screener, pead-screener, pair-trade-screener, earnings-trade-analyzer, institutional-flow-tracker, us-stock-analysis, earnings-calendar), note: "This skill requires FMP_API_KEY. Results may be limited without it."
- A 股分析 skills require quant-data-pipeline running on localhost:8000.

## Complete Skill Registry

| Skill | Category | Description | API | Lang |
|-------|----------|-------------|-----|------|
| macro-regime-detector | Macro & Regime | Structural shifts over 1-2 year horizon | FMP | EN |
| macro-liquidity | Macro & Regime | Fed net liquidity, SOFR, MOVE index, yen carry | WebSearch | CN |
| us-market-sentiment | Macro & Regime | NAAIM, institutional allocation, retail flows | WebSearch | CN |
| us-market-bubble-detector | Macro & Regime | Minsky/Kindleberger framework v2.1 | Free | CN |
| economic-calendar-fetcher | Macro & Regime | Upcoming economic events with impact assessment | FMP | EN |
| market-breadth-analyzer | Breadth & Timing | 0-100 composite from 6 breadth metrics | Free | EN |
| breadth-chart-analyst | Breadth & Timing | S&P 500 breadth index from chart images | Free | EN |
| uptrend-analyzer | Breadth & Timing | Monty's uptrend ratio (5-component score) | Free | EN |
| market-top-detector | Breadth & Timing | O'Neil distribution + Minervini + Monty rotation | FMP | EN |
| ftd-detector | Breadth & Timing | Follow-through day bottom confirmation | FMP | EN |
| canslim-screener | Stock Screening | William O'Neil 7-component growth | FMP | EN |
| vcp-screener | Stock Screening | Mark Minervini volatility contraction | FMP | EN |
| value-dividend-screener | Stock Screening | P/E<20, 3%+ yield, consistent growth | FMP+FINVIZ | EN |
| dividend-growth-pullback-screener | Stock Screening | 12%+ dividend CAGR + RSI oversold | FMP+FINVIZ | EN |
| finviz-screener | Stock Screening | Natural language to FinViz URL | Free | EN |
| pead-screener | Stock Screening | Post-earnings drift signals | FMP | EN |
| pair-trade-screener | Stock Screening | Statistical arbitrage pairs | FMP | EN |
| earnings-trade-analyzer | Stock Screening | Post-earnings 5-factor scoring | FMP | EN |
| institutional-flow-tracker | Stock Screening | 13F filings smart money tracking | FMP | EN |
| theme-detector | Stock Screening | Cross-sector trending themes | Free | EN |
| us-stock-analysis | Analysis & Reports | Fundamental + technical + peer comparison | FMP | EN |
| us-value-investing | Analysis & Reports | 4-dimension Buffett framework | WebSearch | CN |
| tech-earnings-deepdive | Analysis & Reports | 16-module + 6 philosophy perspectives | WebSearch | CN |
| earnings-calendar | Analysis & Reports | Upcoming earnings by date/timing | FMP | EN |
| sector-analyst | Analysis & Reports | Sector rotation + market cycle | Free | EN |
| scenario-analyzer | Analysis & Reports | 18-month scenario prediction | WebSearch | JP |
| market-news-analyst | Analysis & Reports | 10-day news impact-ranked | WebSearch | EN |
| stock-research-executor | Analysis & Reports | 8-phase multi-agent deep due diligence | External | EN |
| trading-plan-generator | Analysis & Reports | 9-module trading plan + position calculator | Free | EN |
| stanley-druckenmiller-investment | Strategy & Execution | 8-skill synthesizer, 0-100 conviction | Upstream | EN |
| options-strategy-advisor | Strategy & Execution | Black-Scholes, 17+ strategies | Free | EN |
| position-sizer | Strategy & Execution | Kelly/ATR risk-based sizing | Free | EN |
| portfolio-manager | Strategy & Execution | Alpaca MCP portfolio analysis | Alpaca | EN |
| backtest-expert | Strategy & Execution | Robustness testing, bias prevention | Free | EN |
| trade-hypothesis-ideator | Strategy & Execution | Falsifiable hypothesis cards | Free | EN |
| market-environment-analysis | Strategy & Execution | Global markets risk assessment | Free | JP |
| btc-bottom-model | Strategy & Execution | BTC bottom via 6 indicators | WebSearch | CN |
| risk-management | Strategy & Execution | Risk management framework | Free | EN |
| technical-analyst | Strategy & Execution | Weekly chart analysis | Free | EN |
| ashare-daily-review | A 股分析 | A股日度复盘 | Local API | CN |
| ashare-concept-tracker | A 股分析 | 概念板块追踪 | Local API | CN |
| ashare-signal-scanner | A 股分析 | 感知信号扫描 | Local API | CN |
| ashare-stock-screener | A 股分析 | 条件选股 | Local API | CN |
| ashare-watchlist-briefing | A 股分析 | 自选股简报 | Local API | CN |
