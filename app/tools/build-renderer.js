// Baut die Oberfläche für die App aus ../rigplan.html: alle Bibliotheken und Schriften lokal statt aus dem Netz.
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..'), root = path.join(app, '..'), out = path.join(app, 'renderer'), vendor = path.join(out, 'vendor'), nm = path.join(app, 'node_modules');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(vendor, 'fonts'), { recursive: true }); fs.mkdirSync(path.join(out, 'library'), { recursive: true });

let html = fs.readFileSync(path.join(root, 'rigplan.html'), 'utf8');
const swap = (from, to) => { if (!html.includes(from)) throw new Error('Nicht gefunden: ' + from); html = html.replace(from, to); };
const libs = [
  ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'three/build/three.min.js', 'three.min.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', 'three/examples/js/controls/OrbitControls.js', 'OrbitControls.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js', 'three/examples/js/controls/TransformControls.js', 'TransformControls.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', 'three/examples/js/loaders/GLTFLoader.js', 'GLTFLoader.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'jszip/dist/jszip.min.js', 'jszip.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js'],
];
libs.forEach(([url, src, name]) => { fs.copyFileSync(path.join(nm, src), path.join(vendor, name)); swap(url, `vendor/${name}`); });

// Schriften
const FONTS = [['barlow', 'Barlow', [400, 500, 600]], ['barlow-semi-condensed', 'Barlow Semi Condensed', [500, 600, 700]], ['jetbrains-mono', 'JetBrains Mono', [400, 600]]];
let css = '';
FONTS.forEach(([pkg, family, weights]) => weights.forEach(w => ['latin', 'latin-ext'].forEach(sub => {
  const file = `${pkg}-${sub}-${w}-normal.woff2`, src = path.join(nm, '@fontsource', pkg, 'files', file);
  if (!fs.existsSync(src)) throw new Error('Schrift fehlt: ' + file);
  fs.copyFileSync(src, path.join(vendor, 'fonts', file));
  css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${file}) format('woff2');${sub === 'latin' ? '' : 'unicode-range:U+0100-02AF,U+1E00-1EFF,U+20A0-20C0;'}}\n`;
})));
fs.writeFileSync(path.join(vendor, 'fonts.css'), css);
const fontLink = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/;
if (!fontLink.test(html)) throw new Error('Schrift-Link nicht gefunden');
html = html.replace(fontLink, '<link rel="stylesheet" href="vendor/fonts.css">');

// Bibliothek
['ofl-lib.js', 'OFL-LICENSE.txt'].forEach(f => fs.copyFileSync(path.join(root, 'library', f), path.join(out, 'library', f)));

// Keine Nachladen aus dem Netz; die Seite spricht nie selbst mit dem Internet
const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' file:; script-src 'self' file: 'unsafe-inline'; style-src 'self' file: 'unsafe-inline'; img-src 'self' file: data: blob:; font-src 'self' file:; connect-src blob: data:; media-src 'none'; object-src 'none'">`;
if (!/<head>/i.test(html)) throw new Error('head nicht gefunden');
html = html.replace(/<head>/i, m => `${m}\n${csp}`);
if (/https?:\/\/[^"' ]+\.(js|css)\b/.test(html.replace(/https:\/\/raw\.[^"' ]+/g, ''))) console.warn('Hinweis: es gibt noch externe Skript-/Stil-Adressen');
fs.writeFileSync(path.join(out, 'index.html'), html);

// Lizenzen der mitgelieferten Teile
const lic = [['three.js', 'three/LICENSE'], ['JSZip', 'jszip/LICENSE.markdown'], ['jsPDF', 'jspdf/LICENSE'], ['Barlow', '@fontsource/barlow/LICENSE'], ['Barlow Semi Condensed', '@fontsource/barlow-semi-condensed/LICENSE'], ['JetBrains Mono', '@fontsource/jetbrains-mono/LICENSE']];
fs.writeFileSync(path.join(out, 'THIRD-PARTY.txt'), lic.map(([n, p]) => { const f = path.join(nm, p); return `=== ${n} ===\n${fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '(siehe Paket ' + p + ')'}\n`; }).join('\n') + '\n=== Open Fixture Library ===\n' + fs.readFileSync(path.join(root, 'library', 'OFL-LICENSE.txt'), 'utf8'));
console.log('Oberfläche gebaut:', path.relative(app, out));
