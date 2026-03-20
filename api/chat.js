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
