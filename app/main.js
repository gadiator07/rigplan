// RigPlan Desktop: lädt die Oberfläche lokal. Netz nur für den GDTF Share, und nur wenn der Nutzer sich dort anmeldet.
const { app, BrowserWindow, Menu, shell, ipcMain, session } = require('electron');
const path = require('path'), fs = require('fs');

const SHARE_BASE = (!app.isPackaged && process.env.RIGPLAN_SHARE_BASE) || 'https://gdtf-share.com/apis/public';
const MAX_GDTF = 80 * 1024 * 1024;
let win = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1100, minHeight: 680, backgroundColor: '#0f1218', show: false, title: 'RigPlan',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  // Links öffnen im normalen Browser, die App selbst navigiert nie weg (auch nicht bei hineingezogenen Dateien)
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// GDTF Share: Anmeldung und Downloads laufen hier, das Passwort wird weder gespeichert noch geloggt.
// Die Sitzung gilt nur, solange die App läuft.
const shareSession = () => session.fromPartition('rigplan-share');
const listCache = () => path.join(app.getPath('userData'), 'gdtf-share-list.json');
const fromOurPage = e => { try { return new URL(e.senderFrame.url).protocol === 'file:'; } catch (err) { return false; } };
async function shareJson(url, opts) {
  const res = await shareSession().fetch(url, { credentials: 'include', ...opts }), text = await res.text();
  let j; try { j = JSON.parse(text); } catch (err) { throw new Error(`GDTF Share antwortet unerwartet (HTTP ${res.status}).`); }
  return { status: res.status, json: j };
}
const pickRow = r => ({ rid: r.rid, fixture: r.fixture, manufacturer: r.manufacturer, revision: r.revision, version: r.version, uploader: r.uploader, rating: r.rating, modes: Array.isArray(r.modes) ? r.modes.map(m => ({ name: m.name, dmx: m.dmxfootprint })) : [], filesize: r.filesize, modified: r.lastModified });

ipcMain.handle('share:login', async (e, user, password) => {
  if (!fromOurPage(e) || typeof user !== 'string' || typeof password !== 'string') throw new Error('Ungültige Anfrage.');
  const { status, json } = await shareJson(`${SHARE_BASE}/login.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }) });
  if (!json.result) return { ok: false, error: json.error || `Anmeldung fehlgeschlagen (HTTP ${status}).` };
  return { ok: true };
});
ipcMain.handle('share:list', async e => {
  if (!fromOurPage(e)) throw new Error('Ungültige Anfrage.');
  const { status, json } = await shareJson(`${SHARE_BASE}/getList.php`);
  if (status === 401 || !json.result) return { ok: false, auth: status === 401, error: json.error || `Liste nicht verfügbar (HTTP ${status}).` };
  const list = (json.list || []).map(pickRow), out = { date: new Date().toISOString().slice(0, 10), list };
  try { fs.writeFileSync(listCache(), JSON.stringify(out)); } catch (err) { /* Cache ist optional */ }
  return { ok: true, ...out };
});
ipcMain.handle('share:cached', e => {
  if (!fromOurPage(e)) throw new Error('Ungültige Anfrage.');
  try { return JSON.parse(fs.readFileSync(listCache(), 'utf8')); } catch (err) { return null; }
});
ipcMain.handle('share:download', async (e, rid) => {
  if (!fromOurPage(e) || !/^\d+$/.test(String(rid))) throw new Error('Ungültige Anfrage.');
  const res = await shareSession().fetch(`${SHARE_BASE}/downloadFile.php?rid=${encodeURIComponent(rid)}`, { credentials: 'include' });
  if (res.status === 401) return { ok: false, auth: true, error: 'Bitte neu anmelden.' };
  if (!res.ok) return { ok: false, error: `Download fehlgeschlagen (HTTP ${res.status}).` };
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_GDTF) return { ok: false, error: 'Datei ist zu groß.' };
  const b = new Uint8Array(buf); if (b[0] !== 0x50 || b[1] !== 0x4b) return { ok: false, error: 'Das ist keine GDTF-Datei.' };
  return { ok: true, data: buf };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
