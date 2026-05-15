export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { fileId, fileName } = req.body;
  if (!fileId || !fileName) return res.status(400).json({ success: false, error: 'Missing params' });

  // Token expires in 5 minutes
  const payload = JSON.stringify({ fileId, fileName, exp: Date.now() + 5 * 60 * 1000 });
  const token = Buffer.from(payload).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  // Extract extension from filename
  const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : 'bin';

  return res.status(200).json({
    success: true,
    token,
    url: `/f/${token}.${ext}`,
  });
}
