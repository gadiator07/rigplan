// Wandelt die Open Fixture Library (fixtures/<hersteller>/<gerät>.json) in eine kompakte Bibliothek um.
// Aufruf: node tools/build-library.js <pfad-zu-fixtures> <zieldatei.js> <lizenz-datei>
// Die Eingabedateien sind reine Daten: sie werden nur mit JSON.parse gelesen.
const fs = require('fs'), path = require('path');
const [src, outFile, licenseFile] = process.argv.slice(2);
if (!src || !outFile) { console.error('Aufruf: build-library.js <fixtures> <ziel.js> [LICENSE]'); process.exit(1); }

const COLOR = { Red: 'ColorAdd_R', Green: 'ColorAdd_G', Blue: 'ColorAdd_B', White: 'ColorAdd_W', 'Warm White': 'ColorAdd_W', 'Cold White': 'ColorAdd_W', Amber: 'ColorAdd_A', UV: 'ColorAdd_UV', Cyan: 'ColorSub_C', Magenta: 'ColorSub_M', Yellow: 'ColorSub_Y' };
const TYPE = { Intensity: 'Dimmer', Pan: 'Pan', PanContinuous: 'Pan', Tilt: 'Tilt', TiltContinuous: 'Tilt', ShutterStrobe: 'Shutter1', StrobeSpeed: 'Shutter1', StrobeDuration: 'Shutter1', Zoom: 'Zoom', Focus: 'Focus1', Iris: 'Iris', Prism: 'Prism1', PrismRotation: 'Prism1', Frost: 'Frost1', ColorTemperature: 'CTO', ColorPreset: 'Color1' };

function guessCat(name, categories, hasPan, beam) {
  const n = name.toLowerCase(), first = categories[0] || '';
  if (hasPan || first === 'Moving Head' || first === 'Scanner' || first === 'Barrel Scanner') return /wash|aura|b-eye|bee ?eye/.test(n) || (beam && beam > 22) ? 'wash' : 'spot';
  if (first === 'Smoke' || first === 'Hazer' || first === 'Fan') return 'haze';
  if (first === 'Laser' || first === 'Flower' || first === 'Effect') return 'effect';
  if (first === 'Pixel Bar' || first === 'Matrix') return 'bar';
  if (first === 'Strobe' || /strob/.test(n)) return 'strobe';
  if (first === 'Blinder' || /blind|molefay|dwe/.test(n)) return 'blinder';
  if (/fresnel|stufen|pc\b/.test(n)) return 'fresnel';
  if (/profil|ellipso|source four|leko/.test(n)) return 'profile';
  if (first === 'Dimmer' && !/\bpar\b|par ?\d|led/.test(n)) return 'dimmer';
  return 'par';
}
const naturally = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
// Pixel eines Geräts mit Koordinaten
function pixels(matrix) {
  const out = [];
  if (matrix.pixelKeys) matrix.pixelKeys.forEach((plane, z) => plane.forEach((row, y) => row.forEach((key, x) => { if (key !== null) out.push({ key, x, y, z }); })));
  else if (matrix.pixelCount) { const [nx, ny, nz] = matrix.pixelCount, dims = matrix.pixelCount.filter(n => n > 1).length;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const key = dims <= 1 ? String(x + y + z + 1) : dims === 2 ? (nz === 1 ? `(${x + 1}, ${y + 1})` : ny === 1 ? `(${x + 1}, ${z + 1})` : `(${y + 1}, ${z + 1})`) : `(${x + 1}, ${y + 1}, ${z + 1})`; out.push({ key, x, y, z }); } }
  return out;
}
function repeatKeys(matrix, repeatFor) {
  const px = pixels(matrix), groups = Object.keys(matrix.pixelGroups || {});
  if (Array.isArray(repeatFor)) return repeatFor;
  if (repeatFor === 'eachPixelABC') return px.map(p => p.key).sort(naturally);
  if (repeatFor === 'eachPixelGroup') return groups;
  const m = /^eachPixel([XYZ])([XYZ])([XYZ])$/.exec(repeatFor || '');
  if (!m) throw new Error('repeatFor unbekannt: ' + repeatFor);
  const [a, b, c] = [m[1], m[2], m[3]].map(s => s.toLowerCase()); // erste Achse läuft am schnellsten
  return [...px].sort((p, q) => p[c] - q[c] || p[b] - q[b] || p[a] - q[a]).map(p => p.key);
}
function convert(j, man, key, manName) {
  // Kanaldefinitionen inkl. Vorlagen und Aliasnamen
  const defs = { ...(j.availableChannels || {}) }, alias = {}, swAlias = {};
  const templates = Object.entries(j.templateChannels || {}).map(([k, c]) => ({ k, c, re: new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$pixelKey/g, '(.+)') + '$') }));
  const lookup = name => { if (defs[name]) return defs[name]; for (const t of templates) if (t.re.test(name)) return t.c; return null; };
  const addAliases = (k, c, px) => { (c.fineChannelAliases || []).forEach(a => alias[px != null ? a.replace(/\$pixelKey/g, px) : a] = k);
    (c.capabilities || []).forEach(cp => Object.entries(cp.switchChannels || {}).forEach(([al, target]) => { const n = px != null ? al.replace(/\$pixelKey/g, px) : al; (swAlias[n] ||= (px != null ? target.replace(/\$pixelKey/g, px) : target)); })); };
  Object.entries(defs).forEach(([k, c]) => addAliases(k, c));
  const wheelIsGobo = (ch, cap) => { const w = (j.wheels || {})[cap.wheel || ch]; if (w && (w.slots || []).some(s => /Gobo/.test(s.type || ''))) return true; if (w && (w.slots || []).some(s => s.type === 'Color')) return false; return /gobo/i.test(cap.wheel || ch); };
  const attrFor = (name, used) => {
    const target = swAlias[name] || name, c = lookup(target) || {}, caps = c.capability ? [c.capability] : (c.capabilities || []), cap = caps.find(x => x.type !== 'NoFunction') || caps[0] || {};
    let a = cap.type === 'ColorIntensity' ? COLOR[cap.color] : /^Wheel(Slot|Rotation|Shake)/.test(cap.type || '') ? (wheelIsGobo(target, cap) ? 'Gobo1' : 'Color1') : cap.type === 'Effect' && /gobo/i.test(target) ? 'Gobo1' : TYPE[cap.type];
    if (!a || used.has(a)) { let i = 1; while (used.has('Control' + i)) i++; a = 'Control' + i; }
    used.add(a); return a;
  };
  // Modus ausrollen: Pixelblöcke und leere Kanäle zählen wie am Gerät
  const modes = (j.modes || []).map(m => {
    const list = [];
    (m.channels || []).forEach(ch => {
      if (ch === null || typeof ch === 'string') { list.push(ch); return; }
      if (ch.insert !== 'matrixChannels' || !j.matrix) throw new Error('unbekannter Kanaleintrag');
      const keys = repeatKeys(j.matrix, ch.repeatFor), tpl = ch.templateChannels || [];
      if (ch.channelOrder === 'perChannel') tpl.forEach(t => keys.forEach(px => list.push(t === null ? null : t.replace(/\$pixelKey/g, px))));
      else keys.forEach(px => tpl.forEach(t => list.push(t === null ? null : t.replace(/\$pixelKey/g, px))));
    });
    // Aliasnamen der ausgerollten Vorlagen
    list.forEach(n => { if (!n) return; for (const t of templates) { const r = t.re.exec(n); if (r) addAliases(n, t.c, r[1]); } });
    const used = new Set(), byKey = {}, channels = []; let off = 0;
    list.forEach(n => {
      off++; if (!n) return;
      const main = alias[n], k = main || n;
      if (byKey[k]) { if (main) byKey[k].off.push(off); else byKey[k].off.unshift(off); return; }
      const c = { a: attrFor(k, used), off: [off], l: k }; byKey[k] = c; channels.push(c);
    });
    return { n: m.name || m.shortName || `${off}ch`, f: off, ch: channels.map(c => [c.a, c.l, ...c.off]) };
  });
  if (!modes.length || !modes.some(m => m.f > 0)) throw new Error('keine Modi');
  const hasPan = modes.some(m => m.ch.some(c => c[0] === 'Pan'));
  const lens = j.physical && j.physical.lens && j.physical.lens.degreesMinMax, beam = lens ? (lens[0] + lens[1]) / 2 : null, cats = j.categories || [];
  const dim = (j.physical && j.physical.dimensions) || null;
  return { id: `ofl-${man}-${key}`, m: manName, n: j.name || key, s: j.shortName || j.name || key, c: guessCat(j.name || key, cats, hasPan, beam), pan: hasPan ? 1 : 0, b: beam, w: (j.physical && j.physical.weight) || null, p: (j.physical && j.physical.power) || null, d: dim ? dim.map(v => +(v / 1000).toFixed(3)) : null, r: (j.meta && j.meta.lastModifyDate) || null, modes };
}

