const fs = require('fs');
const path = require('path');

let SYSTEM_PROMPT = 'You are a trading analysis assistant.';
try {
  SYSTEM_PROMPT = fs.readFileSync(path.join(process.cwd(), 'app', 'prompts', 'SKILL.md'), 'utf-8');
} catch (e) {}

function sanitizeError(msg) {
  return (msg || 'Unknown error').replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-***').replace(/Bearer [^\s"]+/g, 'Bearer ***');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { message, history = [], user_profile = '', provider = 'minimax', api_key = '' } = req.body || {};

  let system = SYSTEM_PROMPT;
  if (user_profile) system += '\n\n## Current User Profile\n' + user_profile;

  // Pre-fetch market data based on user message
  var marketData = await fetchMarketContext(message);
  if (marketData) {
    system += '\n\n## Live Market Data (just fetched)\n' + marketData;
  }

  const messages = history.map(function(m) { return { role: m.role, content: m.content }; });
  messages.push({ role: 'user', content: message });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    if (provider === 'anthropic') {
      await streamAnthropic(system, messages, (api_key || process.env.ANTHROPIC_API_KEY || '').trim(), res);
    } else {
      await streamMinimax(system, messages, (api_key || process.env.MINIMAX_API_KEY || '').trim(), res);
    }
  } catch (e) {
    res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(e.message) }) + '\n\n');
    res.end();
  }
};

module.exports.config = { maxDuration: 60 };

async function streamMinimax(system, messages, apiKey, res) {
  if (!apiKey) { res.write('data: ' + JSON.stringify({ type: 'error', error: 'No MiniMax API key configured.' }) + '\n\n'); res.end(); return; }

  var fullMessages = [{ role: 'system', content: system }].concat(messages);
  var payload = JSON.stringify({
    model: 'MiniMax-M1',
    messages: fullMessages,
    stream: true,
    max_tokens: 4096
  });

  // Use Node.js https module instead of fetch for reliable streaming on Vercel
  var https = require('https');

  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'api.minimax.chat',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    var request = https.request(options, function(response) {
      if (response.statusCode !== 200) {
        var errBody = '';
        response.on('data', function(c) { errBody += c; });
        response.on('end', function() {
          res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(errBody) }) + '\n\n');
          res.end();
          resolve();
        });
        return;
      }

      var buf = '';
      response.on('data', function(chunk) {
        buf += chunk.toString();
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith('data: ')) continue;
          var data = line.slice(6);
          if (data === '[DONE]') { res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n'); continue; }
          try {
            var chunk2 = JSON.parse(data);
            if (chunk2.choices && chunk2.choices[0]) {
              var delta = chunk2.choices[0].delta;
              if (delta && delta.content) {
                res.write('data: ' + JSON.stringify({ type: 'text', text: delta.content }) + '\n\n');
              }
              if (chunk2.choices[0].finish_reason) {
                res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
              }
            }
          } catch (parseErr) {}
        }
      });

      response.on('end', function() {
        res.end();
        resolve();
      });

      response.on('error', function(err) {
        res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(err.message) }) + '\n\n');
        res.end();
        resolve();
      });
    });

    request.on('error', function(err) {
      res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(err.message) }) + '\n\n');
      res.end();
      resolve();
    });

    request.write(payload);
    request.end();
  });
}

async function streamAnthropic(system, messages, apiKey, res) {
  if (!apiKey) { res.write('data: ' + JSON.stringify({ type: 'error', error: 'No Anthropic API key.' }) + '\n\n'); res.end(); return; }

  var payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: system,
    messages: messages,
    stream: true
  });

  var https = require('https');

  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    var request = https.request(options, function(response) {
      if (response.statusCode !== 200) {
        var errBody = '';
        response.on('data', function(c) { errBody += c; });
        response.on('end', function() {
          res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(errBody) }) + '\n\n');
          res.end();
          resolve();
        });
        return;
      }

      var buf = '';
      response.on('data', function(chunk) {
        buf += chunk.toString();
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line.startsWith('data: ')) continue;
          var data = line.slice(6);
          if (data === '[DONE]') { res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n'); continue; }
          try {
            var event = JSON.parse(data);
            if (event.type === 'content_block_delta' && event.delta && event.delta.text) {
              res.write('data: ' + JSON.stringify({ type: 'text', text: event.delta.text }) + '\n\n');
            } else if (event.type === 'message_stop') {
              res.write('data: ' + JSON.stringify({ type: 'done' }) + '\n\n');
            }
          } catch (parseErr) {}
        }
      });

      response.on('end', function() {
        res.end();
        resolve();
      });

      response.on('error', function(err) {
        res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(err.message) }) + '\n\n');
        res.end();
        resolve();
      });
    });

    request.on('error', function(err) {
      res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(err.message) }) + '\n\n');
      res.end();
      resolve();
    });

    request.write(payload);
    request.end();
  });
}

