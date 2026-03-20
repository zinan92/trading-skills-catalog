/**
 * GET /api/market-data?symbols=AAPL,NVDA,SPY
 * Fetches real-time quotes from Yahoo Finance (no API key needed)
 */
var https = require('https');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  var symbols = (req.query.symbols || 'SPY,QQQ,NVDA').split(',').map(function(s) { return s.trim(); }).join(',');

  var url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(symbols) +
    '&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,trailingPE,forwardPE,fiftyTwoWeekHigh,fiftyTwoWeekLow,fiftyDayAverage,twoHundredDayAverage';

  var options = {
    hostname: 'query1.finance.yahoo.com',
    path: '/v7/finance/quote?symbols=' + encodeURIComponent(symbols) +
      '&fields=symbol,shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,trailingPE,forwardPE,fiftyTwoWeekHigh,fiftyTwoWeekLow,fiftyDayAverage,twoHundredDayAverage',
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' }
  };

  var request = https.request(options, function(response) {
    var body = '';
    response.on('data', function(c) { body += c; });
    response.on('end', function() {
      try {
        var data = JSON.parse(body);
        var quotes = (data.quoteResponse && data.quoteResponse.result) || [];
        var result = quotes.map(function(q) {
          return {
            symbol: q.symbol,
            name: q.shortName || q.symbol,
            price: q.regularMarketPrice,
            change: q.regularMarketChange,
            changePct: q.regularMarketChangePercent,
            volume: q.regularMarketVolume,
            marketCap: q.marketCap,
            pe: q.trailingPE,
            forwardPE: q.forwardPE,
            high52w: q.fiftyTwoWeekHigh,
            low52w: q.fiftyTwoWeekLow,
            ma50: q.fiftyDayAverage,
            ma200: q.twoHundredDayAverage
          };
        });
        res.json({ quotes: result, timestamp: new Date().toISOString() });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse Yahoo Finance data', raw: body.substring(0, 200) });
      }
    });
  });

  request.on('error', function(err) {
    res.status(500).json({ error: err.message });
  });

  request.end();
};
