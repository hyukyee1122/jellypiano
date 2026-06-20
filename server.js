// ?¤ë¦¬?¼ì•„??ë¡œì»¬ ê°œë°œ ?œë²„ (?˜ì¡´???†ìŒ ??Node ?´ìž¥ ëª¨ë“ˆë§??¬ìš©)
//
// ?¤í–‰:
//   node server.js            (ê¸°ë³¸ ?¬íŠ¸ 8080)
//   node server.js 3000       (?¬íŠ¸ ì§€??
//
// ë¸Œë¼?°ì??ì„œ http://localhost:8080 ?‘ì† ??index.html ??ê²Œìž„???„ì?.
// localhost ?ì„œ??app.js ê°€ ?ë™?¼ë¡œ ë¡œì»¬ json/mp3 ?Œì¼???¬ìš©?œë‹¤.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = parseInt(process.argv[2], 10) || 8080;
const HOST = '0.0.0.0';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3':  'audio/mpeg',
    '.mid':  'audio/midi',
    '.mscz': 'application/octet-stream',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
};

const server = http.createServer((req, res) => {
    // ì¿¼ë¦¬?¤íŠ¸ë§??v=2 ?? ?œê±° ??URL ?”ì½”??(?œê? ?Œì¼ëª??€??
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    if (urlPath === '/game' || urlPath === '/game/') urlPath = '/game/index.html';

    // ê²½ë¡œ ?•ê·œ??+ ?”ë ‰?°ë¦¬ ?ˆì¶œ(../) ì°¨ë‹¨
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + urlPath);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            // ë¡œì»¬ ê°œë°œ?´ë?ë¡?ìºì‹œ ë¹„í™œ?±í™” (ì½”ë“œ ?˜ì • ì¦‰ì‹œ ë°˜ì˜)
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(data);
    });
});

server.listen(PORT, HOST, () => {
    const urls = [
        'http://localhost:' + PORT,
        'http://127.0.0.1:' + PORT,
    ];

    Object.values(os.networkInterfaces()).forEach((entries) => {
        (entries || []).forEach((entry) => {
            if (entry.family === 'IPv4' && !entry.internal) {
                urls.push('http://' + entry.address + ':' + PORT);
            }
        });
    });

    console.log('JellyPiano local server running');
    console.log('Listening on: ' + HOST + ':' + PORT);
    console.log('Open one of these addresses:');
    Array.from(new Set(urls)).forEach((url) => console.log('  ' + url));
    console.log('Stop: Ctrl + C');
});