// ── Market data pre-fetching ──
// Priority: quant-data-pipeline (localhost:8000) → Yahoo Finance fallback

var PIPELINE_BASE = process.env.PIPELINE_URL || 'http://localhost:8000';

function httpGet(url, timeout) {
  return new Promise(function(resolve) {
    var mod = url.startsWith('https') ? require('https') : require('http');
    var req = mod.get(url, { timeout: timeout || 4000 }, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(body)); } catch(e) { resolve(null); }
      });
    });
    req.on('error', function() { resolve(null); });
    req.on('timeout', function() { req.destroy(); resolve(null); });
  });
}

function extractUSTickers(msg) {
  var tickers = [];
  var upper = msg.toUpperCase();
  var known = ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AMD','INTC','NFLX','CRM','ORCL','AVGO','QCOM','MU','TSM','ASML','ARM','PLTR','COIN','BABA','NIO','LI','XPEV','JD','PDD'];
  known.forEach(function(t) { if (upper.indexOf(t) >= 0) tickers.push(t); });
  var dollar = msg.match(/\$([A-Z]{1,5})/g);
  if (dollar) tickers = tickers.concat(dollar.map(function(t) { return t.slice(1); }));
  return tickers.filter(function(v,i,a) { return a.indexOf(v) === i; }).slice(0, 5);
}

function isAShareQuery(msg) {
  return /[A股a股沪深创业板涨停跌停板块概念茅台宁德]/.test(msg);
}

