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

function extractTickers(msg) {
  var tickers = [];
  var dollarMatch = msg.match(/\$([A-Z]{1,5})/g);
  if (dollarMatch) tickers = tickers.concat(dollarMatch.map(function(t) { return t.slice(1); }));
  var knownTickers = ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AMD','INTC','NFLX','CRM','ORCL','AVGO','QCOM','MU','TSM','ASML','ARM','PLTR','COIN','BABA','NIO','SPY','QQQ','IWM','GLD','TLT'];
  knownTickers.forEach(function(t) {
    if (msg.toUpperCase().indexOf(t) >= 0) tickers.push(t);
  });
  return tickers.filter(function(v, i, a) { return a.indexOf(v) === i; }).slice(0, 8);
}

function fetchMarketContext(message) {
  return new Promise(function(resolve) {
    var tickers = extractTickers(message);
    var symbols = ['SPY','QQQ'].concat(tickers).filter(function(v,i,a) { return a.indexOf(v) === i; });
    var https2 = require('https');
    var opts = {
      hostname: 'query1.finance.yahoo.com',
      path: '/v7/finance/quote?symbols=' + encodeURIComponent(symbols.join(',')) + '&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,trailingPE,forwardPE,fiftyTwoWeekHigh,fiftyTwoWeekLow,fiftyDayAverage,twoHundredDayAverage',
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
          var lines = ['Real-time data fetched at ' + new Date().toISOString(), ''];
          lines.push('| Symbol | Price | Change% | Volume | PE | 52W High | 52W Low | MA50 | MA200 |');
          lines.push('|--------|-------|---------|--------|----|---------|---------|----- |-------|');
          quotes.forEach(function(q) {
            lines.push('| ' + q.symbol + ' | $' + (q.regularMarketPrice||'-') + ' | ' + (q.regularMarketChangePercent ? q.regularMarketChangePercent.toFixed(2)+'%' : '-') + ' | ' + (q.regularMarketVolume ? (q.regularMarketVolume/1e6).toFixed(1)+'M' : '-') + ' | ' + (q.trailingPE ? q.trailingPE.toFixed(1) : '-') + ' | $' + (q.fiftyTwoWeekHigh||'-') + ' | $' + (q.fiftyTwoWeekLow||'-') + ' | $' + (q.fiftyDayAverage ? q.fiftyDayAverage.toFixed(2) : '-') + ' | $' + (q.twoHundredDayAverage ? q.twoHundredDayAverage.toFixed(2) : '-') + ' |');
          });
          lines.push('');
          lines.push('IMPORTANT: Use this REAL live data in your analysis. Do NOT make up prices.');
          resolve(lines.join('\n'));
        } catch(e) { resolve(null); }
      });
    });
    req2.on('error', function() { resolve(null); });
    req2.setTimeout(5000, function() { req2.destroy(); resolve(null); });
    req2.end();
  });
}
