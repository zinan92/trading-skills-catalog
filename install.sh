#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="${HOME}/.claude/skills"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# List of all 37 required skill names
REQUIRED_SKILLS=(
  macro-regime-detector macro-liquidity us-market-sentiment
  us-market-bubble-detector economic-calendar-fetcher
  market-breadth-analyzer breadth-chart-analyst uptrend-analyzer
  market-top-detector ftd-detector
  canslim-screener vcp-screener value-dividend-screener
  dividend-growth-pullback-screener finviz-screener pead-screener
  pair-trade-screener earnings-trade-analyzer institutional-flow-tracker
  theme-detector
  us-stock-analysis us-value-investing tech-earnings-deepdive
  earnings-calendar sector-analyst scenario-analyzer market-news-analyst
  stanley-druckenmiller-investment options-strategy-advisor position-sizer
  portfolio-manager backtest-expert trade-hypothesis-ideator
  market-environment-analysis btc-bottom-model risk-management
  technical-analyst
)

# Preflight: check skills directory
if [ ! -d "$SKILLS_DIR" ]; then
  echo "Error: $SKILLS_DIR does not exist. Is Claude Code installed?"
  exit 1
fi

# Count installed skills
installed=0
missing=()
for skill in "${REQUIRED_SKILLS[@]}"; do
  if [ -d "$SKILLS_DIR/$skill" ] || [ -L "$SKILLS_DIR/$skill" ]; then
    installed=$((installed + 1))
  else
    missing+=("$skill")
  fi
done

echo "Trading Skills Catalog — Install"
echo "================================"
echo ""
echo "Prerequisites: ${installed}/${#REQUIRED_SKILLS[@]} trading skills found"

if [ ${#missing[@]} -gt 0 ]; then
  echo ""
  echo "Missing skills (${#missing[@]}):"
  for skill in "${missing[@]}"; do
    echo "  - $skill"
  done
  echo ""
  echo "Most skills come from tradermonty/claude-trading-skills:"
  echo "  git clone https://github.com/tradermonty/claude-trading-skills.git"
  echo "  cd claude-trading-skills && ./install.sh"
  echo ""
fi

# Install trading-hub skill
if [ -L "$SKILLS_DIR/trading-hub" ] || [ -d "$SKILLS_DIR/trading-hub" ]; then
  echo "trading-hub skill already installed, updating symlink..."
  rm -f "$SKILLS_DIR/trading-hub"
fi

ln -s "$SCRIPT_DIR/skills/trading-hub" "$SKILLS_DIR/trading-hub"
echo "Installed: trading-hub -> $SKILLS_DIR/trading-hub"

# FMP API key check
echo ""
if [ -z "${FMP_API_KEY:-}" ]; then
  echo "Note: FMP_API_KEY not set. 14 skills require it for full functionality."
  echo "  export FMP_API_KEY=your_key_here"
else
  echo "FMP_API_KEY detected."
fi

echo ""
echo "Done! Use /trading-hub in Claude Code to get started."
