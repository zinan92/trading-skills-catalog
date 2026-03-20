"""Trading Copilot — FastAPI server supporting Anthropic + MiniMax APIs with streaming."""

from __future__ import annotations

import os
import re
import json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
import httpx

app = FastAPI()

PROMPT_PATH = Path(__file__).parent / "prompts" / "SKILL.md"
SYSTEM_PROMPT = PROMPT_PATH.read_text() if PROMPT_PATH.exists() else "You are a trading analysis assistant."

# Platform MiniMax key (free tier for users without their own key)
MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")
MINIMAX_URL = "https://api.minimax.chat/v1/chat/completions"
MINIMAX_MODEL = "MiniMax-M1"

# Optional Anthropic key (for BYOK users or server-side config)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"

# quant-data-pipeline base URL
PIPELINE_BASE = os.environ.get("PIPELINE_URL", "http://localhost:8000")

KNOWN_US_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AMD", "INTC", "NFLX",
    "CRM", "ORCL", "AVGO", "QCOM", "MU", "TSM", "ASML", "ARM", "PLTR", "COIN",
    "BABA", "NIO", "LI", "XPEV", "JD", "PDD",
]


def _status_event(step: str, label: str, state: str) -> str:
    """Format a status SSE event string."""
    return f"data: {json.dumps({'type': 'status', 'step': step, 'label': label, 'state': state})}\n\n"


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse((Path(__file__).parent / "index.html").read_text())


@app.get("/api/config")
async def config():
    return JSONResponse({
        "has_platform_key": bool(MINIMAX_API_KEY),
        "has_anthropic_key": bool(ANTHROPIC_API_KEY),
        "default_provider": "minimax" if MINIMAX_API_KEY else ("anthropic" if ANTHROPIC_API_KEY else "none"),
    })


@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    user_message = body.get("message", "")
    history = body.get("history", [])
    user_profile = body.get("user_profile", "")
    provider = body.get("provider", "minimax")
    user_api_key = body.get("api_key", "")
    model = body.get("model", MINIMAX_MODEL if provider != "anthropic" else ANTHROPIC_MODEL)
    api_key = user_api_key or (ANTHROPIC_API_KEY if provider == "anthropic" else MINIMAX_API_KEY)

    # Validate API key early so we can return a proper error
    if not api_key:
        if provider == "anthropic":
            return JSONResponse({"error": "No Anthropic API key. Set it in Settings."}, status_code=400)
        return JSONResponse({"error": "No MiniMax API key configured."}, status_code=400)

    async def stream_with_status():
        status_events: list[str] = []

        # Phase 1: prefetch with status collection
        market_data = await _fetch_with_status_collect(user_message, status_events)

        # Flush all collected status events first
        for evt in status_events:
            yield evt

        # Build system prompt
        system = SYSTEM_PROMPT
        if user_profile:
            system += f"\n\n## Current User Profile\n{user_profile}"
        if market_data:
            system += f"\n\n## Live Market Data (just fetched)\n{market_data}"

        # Signal that AI analysis is starting
        yield _status_event("routing", "Analyzing with trading methodologies...", "done")

        # Build messages
        messages = [{"role": m["role"], "content": m["content"]} for m in history]
        messages.append({"role": "user", "content": user_message})

        # Phase 2: stream AI response
        if provider == "anthropic":
            async for chunk in _gen_anthropic(system, messages, api_key, model):
                yield chunk
        else:
            async for chunk in _gen_minimax(system, messages, api_key, model):
                yield chunk

    return StreamingResponse(stream_with_status(), media_type="text/event-stream")


# ── AI streaming generators ──


