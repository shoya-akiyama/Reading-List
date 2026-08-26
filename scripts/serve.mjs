// 同じ Wi-Fi 内の端末から教材を開くための簡易サーバー。
// 外部には公開されない（ルーターの内側だけで届く）。
// 使い方: npm run serve  もしくは start-server.bat をダブルクリック
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ROOT の外に出る ../ を弾いたうえで実ファイルのパスに変換する
function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  if (relative === '..' || relative.startsWith(`..${sep}`)) return null;
  return join(ROOT, relative || 'index.html');
}

async function statFile(path) {
  try {
    const info = await stat(path);
    if (info.isDirectory()) return statFile(join(path, 'index.html'));
    return { path, size: info.size };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const path = resolvePath(req.url);
  const file = path && (await statFile(path));
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const headers = {
    'Content-Type': TYPES[extname(file.path).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };

  // 音声のシークとスマホでの再生には Range 応答が要る
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : file.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : file.size - 1;
    start = Math.max(0, start);
    end = Math.min(file.size - 1, end);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${file.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${file.size}`,
      'Content-Length': end - start + 1,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file.path, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, 'Content-Length': file.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file.path).pipe(res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ポート ${PORT} は使用中です。別のポートで起動するには:  set PORT=8081 && npm run serve`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

  console.log('\n  English Reading をこの PC から配信中です。Ctrl+C で停止します。\n');
  console.log(`  この PC:              http://localhost:${PORT}/`);
  for (const address of addresses) {
    console.log(`  スマホ・タブレット:   http://${address}:${PORT}/`);
  }
  console.log('\n  ※ 同じ Wi-Fi につないだ端末からのみ開けます（インターネットには公開されません）。\n');
});
