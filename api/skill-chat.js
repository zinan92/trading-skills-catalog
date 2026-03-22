const fs = require('fs');
const path = require('path');
const https = require('https');

function sanitizeError(msg) {
  return (msg || 'Unknown error').replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-***').replace(/Bearer [^\s"]+/g, 'Bearer ***');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  var { message, history = [], skill = '', provider = 'minimax', api_key = '' } = req.body || {};

  if (!skill) { res.status(400).json({ error: 'Missing skill parameter' }); return; }

  // Load the skill's SKILL.md as system prompt
  var skillPath = path.join(process.cwd(), 'skills', skill, 'SKILL.md');
  var systemPrompt = '';
  try {
    systemPrompt = fs.readFileSync(skillPath, 'utf-8');
  } catch (e) {
    res.status(404).json({ error: 'Skill not found: ' + skill }); return;
  }

  // Strip frontmatter (--- ... ---)
  systemPrompt = systemPrompt.replace(/^---[\s\S]*?---\n*/m, '');

  // Add instructions for the bot
  systemPrompt += '\n\n## Response Guidelines\n';
  systemPrompt += '- You are a focused assistant for this specific trading methodology.\n';
  systemPrompt += '- Apply this methodology to answer the user\'s question.\n';
  systemPrompt += '- Use tables, scores, and structured output.\n';
  systemPrompt += '- End with actionable recommendations.\n';
  systemPrompt += '- Respond in the same language as the user.\n';

  var apiKey = (api_key || process.env.MINIMAX_API_KEY || '').trim();
  if (!apiKey) {
    res.status(400).json({ error: 'No API key configured' }); return;
  }

  var messages = history.map(function(m) { return { role: m.role, content: m.content }; });
  messages.push({ role: 'user', content: message });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  // Stream from MiniMax
  var fullMessages = [{ role: 'system', content: systemPrompt }].concat(messages);
  var payload = JSON.stringify({
    model: 'MiniMax-M1',
    messages: fullMessages,
    stream: true,
    max_tokens: 4096,
    tools: []
  });

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

    response.on('end', function() { res.end(); });
    response.on('error', function(err) {
      res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(err.message) }) + '\n\n');
      res.end();
    });
  });

  request.on('error', function(err) {
    res.write('data: ' + JSON.stringify({ type: 'error', error: sanitizeError(err.message) }) + '\n\n');
    res.end();
  });

  request.write(payload);
  request.end();
};

module.exports.config = { maxDuration: 60 };
