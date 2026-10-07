// Penghitung kunjungan. Opsional: butuh env UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN.
// Kalau env belum diisi, endpoint balas 503 dan counter di halaman otomatis tersembunyi.
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'not-configured' });
  try {
    const n = req.method === 'POST'
      ? await redis(['INCR', 'a7x:visits'])
      : Number((await redis(['GET', 'a7x:visits'])) || 0);
    return res.status(200).json({ n });
  } catch (e) {
    return res.status(500).json({ error: 'failed' });
  }
};
