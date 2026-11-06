// Zeichnet das App-Symbol (Traverse in Bernstein auf dunklem Grund) als PNG, ganz ohne Grafik-Paket.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const N = 512, px = Buffer.alloc(N * N * 4);
const inRound = (x, y, r) => { const m = N - 1, dx = Math.max(r - x, x - (m - r), 0), dy = Math.max(r - y, y - (m - r), 0); return dx * dx + dy * dy <= r * r; };
const segDist = (x, y, a, b, c, d) => { const vx = c - a, vy = d - b, t = Math.max(0, Math.min(1, ((x - a) * vx + (y - b) * vy) / (vx * vx + vy * vy))); return Math.hypot(x - a - t * vx, y - b - t * vy); };
const top = 170, bot = 342, l = 56, r = 456, segs = [[l, top, r, top, 15], [l, bot, r, bot, 15]];
const n = 5; for (let i = 0; i < n; i++) { const x0 = l + (r - l) * i / n, x1 = l + (r - l) * (i + 1) / n; segs.push(i % 2 ? [x0, top, x1, bot, 9] : [x0, bot, x1, top, 9]); }
segs.push([l, top, l, bot, 9], [r, top, r, bot, 9]);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const i = (y * N + x) * 4;
  if (!inRound(x, y, 96)) continue;
  let on = false; for (const [a, b, c, d, w] of segs) if (segDist(x, y, a, b, c, d) <= w) { on = true; break; }
  const dot = Math.hypot(x - 256, y - 256) <= 0;
  px[i] = on ? 0xf0 : 0x14; px[i + 1] = on ? 0xa1 : 0x18; px[i + 2] = on ? 0x2a : 0x1f; px[i + 3] = dot ? 255 : 255;
}
const crcT = Array.from({ length: 256 }, (_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((N * 4 + 1) * N); for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, '..', 'build', 'icon.png'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, png); console.log('Symbol:', out, png.length, 'Bytes');
