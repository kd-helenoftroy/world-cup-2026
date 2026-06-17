export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // Vercel parses both JSON and form-urlencoded bodies into req.body
  const ics = req.body?.ics;
  if (!ics) return res.status(400).end();
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="world-cup-2026.ics"');
  res.send(ics);
}
