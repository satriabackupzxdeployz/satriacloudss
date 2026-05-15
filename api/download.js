// In-memory store for temp download tokens (valid 5 minutes)
// On Vercel each invocation is stateless, so we use a short-lived signed token approach
// encoded as: base64url(fileId|fileName|expiry) — no external DB needed

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) return res.status(500).end();

  const { token } = req.query;
  if (!token) return res.status(400).end();

  try {
    // Decode token: base64url -> JSON {fileId, fileName, exp}
    const raw = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const { fileId, fileName, exp } = JSON.parse(raw);

    if (Date.now() > exp) {
      return res.status(410).send('Link sudah kedaluwarsa. Coba unduh lagi dari web.');
    }

    // Get fresh Telegram URL
    const infoRes = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`);
    const infoData = await infoRes.json();
    if (!infoData.ok) return res.status(502).send('Gagal mengambil file dari penyimpanan.');

    const tgUrl = `https://api.telegram.org/file/bot${TOKEN}/${infoData.result.file_path}`;

    // Proxy the file bytes with correct headers so browser downloads it
    const fileRes = await fetch(tgUrl);
    if (!fileRes.ok) return res.status(502).send('Gagal mengambil file.');

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const safeFileName = encodeURIComponent(fileName);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFileName}; filename="${safeFileName}"`);
    res.setHeader('X-Powered-By', 'Satriaclouds');
    res.setHeader('Cache-Control', 'no-store');

    // Stream file to client
    const arrayBuf = await fileRes.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    res.send(buf);
  } catch (err) {
    return res.status(500).send('Terjadi kesalahan: ' + err.message);
  }
}
