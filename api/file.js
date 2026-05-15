// In-memory cache: file_id → { file_path, expiry }
// Telegram file_path valid ~1 jam, kita cache 55 menit biar aman
const pathCache = new Map();
const TTL = 55 * 60 * 1000; // 55 menit

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) return res.status(500).end();

  const { file_id } = req.query;
  if (!file_id) return res.status(400).end();

  try {
    let filePath = null;
    const cached = pathCache.get(file_id);
    const now = Date.now();

    if (cached && cached.expiry > now) {
      // Gunakan cache — tidak perlu hit Telegram API lagi
      filePath = cached.file_path;
    } else {
      // Fetch fresh dari Telegram
      const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(file_id)}`);
      const data = await r.json();
      if (!data.ok) return res.status(502).json({ success: false, error: 'Storage error' });

      filePath = data.result.file_path;
      // Simpan ke cache
      pathCache.set(file_id, { file_path: filePath, expiry: now + TTL });

      // Bersihkan cache lama supaya tidak memory leak
      if (pathCache.size > 500) {
        for (const [k, v] of pathCache) {
          if (v.expiry <= now) pathCache.delete(k);
        }
      }
    }

    const tgUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
    const fileRes = await fetch(tgUrl);

    if (!fileRes.ok) {
      // file_path expired (edge case), hapus cache dan retry fresh
      pathCache.delete(file_id);
      const r2 = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(file_id)}`);
      const d2 = await r2.json();
      if (!d2.ok) return res.status(502).json({ success: false, error: 'Storage error' });
      const freshPath = d2.result.file_path;
      pathCache.set(file_id, { file_path: freshPath, expiry: Date.now() + TTL });
      const fileRes2 = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${freshPath}`);
      if (!fileRes2.ok) return res.status(502).end();
      const ct2 = fileRes2.headers.get('content-type') || 'application/octet-stream';
      const buf2 = Buffer.from(await fileRes2.arrayBuffer());
      res.setHeader('Content-Type', ct2);
      res.setHeader('Cache-Control', 'private, max-age=3300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      return res.status(200).send(buf2);
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await fileRes.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3300'); // browser cache 55 menit
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.status(200).send(buf);
  } catch {
    res.status(500).end();
  }
}