async def _gen_minimax(system: str, messages: list, api_key: str, model: str):
    """Async generator yielding SSE strings from MiniMax."""
    full_messages = [{"role": "system", "content": system}] + messages
    payload = {"model": model, "messages": full_messages, "stream": True, "max_tokens": 4096, "tools": []}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=120, verify=False) as client:
        async with client.stream("POST", MINIMAX_URL, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                error = await resp.aread()
                yield f"data: {json.dumps({'type': 'error', 'error': error.decode()})}\n\n"
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    return
                try:
                    chunk = json.loads(data)
                    choices = chunk.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        text = delta.get("content", "")
                        if text:
                            yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"
                        if choices[0].get("finish_reason"):
                            yield f"data: {json.dumps({'type': 'done'})}\n\n"
                except json.JSONDecodeError:
                    pass


async def _gen_anthropic(system: str, messages: list, api_key: str, model: str):
    """Async generator yielding SSE strings from Anthropic."""
    payload = {"model": model, "max_tokens": 4096, "system": system, "messages": messages, "stream": True}
    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}

    async with httpx.AsyncClient(timeout=120, verify=False) as client:
        async with client.stream("POST", ANTHROPIC_URL, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                error = await resp.aread()
                yield f"data: {json.dumps({'type': 'error', 'error': error.decode()})}\n\n"
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    return
                try:
                    event = json.loads(data)
                    if event.get("type") == "content_block_delta":
                        text = event.get("delta", {}).get("text", "")
                        if text:
                            yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"
                    elif event.get("type") == "message_stop":
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
                except json.JSONDecodeError:
                    pass


# ── Market data pre-fetching with status events ──


async def _fetch_with_status_collect(message: str, events: list[str]) -> str | None:
    """
    Fetch live market data and collect status SSE events into `events`.
    Returns the formatted market data string (or None).
    """
    lines: list[str] = []
    pipeline_ok = False

    # 1. US market summary (always try)
    events.append(_status_event("fetch_indexes", "Fetching market data from pipeline...", "running"))
    us_summary = await _pipeline_get("/api/us-stock/summary")
    if us_summary and us_summary.get("indexes"):
        pipeline_ok = True
        # Build a compact label from the first index
        first = us_summary["indexes"][0]
        name = first.get("cn_name") or first.get("name", "Index")
        price = first.get("price", "")
        pct = f"{first['change_pct']:+.2f}%" if first.get("change_pct") is not None else ""
        events.append(_status_event("fetch_indexes", f"US Market: {name} {price} ({pct})", "done"))

        lines.append("## US Market (Live from quant-data-pipeline)")
        lines.append("| Index | Price | Change% | Volume |")
        lines.append("|-------|-------|---------|--------|")
        for idx in us_summary["indexes"]:
            iname = idx.get("cn_name") or idx.get("name", "-")
            iprice = idx.get("price", "-")
            ipct = f"{idx['change_pct']:.2f}%" if idx.get("change_pct") is not None else "-"
            ivol = f"{idx['volume']/1e9:.1f}B" if idx.get("volume") else "-"
            lines.append(f"| {iname} | {iprice} | {ipct} | {ivol} |")
        lines.append("")
    else:
        events.append(_status_event("fetch_indexes", "Market data unavailable (pipeline offline)", "done"))

    # 2. Specific US stock quotes if mentioned
    tickers = _extract_us_tickers(message)
    if tickers and pipeline_ok:
        events.append(_status_event("fetch_quotes", f"Fetching quotes: {', '.join(tickers)}...", "running"))
        quotes = []
        for ticker in tickers:
            q = await _pipeline_get(f"/api/us-stock/quote/{ticker}", timeout=3.0)
            if q and q.get("price"):
                quotes.append(q)
        if quotes:
            events.append(_status_event("fetch_quotes", f"Got {len(quotes)} quote(s)", "done"))
            lines.append("## Stock Quotes (Live)")
            lines.append("| Symbol | Name | Price | Change% | Volume | Market Cap | PE |")
            lines.append("|--------|------|-------|---------|--------|-----------|-----|")
            for q in quotes:
                sym = q.get("symbol", "-")
                qname = q.get("cn_name") or q.get("name", "-")
                qprice = f"${q['price']}"
                qpct = f"{q['change_pct']:.2f}%" if q.get("change_pct") is not None else "-"
                qvol = f"{q['volume']/1e6:.1f}M" if q.get("volume") else "-"
                qmcap = f"${q['market_cap']/1e9:.1f}B" if q.get("market_cap") else "-"
                qpe = f"{q['pe_ratio']:.1f}" if q.get("pe_ratio") else "-"
                lines.append(f"| {sym} | {qname} | {qprice} | {qpct} | {qvol} | {qmcap} | {qpe} |")
            lines.append("")
        else:
            events.append(_status_event("fetch_quotes", "No quote data returned", "done"))

    # 3. A-share data if query is about A-shares
    if _is_ashare_query(message) and pipeline_ok:
        events.append(_status_event("fetch_ashare", "Fetching A-share data...", "running"))
        fetched_ashare = False

        concepts = await _pipeline_get("/api/concept-monitor/top")
        if concepts and isinstance(concepts, list):
            fetched_ashare = True
            lines.append("## A股热门概念 (Live)")
            lines.append("| 概念 | 涨幅 | 代表股 |")
            lines.append("|------|------|--------|")
            for c in concepts[:10]:
                cname = c.get("name") or c.get("concept", "-")
                cpct = f"{c['change_pct']:.2f}%" if c.get("change_pct") is not None else "-"
                ctop = c.get("top_stock", "-")
                lines.append(f"| {cname} | {cpct} | {ctop} |")
            lines.append("")

        anomaly = await _pipeline_get("/api/anomaly/scan")
        if anomaly and (anomaly.get("limit_up") or anomaly.get("results")):
            fetched_ashare = True
            lines.append("## A股异常信号 (Live)")
            lines.append(json.dumps(anomaly, ensure_ascii=False)[:500])
            lines.append("")

        rotation = await _pipeline_get("/api/rotation/signals")
        if rotation:
            fetched_ashare = True
            lines.append("## 板块轮动信号 (Live)")
            lines.append(json.dumps(rotation, ensure_ascii=False)[:500])
            lines.append("")

        label = "A-share data loaded" if fetched_ashare else "A-share data unavailable"
        events.append(_status_event("fetch_ashare", label, "done"))

    # 4. Commodities + Bonds (macro context)
    if pipeline_ok:
        events.append(_status_event("fetch_macro", "Fetching commodities & bonds...", "running"))
        macro_parts = []

        commodities = await _pipeline_get("/api/us-stock/commodities", timeout=3.0)
        if commodities and commodities.get("commodities"):
            lines.append("## Commodities (Live)")
            lines.append("| Asset | Price | Change% |")
            lines.append("|-------|-------|---------|")
            for c in commodities["commodities"][:6]:
                cname = c.get("name", c.get("symbol", "-"))
                cprice = f"${c['price']}" if c.get("price") else "-"
                cpct = f"{c['change_pct']:+.2f}%" if c.get("change_pct") is not None else "-"
                lines.append(f"| {cname} | {cprice} | {cpct} |")
                macro_parts.append(f"{cname.split()[0]} {cpct}")
            lines.append("")

        bonds = await _pipeline_get("/api/us-stock/bonds", timeout=3.0)
        if bonds and bonds.get("bonds"):
            lines.append("## US Treasury Yields (Live)")
            lines.append("| Maturity | Yield | Change% |")
            lines.append("|----------|-------|---------|")
            for b in bonds["bonds"]:
                bname = b.get("name", b.get("symbol", "-"))
                byield = f"{b['price']:.2f}%" if b.get("price") else "-"
                bpct = f"{b['change_pct']:+.2f}%" if b.get("change_pct") is not None else "-"
                lines.append(f"| {bname} | {byield} | {bpct} |")
                macro_parts.append(f"{bname.split()[-2] if len(bname.split()) > 2 else bname} {byield}")
            lines.append("")

        label = ", ".join(macro_parts[:4]) if macro_parts else "Macro data unavailable"
        events.append(_status_event("fetch_macro", label, "done"))

    # 5. News
    events.append(_status_event("fetch_news", "Fetching latest news...", "running"))
    news_data = await _pipeline_get("/api/us-stock/news?limit=5", timeout=3.0)
    news_items = []
    if news_data and isinstance(news_data, dict):
        news_items = news_data.get("news", [])
    elif news_data and isinstance(news_data, list):
        news_items = news_data

    if news_items:
        events.append(_status_event("fetch_news", f"{len(news_items)} news items loaded", "done"))
        lines.append("## Latest Market News (Live)")
        for n in news_items[:5]:
            headline = n.get("title") or n.get("headline") or json.dumps(n, ensure_ascii=False)[:100]
            source = n.get("source", "")
            lines.append(f"- [{source}] {headline}" if source else f"- {headline}")
        lines.append("")
    else:
        events.append(_status_event("fetch_news", "No news available", "done"))

    if lines:
        now = datetime.now(timezone.utc).isoformat()
        lines.insert(0, f"Data fetched at: {now}")
        lines.append("IMPORTANT: Use this REAL live data in your analysis. These are actual market prices right now.")
        return "\n".join(lines)

    return None


# ── Pipeline helpers ──


async def _pipeline_get(path: str, timeout: float = 4.0):
    """GET from quant-data-pipeline, returns parsed JSON or None."""
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=False) as client:
            resp = await client.get(f"{PIPELINE_BASE}{path}")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None


def _extract_us_tickers(msg: str) -> list[str]:
    """Extract US stock tickers from user message."""
    upper = msg.upper()
    tickers = [t for t in KNOWN_US_TICKERS if t in upper]
    # Also match $TICKER patterns
    dollar_matches = re.findall(r"\$([A-Z]{1,5})", msg)
    tickers.extend(dollar_matches)
    # Deduplicate, limit to 5
    seen: set[str] = set()
    result: list[str] = []
    for t in tickers:
        if t not in seen:
            seen.add(t)
            result.append(t)
    return result[:5]


def _is_ashare_query(msg: str) -> bool:
    return bool(re.search(r"A股|a股|沪深|创业板|涨停|跌停|板块|概念|茅台|宁德|上证|深证|科创板|港股通", msg))


if __name__ == "__main__":
    import uvicorn
    print("Trading Copilot starting on http://localhost:3000")
    print(f"Pipeline: {PIPELINE_BASE}")
    print(f"MiniMax: {'configured' if MINIMAX_API_KEY else 'not set'}")
    print(f"Anthropic: {'configured' if ANTHROPIC_API_KEY else 'not set'}")
    uvicorn.run(app, host="0.0.0.0", port=3000)