async function fetchMarketContext(message) {
  var lines = [];
  var pipelineOk = false;

  // 1. Try quant-data-pipeline for US market summary (always)
  var usSummary = await httpGet(PIPELINE_BASE + '/api/us-stock/summary', 4000);
  if (usSummary && usSummary.indexes) {
    pipelineOk = true;
    lines.push('## US Market (Live from quant-data-pipeline)');
    lines.push('| Index | Price | Change% | Volume |');
    lines.push('|-------|-------|---------|--------|');
    usSummary.indexes.forEach(function(idx) {
      lines.push('| ' + (idx.cn_name || idx.name) + ' | ' + idx.price + ' | ' + (idx.change_pct ? idx.change_pct.toFixed(2) + '%' : '-') + ' | ' + (idx.volume ? (idx.volume/1e9).toFixed(1) + 'B' : '-') + ' |');
    });
    lines.push('');
  }

  // 2. Fetch specific US stock quotes if mentioned
  var tickers = extractUSTickers(message);
  if (tickers.length > 0 && pipelineOk) {
    var quotes = [];
    for (var i = 0; i < tickers.length; i++) {
      var q = await httpGet(PIPELINE_BASE + '/api/us-stock/quote/' + tickers[i], 3000);
      if (q && q.price) quotes.push(q);
    }
    if (quotes.length > 0) {
      lines.push('## Stock Quotes (Live)');
      lines.push('| Symbol | Name | Price | Change% | Volume | Market Cap | PE |');
      lines.push('|--------|------|-------|---------|--------|-----------|-----|');
      quotes.forEach(function(q) {
        lines.push('| ' + q.symbol + ' | ' + (q.cn_name || q.name) + ' | $' + q.price + ' | ' + (q.change_pct ? q.change_pct.toFixed(2) + '%' : '-') + ' | ' + (q.volume ? (q.volume/1e6).toFixed(1) + 'M' : '-') + ' | $' + (q.market_cap ? (q.market_cap/1e9).toFixed(1) + 'B' : '-') + ' | ' + (q.pe_ratio ? q.pe_ratio.toFixed(1) : '-') + ' |');
      });
      lines.push('');
    }
  }

  // 3. A-share data if query is about A-shares
  if (isAShareQuery(message) && pipelineOk) {
    var concepts = await httpGet(PIPELINE_BASE + '/api/concept-monitor/top', 4000);
    if (concepts && Array.isArray(concepts)) {
      lines.push('## A股热门概念 (Live)');
      lines.push('| 概念 | 涨幅 | 代表股 |');
      lines.push('|------|------|--------|');
      concepts.slice(0, 10).forEach(function(c) {
        lines.push('| ' + (c.name || c.concept || '-') + ' | ' + (c.change_pct ? c.change_pct.toFixed(2) + '%' : '-') + ' | ' + (c.top_stock || '-') + ' |');
      });
      lines.push('');
    }

    var anomaly = await httpGet(PIPELINE_BASE + '/api/anomaly/scan', 4000);
    if (anomaly && (anomaly.limit_up || anomaly.results)) {
      lines.push('## A股异常信号 (Live)');
      lines.push(JSON.stringify(anomaly).substring(0, 500));
      lines.push('');
    }

    var rotation = await httpGet(PIPELINE_BASE + '/api/rotation/signals', 4000);
    if (rotation) {
      lines.push('## 板块轮动信号 (Live)');
      lines.push(JSON.stringify(rotation).substring(0, 500));
      lines.push('');
    }
  }

  // 4. News/intel if available
  var news = await httpGet(PIPELINE_BASE + '/api/news/latest?limit=5', 3000);
  if (news && Array.isArray(news) && news.length > 0) {
    lines.push('## Latest News');
    news.slice(0, 5).forEach(function(n) {
      lines.push('- ' + (n.title || n.headline || JSON.stringify(n).substring(0, 100)));
    });
    lines.push('');
  }

  if (lines.length > 0) {
    lines.unshift('Data fetched at: ' + new Date().toISOString());
    lines.push('IMPORTANT: Use this REAL live data in your analysis. These are actual market prices right now.');
    return lines.join('\n');
  }

  // Fallback: Yahoo Finance (for Vercel deployment without pipeline access)
  return fetchYahooFallback(message);
}

function fetchYahooFallback(message) {
  var tickers = extractUSTickers(message);
  var symbols = ['SPY','QQQ'].concat(tickers).filter(function(v,i,a) { return a.indexOf(v) === i; });

  return new Promise(function(resolve) {
    var https2 = require('https');
    var opts = {
      hostname: 'query1.finance.yahoo.com',
      path: '/v7/finance/quote?symbols=' + encodeURIComponent(symbols.join(',')) + '&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,trailingPE',
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    var req2 = https2.request(opts, function(resp2) {
      var body = '';
      resp2.on('data', function(c) { body += c; });
      resp2.on('end', function() {
        try {
          var d = JSON.parse(body);
          var quotes = (d.quoteResponse && d.quoteResponse.result) || [];
          if (quotes.length === 0) { resolve(null); return; }
          var lines = ['Yahoo Finance data at ' + new Date().toISOString(), ''];
          lines.push('| Symbol | Price | Change% | PE |');
          lines.push('|--------|-------|---------|----|');
          quotes.forEach(function(q) {
            lines.push('| ' + q.symbol + ' | $' + (q.regularMarketPrice||'-') + ' | ' + (q.regularMarketChangePercent ? q.regularMarketChangePercent.toFixed(2)+'%' : '-') + ' | ' + (q.trailingPE ? q.trailingPE.toFixed(1) : '-') + ' |');
          });
          lines.push('');
          lines.push('IMPORTANT: Use this REAL data. Do NOT make up prices.');
          resolve(lines.join('\n'));
        } catch(e) { resolve(null); }
      });
    });
    req2.on('error', function() { resolve(null); });
    req2.setTimeout(4000, function() { req2.destroy(); resolve(null); });
    req2.end();
  });
}
