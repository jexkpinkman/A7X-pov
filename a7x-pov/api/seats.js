// Fitur "Cari teman": simpan nama + kursi. Opsional, butuh env Upstash yang sama dengan visit.js.
// Kalau env belum diisi, endpoint balas 503 dan bagian "Cari teman" nggak muncul.
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'a7x:seats';
const SEATS = 120;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

// buang karakter kontrol & tag, batasi 30 karakter
const cleanName = (s) =>
  String(s || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'not-configured' });
  try {
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', KEY])) || [];
      const items = [];
      for (let k = 1; k < flat.length && items.length < 2000; k += 2) {
        try { items.push(JSON.parse(flat[k])); } catch (e) { /* skip */ }
      }
      return res.status(200).json({ items });
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const id = String(b.id || '');
      if (!/^[a-z0-9]{6,40}$/i.test(id)) return res.status(400).json({ error: 'bad-id' });
      const name = cleanName(b.name);
      if (!name) {
        await redis(['HDEL', KEY, id]);
        return res.status(200).json({ ok: true });
      }
      const d = parseInt(b.door, 10), s = parseInt(b.seat, 10);
      const r = String(b.row || '').toUpperCase();
      const tier = Math.floor(d / 100), i = d % 100;
      if (!(tier >= 1 && tier <= 3 && i >= 1 && i <= 60)) return res.status(400).json({ error: 'bad-door' });
      if (!/^([A-Z]|\d{1,2})$/.test(r)) return res.status(400).json({ error: 'bad-row' });
      if (!(s >= 1 && s <= SEATS)) return res.status(400).json({ error: 'bad-seat' });
      await redis(['HSET', KEY, id, JSON.stringify({ n: name, d, r, s })]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'failed' });
  }
};
