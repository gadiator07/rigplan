// Prüft die echte App mit echten Mausereignissen. Aufruf: node tools/test-app.js <screenshot-ordner> [pfad-zur-exe]
// Der GDTF Share wird dabei durch einen lokalen Testserver ersetzt (nur ohne Installer, siehe main.js).
const { _electron } = require('playwright-core'), http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
const shots = process.argv[2] || os.tmpdir(), exe = process.argv[3];
const results = []; const ok = (name, pass, info = '') => { results.push(pass); console.log(`${pass ? 'OK  ' : 'FEHL'} ${name}${info !== '' ? ' → ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let shareState = { logged: false, gdtf: null };
  const reqLog = []; const srv = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { reqLog.push([req.method, req.url, req.headers.cookie || '']);
    const J = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url.endsWith('login.php')) { let j = {}; try { j = JSON.parse(b); } catch (e) {} if (j.user === 'test' && j.password === 'test-pass') { shareState.logged = true; res.setHeader('Set-Cookie', 'PHPSESSID=abc; path=/'); return J(200, { result: true }); } return J(401, { result: false, error: 'Falscher Login.' }); }
    if (!(req.headers.cookie || '').includes('PHPSESSID=abc')) return J(401, { result: false, error: 'Unauthorized.' });
    if (req.url.endsWith('getList.php')) return J(200, { result: true, list: [{ rid: 77, fixture: 'Test Spot', manufacturer: 'Testwerk', revision: 'v1', modes: [{ name: 'Std', dmxfootprint: 16 }] }, { rid: 78, fixture: 'Kaputt', manufacturer: 'Testwerk', revision: 'v1', modes: [] }] });
    if (req.url.includes('rid=77')) { res.writeHead(200); return res.end(shareState.gdtf); }
    if (req.url.includes('rid=78')) { res.writeHead(200); return res.end('kein zip'); }
    J(404, { result: false });
  }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`, userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rigplan-test-'));
  const launch = () => _electron.launch(exe ? { executablePath: exe, args: [`--user-data-dir=${userData}`] } : { args: ['.', `--user-data-dir=${userData}`], cwd: path.join(__dirname, '..'), env: { ...process.env, RIGPLAN_SHARE_BASE: base } });
  let app = await launch(), page = await app.firstWindow();
  const errors = [], net = [];
  const watch = p => { p.on('pageerror', e => errors.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); p.on('request', r => { if (/^https?:/.test(r.url())) net.push(r.url()); }); };
  watch(page);
  await page.waitForFunction(() => window.P && document.querySelector('#planSvg *'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => { try { return typeof P !== 'undefined' && P.fixtures.length > 0; } catch (e) { return false; } }, null, { timeout: 30000 });
  await page.setViewportSize({ width: 1500, height: 920 }).catch(() => {});
  ok('Start ohne Netz', true);
  const info = await page.evaluate(() => ({ three: THREE.REVISION, orbit: !!THREE.OrbitControls, zip: !!window.JSZip, pdf: !!window.jspdf, lib: OFL_LIB.list.length, app: !!window.rigplanApp, node: typeof require, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).length, fixtures: P.fixtures.length }));
  ok('Bibliotheken lokal geladen', info.three === '128' && info.orbit && info.zip && info.pdf && info.lib > 600, info);
  ok('Seite hat keinen Node-Zugriff', info.node === 'undefined');
  await page.screenshot({ path: path.join(shots, 'app-plan.png') });

  // Bibliothek
  await page.fill('#libSearch', 'sharpy'); await wait(100);
  const hits = await page.$$eval('#libList [data-type]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok('Suche findet Sharpy', hits.some(h => /Sharpy/.test(h)), hits.slice(0, 3));
  await page.click('#libList [data-type^="ofl-clay-paky-sharpy"]'); await wait(100);
  const t = await page.evaluate(() => ({ tool, libSel, modes: TYPES.get(libSel).modes.map(m => m.footprint) }));
  ok('Klick wählt Gerät und Einhängen', t.tool === 'fixture' && t.modes.length > 0, t);
  await page.screenshot({ path: path.join(shots, 'app-library.png') });
  const placed = await page.evaluate(() => { const q = slotPoints(true).find(s => !s.taken); toolDown([q.x, q.y], { shiftKey: false, ctrlKey: false, altKey: false, target: document.body }); const f = P.fixtures.at(-1); return { type: f.typeId, fp: footprint(f), inProject: P.customTypes.some(c => c.id === f.typeId), addr: [f.universe, f.address] }; });
  ok('Gerät aus Bibliothek gesetzt und im Projekt gespeichert', placed.inProject && placed.fp > 0, placed);
  await page.fill('#libSearch', ''); await page.selectOption('#libMan', { index: 3 }); await wait(50); await page.selectOption('#libMan', ''); await page.keyboard.press('Escape');
  const pixel = await page.evaluate(() => { const r = OFL_LIB.list.find(x => x.n === 'ALC4' && /ADB/.test(x.m)); return r.modes.map(m => m.f); });
  ok('Pixelgerät hat richtige Kanalzahl (ADB ALC4: 5/20/21)', pixel[0] === 5 && pixel[1] === 20 && pixel[2] === 21, pixel);

  // MVR mit Bibliotheksgerät
  const mvr = await page.evaluate(async () => { const got = []; const o = window.download; window.download = (b, n) => got.push(n, b); await exportMVR(); window.download = o; const z = await JSZip.loadAsync(got[1]); const names = Object.keys(z.files), xml = await z.file('GeneralSceneDescription.xml').async('string'), sh = names.find(n => /Sharpy/i.test(n)); const d = sh ? await (await JSZip.loadAsync(await z.file(sh).async('uint8array'))).file('description.xml').async('string') : ''; const doc = new DOMParser().parseFromString(d, 'application/xml'); return { names: names.length, sharpy: !!sh, fixtures: (xml.match(/<Fixture /g) || []).length, xmlOk: !doc.querySelector('parsererror'), channels: doc.querySelectorAll('DMXMode')[0]?.querySelectorAll('DMXChannel').length }; });
  ok('MVR enthält Bibliotheksgerät mit gültigem GDTF', mvr.sharpy && mvr.xmlOk && mvr.channels > 0, mvr);

  // 3D mit echter Maus
  await page.evaluate(() => { setTab('3d'); setTool('select'); setGizmoMode('translate'); $('#o3Beams').checked = false; dirty3d = true; }); await wait(600);
  await page.screenshot({ path: path.join(shots, 'app-3d.png') });
  const box = await page.evaluate(() => { const b = T3.r.domElement.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, cam = () => page.evaluate(() => T3.cam.position.toArray());
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let c0 = await cam(); await page.mouse.move(cx, cy); await page.mouse.down({ button: 'left' }); await page.mouse.move(cx + 120, cy, { steps: 6 }); await page.mouse.up({ button: 'left' }); await wait(100);
  ok('Griff Verschieben: Links ziehen dreht', dist(c0, await cam()) > 1, +dist(c0, await cam()).toFixed(1));
  const spot = await page.evaluate(() => { const b = T3.r.domElement.getBoundingClientRect(), pc = P.truss.find(q => q.name === 'GS Vorn' && q.len >= 3), v = new THREE.Vector3(pc.x, pc.y, pc.z + .1).project(T3.cam); S = new Set(); selChanged(); return { x: (v.x + 1) / 2 * b.width + b.left, y: (1 - v.y) / 2 * b.height + b.top, id: pc.id }; });
  c0 = await cam(); await page.mouse.move(spot.x, spot.y); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await wait(100);
  const sel = await page.evaluate(() => [...S].map(id => findObj(id)[0]));
  ok('Rechtsklick wählt aus', sel.length === 1, sel); ok('Rechtsklick dreht nicht', dist(c0, await cam()) < .01);
  const grip = await page.evaluate(() => { T3.r.render(T3.scene, T3.cam); T3.tc.updateMatrixWorld(true); const b = T3.r.domElement.getBoundingClientRect(), pv = T3.proxy.position.clone().project(T3.cam), gx = (pv.x + 1) / 2 * b.width + b.left, gy = (1 - pv.y) / 2 * b.height + b.top; for (let r = 20; r <= 180; r += 5) for (let a = 0; a < 360; a += 10) { const x = gx + Math.cos(a * Math.PI / 180) * r, y = gy + Math.sin(a * Math.PI / 180) * r; if (x < b.left + 4 || x > b.right - 4 || y < b.top + 4 || y > b.bottom - 4) continue; T3.tc.axis = null; T3.tc.pointerHover(tcPointer({ clientX: x, clientY: y }, -1)); if (T3.tc.axis === 'X' || T3.tc.axis === 'Y') { const ax = T3.tc.axis; T3.tc.axis = null; const o = findObj([...S][0])[1]; return { x, y, ax, px: o.x, py: o.y, id: o.id }; } } T3.tc.axis = null; return null; });
  if (grip) { await page.mouse.move(grip.x, grip.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(grip.x + 80, grip.y + 30, { steps: 8 }); await page.mouse.up({ button: 'right' }); await wait(200); const after = await page.evaluate(id => { const o = findObj(id)[1]; return { x: o.x, y: o.y, drag: T3.tc.dragging, en: T3.ctl.enabled }; }, grip.id); ok('Rechts am Griff ziehen verschiebt', Math.hypot(after.x - grip.px, after.y - grip.py) > .05 && !after.drag && after.en, { d: +Math.hypot(after.x - grip.px, after.y - grip.py).toFixed(2), ax: grip.ax }); } else ok('Griff gefunden', false);
  await page.keyboard.down('Shift'); await page.mouse.move(box.x + 60, box.y + 60); await page.mouse.down({ button: 'left' }); await page.mouse.move(box.x + box.w - 60, box.y + box.h - 60, { steps: 5 }); await page.mouse.up({ button: 'left' }); await page.keyboard.up('Shift'); await wait(100);
  ok('Shift+Links zieht Rahmen', (await page.evaluate(() => S.size)) > 5, await page.evaluate(() => S.size));
  await page.evaluate(() => { S = new Set(); selChanged(); setGizmoMode('rotate'); }); c0 = await cam(); await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 100, cy, { steps: 5 }); await page.mouse.up({ button: 'right' }); await wait(100);
  ok('Griff Drehen: Rechts ziehen dreht wie bisher', dist(c0, await cam()) > 1); await page.evaluate(() => setGizmoMode('translate'));
  await page.evaluate(() => { T3.cam.position.set(1, 2, 90000); }); await page.click('[data-view="persp"]'); await wait(200);
  ok('Knopf 3D holt die Kamera zurück', await page.evaluate(() => camOK()));

  // GDTF Share
  if (!exe) {
    shareState.gdtf = Buffer.from(await page.evaluate(async () => Array.from(await genGDTF(TYPES.get('gen-spot')))));
    await page.evaluate(() => setTab('plan')); await page.click('[data-ltab="lib"]'); await page.click('#bShare'); await wait(150);
    await page.fill('#shUser', 'test'); await page.fill('#shPass', 'falsch'); await page.click('#shForm button[type=submit]'); await page.waitForFunction(() => /Falscher/.test($('#shStatus').textContent));
    ok('Falsches Passwort wird gemeldet', true);
    await page.fill('#shPass', 'test-pass'); await page.click('#shForm button[type=submit]'); await page.waitForSelector('[data-rid="77"]', { timeout: 8000 }).catch(async e => { console.log('STATUS', await page.evaluate(() => $('#shStatus').textContent + ' | ' + $('#shBody').innerText.slice(0, 200)), 'LOG', reqLog); throw e; });
    await page.screenshot({ path: path.join(shots, 'app-share.png') });
    await page.fill('#shQ', 'kaputt'); await wait(50); await page.click('[data-rid="78"]'); await page.waitForFunction(() => /keine GDTF/i.test($('#shStatus').textContent)); ok('Kaputte Datei wird abgelehnt', true);
    await page.fill('#shQ', 'test spot'); await wait(50); const before = await page.evaluate(() => TYPES.size); await page.click('[data-rid="77"]'); await page.waitForFunction(n => TYPES.size > n || !$('#shareDlg').open, before, { timeout: 8000 }).catch(() => {}); await wait(200);
    const sh = await page.evaluate(() => ({ open: $('#shareDlg').open, sel: TYPES.get(libSel)?.name, src: TYPES.get(libSel)?.source, st: $('#shStatus')?.textContent }));
    ok('Profil aus Share geladen', !sh.open && sh.src === 'gdtf', sh);
    const pw = fs.readdirSync(userData, { recursive: true }).filter(f => { try { const p = path.join(userData, String(f)); return fs.statSync(p).isFile() && fs.statSync(p).size < 5e6 && fs.readFileSync(p).includes('test-pass'); } catch (e) { return false; } });
    ok('Passwort liegt nirgends auf der Platte', pw.length === 0, pw);
  }
  // Speichern über Neustart
  await page.evaluate(() => { P.name = 'Neustart-Test'; save(); }); await wait(600); const nF = await page.evaluate(() => P.fixtures.length); await app.close();
  app = await launch(); page = await app.firstWindow(); watch(page); await page.waitForFunction(() => { try { return typeof P !== 'undefined' && P.fixtures.length > 0; } catch (e) { return false; } }, null, { timeout: 30000 });
  const re = await page.evaluate(() => { const t = P.fixtures.map(f => typeOf(f)); return { name: P.name, n: P.fixtures.length, missing: t.filter(x => !x).length, ofl: t.filter(x => x && x.source === 'ofl').length }; });
  ok('Projekt und Bibliotheksgerät überleben den Neustart', re.name === 'Neustart-Test' && re.n === nF && !re.missing && re.ofl > 0, re);
  await app.close(); srv.close();
  const outside = net.filter(u => !u.startsWith(base));
  ok('Keine Anfragen ins Netz aus der Seite', outside.length === 0, outside.slice(0, 5));
  ok('Keine Fehler in der Konsole', errors.length === 0, errors.slice(0, 8));
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${results.filter(Boolean).length}/${results.length} bestanden`); process.exit(results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error('ABBRUCH', e); process.exit(2); });
