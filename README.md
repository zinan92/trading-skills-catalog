<div align="center">

# Trading Skills Catalog

**44 个 Claude Code 交易分析 Skills 的统一展示与入口 — 从宏观研判到选股筛选到策略合成，一站式覆盖**

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/skills-44-blue.svg)](https://zinan92.github.io/trading-skills-catalog/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-skill-8B5CF6.svg)](https://claude.ai/claude-code)

[Live Catalog](https://zinan92.github.io/trading-skills-catalog/) · [Quick Start](#快速开始) · [Workflows](#预设工作流)

</div>

---

## 痛点

Claude Code 社区已有 30+ 个优秀的交易分析 Skills（宏观分析、选股筛选、财报深度、策略回测…），但它们分散在不同仓库、没有统一目录、记不住名字也不知道谁依赖谁。每次用都要翻文件夹找 skill 名。

## 解决方案

本项目提供两样东西：

1. **Catalog 展示页** — 一个静态网页，分类展示全部 44 个 skill 的能力、API 需求、语言支持，附带策略合成器的依赖关系图
2. **Trading Hub Skill** — 一个统一入口 `/trading-hub`，通过分类菜单或预设工作流直接调用任意 skill

## 架构

```
┌─────────────────────────────────────────────────────┐
│                  Trading Hub Skill                   │
│            /trading-hub (统一入口)                    │
├──────────┬──────────┬──────────┬─────────────────────┤
│ 晨间复盘  │ 选股流程  │ 财报季   │   策略合成           │
│ 5 skills │ 3 skills │ 3 skills │   8 → 1 skill       │
└──────────┴──────────┴──────────┴─────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  宏观 & Regime │ │  选股筛选     │ │  策略 & 执行  │
│  (5 skills)   │ │  (10 skills)  │ │  (10 skills)  │
├──────────────┤ ├──────────────┤ ├──────────────┤
│  广度 & Timing │ │  个股分析     │ │               │
│  (5 skills)   │ │  (9 skills)   │ │               │
└──────────────┘ └──────────────┘ └──────────────┘

┌─────────────────────────────────────────────────────┐
│              Catalog 展示页 (GitHub Pages)            │
│         44 张 Skill 卡片 + SVG 依赖图 + Quick Start    │
└─────────────────────────────────────────────────────┘
```

## 快速开始

```bash
# 1. 安装基础 Skills（30+ 来自 tradermonty）
git clone https://github.com/tradermonty/claude-trading-skills.git
cd claude-trading-skills && ./install.sh

# 2. 安装 Trading Hub 入口
git clone https://github.com/zinan92/trading-skills-catalog.git
cd trading-skills-catalog && ./install.sh

# 3. 可选：设置 FMP API Key（启用 14 个额外 skill）
export FMP_API_KEY=your_key_here
```

然后在 Claude Code 中输入：

```
/trading-hub
```

## Chat Panel（交互式终端）

Catalog 页面右侧有一个 Chat 面板，通过 OpenClaw Gateway 连接到你的 Agent，实现网页内直接对话。

### 配置 Agent 的 Trading Knowledge

连接时会自动注入 trading context，但要获得最佳效果，建议将 trading knowledge 加入 Agent 的启动配置：

**方式 1：新建 Trading Agent**

在 `~/.openclaw/openclaw.json` 的 `agents.list` 中加入：
```json
{
  "id": "trader",
  "name": "Trading Assistant",
  "workspace": "/path/to/your/workspace",
  "bootstrap": ["./agents/AGENTS.md"]
}
```

然后将本 repo 的 `agents/AGENTS.md` 复制到 workspace 目录。

**方式 2：注入已有 Agent**

将 `agents/AGENTS.md` 的内容追加到你现有 Agent 的 bootstrap 文件中（如 AGENTS.md 或 TOOLS.md）。Agent 重启后即获得 trading skills 导航能力。

**Chat Panel 功能：**
- 连接 OpenClaw Gateway（需要 token）
- 自动注入 trading context
- A 股分析：Agent 直接调用本地 API 返回真实数据
- 美股分析：Agent 推荐具体的 Claude Code skill 并给出运行命令
- 点击左侧工作流行 → 自动发送到 Chat 执行

## 功能一览

| 功能 | 说明 | 状态 |
|------|------|------|
| Catalog 展示页 | 44 个 skill 分类展示 + SVG 依赖图 + 响应式设计 | ✅ |
| Trading Hub Skill | 统一入口，分类菜单 + 工作流快捷方式 | ✅ |
| 安装脚本 | Preflight 检查 44 个依赖 + symlink 安装 | ✅ |
| GitHub Pages 部署 | 在线浏览全部 skill 能力 | ✅ |

## Skill 分类

| 分类 | 数量 | 核心 Skills | API |
|------|------|-------------|-----|
| **宏观 & Regime** | 5 | macro-regime-detector, macro-liquidity, us-market-sentiment | FMP / WebSearch |
| **市场广度 & Timing** | 5 | market-breadth-analyzer, market-top-detector, ftd-detector | Free / FMP |
| **选股筛选** | 10 | canslim-screener, vcp-screener, finviz-screener, theme-detector | FMP / Free |
| **个股分析 & 研报** | 9 | us-stock-analysis, tech-earnings-deepdive, stock-research-executor | FMP / WebSearch |
| **策略 & 执行** | 10 | stanley-druckenmiller-investment, position-sizer, backtest-expert | Free / Upstream |
| **A 股分析** | 5 | ashare-daily-review, ashare-concept-tracker, ashare-signal-scanner | Local API |

**API 需求汇总：** 14 Free · 14 FMP · 7 WebSearch · 5 Local API · 4 Other

## 预设工作流

### 晨间复盘

```
economic-calendar → market-news → market-breadth → sector-analyst → bubble-detector
```

收盘后 5 步完成全市场环境扫描。每步执行后可选择继续或停止。

### 选股流程

```
选择筛选器 (CANSLIM / VCP / Theme / FinViz) → us-stock-analysis 深度分析 → position-sizer 仓位计算
```

### 财报季

```
earnings-calendar → 选择标的 → tech-earnings-deepdive → earnings-trade-analyzer
```

### 策略合成

```
5 必选上游 (breadth + uptrend + top + regime + ftd)
    + 3 可选 (vcp + theme + canslim)
        → stanley-druckenmiller-investment → 0-100 conviction score
```

## 策略合成器依赖图

```
                ┌──────────────────────────────────┐
                │  stanley-druckenmiller-investment  │
                │       (0-100 conviction)          │
                └──────┬───────────┬───────────┬───┘
          ┌────────────┼───────────┼───────────┼────────────┐
          ▼            ▼           ▼           ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
    │ breadth  │ │ uptrend  │ │  top   │ │ regime │ │   ftd    │
    │ analyzer │ │ analyzer │ │detector│ │detector│ │ detector │
    └──────────┘ └──────────┘ └────────┘ └────────┘ └──────────┘
                        Required (━━━)

          ┌────────────┬───────────┐
          ▼            ▼           ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │   vcp    │ │  theme   │ │ canslim  │
    │ screener │ │ detector │ │ screener │
    └──────────┘ └──────────┘ └──────────┘
                   Optional (┄┄┄)
```

## 项目结构

```
trading-skills-catalog/
├── index.html              # Catalog 展示页（单文件，零依赖）
├── skills/
│   └── trading-hub/
│       └── SKILL.md        # 统一入口 Skill
├── install.sh              # 安装脚本（preflight + symlink）
├── README.md
└── LICENSE                 # MIT
```

## 配置

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `FMP_API_KEY` | Financial Modeling Prep API Key，启用 14 个 FMP 依赖的 skill | 否 | 无 |

不设置 FMP_API_KEY 仍有 14 个 Free + 7 个 WebSearch + 5 个 Local API 的 skill 可用。

## For AI Agents

本节面向需要将此项目作为工具或依赖集成的 AI Agent。

### 结构化元数据

```yaml
name: trading-skills-catalog
description: Unified catalog and hub for 44 Claude Code trading analysis skills
version: 1.0.0
type: claude-code-skill-collection

skill_entry_point:
  name: trading-hub
  trigger: /trading-hub
  description: Menu-driven entry point with 4 workflows and 6 category browsers

install_command: ./install.sh
health_check: ls ~/.claude/skills/trading-hub/SKILL.md

dependencies:
  - tradermonty/claude-trading-skills (30+ skills)
  - star23/Day1Global-Skills (2 skills)
  - liangdabiao/claude-code-stock-deep-research-agent (1 skill)
  - jamesrochabrun/skills/trading-plan-generator (1 skill)

capabilities:
  - browse 44 trading skills by category via interactive menu
  - run preset workflows (morning review, stock screening, earnings season, strategy synthesis)
  - synthesize 8 upstream skill outputs into a 0-100 conviction score via Druckenmiller strategy
  - screen stocks using CANSLIM, VCP, value-dividend, PEAD, pair-trade methodologies
  - analyze individual stocks with fundamental, technical, and earnings deep-dive
  - track institutional 13F flows and detect market regime transitions
  - calculate risk-based position sizes using Kelly criterion and ATR

workflows:
  morning_review:
    steps: [economic-calendar-fetcher, market-news-analyst, market-breadth-analyzer, sector-analyst, us-market-bubble-detector]
  stock_screening:
    steps: [canslim-screener|vcp-screener|theme-detector|finviz-screener, us-stock-analysis, position-sizer]
  earnings_season:
    steps: [earnings-calendar, tech-earnings-deepdive, earnings-trade-analyzer]
  strategy_synthesis:
    required: [market-breadth-analyzer, uptrend-analyzer, market-top-detector, macro-regime-detector, ftd-detector]
    optional: [vcp-screener, theme-detector, canslim-screener]
    synthesizer: stanley-druckenmiller-investment

categories:
  macro_regime: 5 skills
  market_breadth_timing: 5 skills
  stock_screening: 10 skills
  stock_analysis_reports: 9 skills
  strategy_execution: 10 skills
  ashare: 5 skills

api_requirements:
  free: 14
  fmp: 14
  websearch: 7
  local_api: 5
  other: 4
```

### Agent 调用示例

```bash
# 在 Claude Code 中直接调用
claude --skill trading-hub

# 或者直接调用某个子 skill
claude --skill canslim-screener
claude --skill us-stock-analysis
claude --skill stanley-druckenmiller-investment
```

## 相关项目

| 项目 | 说明 | 链接 |
|------|------|------|
| tradermonty/claude-trading-skills | 30+ 交易分析 Skills 的源头仓库 | [GitHub](https://github.com/tradermonty/claude-trading-skills) |
| Day1Global-Skills | tech-earnings-deepdive 等机构级分析 Skill | [GitHub](https://github.com/star23/Day1Global-Skills) |
| AI-Trader | 多 AI 模型实盘竞技平台 (NASDAQ/A股/Crypto) | [GitHub](https://github.com/HKUDS/AI-Trader) |
| TradingAgents | 多 Agent 交易框架：分析→辩论→风控→执行 | [GitHub](https://github.com/TauricResearch/TradingAgents) |
| daily-stock-analysis | GitHub Actions A/H/美股自动分析 + Telegram 推送 | [GitHub](https://github.com/ZhuLinsen/daily_stock_analysis) |

## License

MIT
