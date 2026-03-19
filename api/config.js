export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    has_platform_key: !!process.env.MINIMAX_API_KEY,
    has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    default_provider: process.env.MINIMAX_API_KEY ? 'minimax' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'none',
  });
}
