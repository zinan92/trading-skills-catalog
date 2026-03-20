"""Trading Copilot — FastAPI server supporting Anthropic + MiniMax APIs with streaming."""

import os
import json
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

    # Build system prompt with user profile
    system = SYSTEM_PROMPT
    if user_profile:
        system += f"\n\n## Current User Profile\n{user_profile}"

    # Build messages
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": user_message})

    if provider == "anthropic":
        return await _stream_anthropic(system, messages, user_api_key or ANTHROPIC_API_KEY, body.get("model", ANTHROPIC_MODEL))
    else:
        return await _stream_minimax(system, messages, user_api_key or MINIMAX_API_KEY, body.get("model", MINIMAX_MODEL))


async def _stream_minimax(system, messages, api_key, model):
    if not api_key:
        return JSONResponse({"error": "No MiniMax API key configured."}, status_code=400)

    full_messages = [{"role": "system", "content": system}] + messages

    payload = {"model": model, "messages": full_messages, "stream": True, "max_tokens": 4096}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async def stream():
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

    return StreamingResponse(stream(), media_type="text/event-stream")


async def _stream_anthropic(system, messages, api_key, model):
    if not api_key:
        return JSONResponse({"error": "No Anthropic API key. Set it in Settings."}, status_code=400)

    payload = {"model": model, "max_tokens": 4096, "system": system, "messages": messages, "stream": True}
    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}

    async def stream():
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

    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    print("Trading Copilot starting on http://localhost:3000")
    print(f"MiniMax: {'configured' if MINIMAX_API_KEY else 'not set'}")
    print(f"Anthropic: {'configured' if ANTHROPIC_API_KEY else 'not set'}")
    uvicorn.run(app, host="0.0.0.0", port=3000)