const manufacturers = JSON.parse(fs.readFileSync(path.join(src, 'manufacturers.json'), 'utf8'));
const out = [], failed = []; let total = 0;
for (const man of fs.readdirSync(src).sort()) {
  const dir = path.join(src, man); if (!fs.statSync(dir).isDirectory()) continue;
  const manName = (manufacturers[man] && manufacturers[man].name) || man;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue; total++;
    const key = file.slice(0, -5);
    try { let j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); const own = j;
      if (j.redirectTo) { j = { ...JSON.parse(fs.readFileSync(path.join(src, j.redirectTo + '.json'), 'utf8')), name: own.name, shortName: own.shortName || own.name }; if (j.redirectTo) throw new Error('Weiterleitung auf Weiterleitung'); }
      if (!j.modes) throw new Error('kein Gerät'); out.push(convert(j, man, key, manName)); }
    catch (e) { failed.push(`${man}/${file}: ${e.message}`); }
  }
}
out.sort((a, b) => a.m.localeCompare(b.m, 'de') || a.n.localeCompare(b.n, 'de', { numeric: true }));
const stamp = new Date().toISOString().slice(0, 10);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `window.OFL_LIB=${JSON.stringify({ date: stamp, source: 'Open Fixture Library (MIT)', list: out })};\n`);
if (licenseFile) fs.copyFileSync(licenseFile, path.join(path.dirname(outFile), 'OFL-LICENSE.txt'));
const size = fs.statSync(outFile).size;
console.log(JSON.stringify({ total, converted: out.length, failed: failed.length, sizeMB: +(size / 1048576).toFixed(2), manufacturers: new Set(out.map(o => o.m)).size, withMatrixChannels: out.filter(o => o.modes.some(m => m.f > 32)).length, maxFootprint: Math.max(...out.flatMap(o => o.modes.map(m => m.f))) }));
failed.slice(0, 30).forEach(f => console.log('  FEHLER ' + f));
