// Drives headless Chrome over CDP to test poetry-site offline mode end to end.
// usage: node tools/tests/offline.test.mjs .   (needs Google Chrome; starts its own server on 8766; run tools/build_offline_index.py first)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = process.argv[2];
const PORT = 8766;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
function startServer() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: SITE, stdio: 'ignore' });
}
function stopServer() { server.kill(); server = null; }

startServer();
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9333', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'chrome-offline-'))}`, 'about:blank'
], { stdio: 'ignore' });

let ws;
let id = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9333/json')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener('open', r));
        ws.addEventListener('message', (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        });
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error('chrome did not start');
}
function send(method, params = {}) {
  return new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
  return r.result.result.value;
}
async function go(path) {
  await send('Page.navigate', { url: BASE + path });
  await sleep(1500);
}
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);

try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  // 1. first visit installs the worker and caches the shell
  await go('/index.html');
  const sw = await evaluate(`
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100));
    const keys = await caches.open('shell-v1').then(c => c.keys());
    return { controller: !!navigator.serviceWorker.controller, shell: keys.length };`);
  check('worker controls page and shell cached', sw.controller && sw.shell >= 20, sw);

  // 2. manager page lists books; download 新詩(紅) (X)
  await go('/apps/offline.html');
  const list = await evaluate(`
    for (let i = 0; i < 40 && !index; i++) await new Promise(r => setTimeout(r, 100));
    return [...document.querySelectorAll('.book')].map(b => b.querySelector('.book-name').textContent + ' | ' + b.querySelector('.book-state').textContent);`);
  check('manager lists 5 books, none downloaded', list.length === 5 && list.every((s) => s.endsWith('未下載')), list);

  // a phone that downloaded before the WebP switch still has a .png entry; reopening must clean it
  const pruned = await evaluate(`
    const c = await caches.open('songs-X');
    const old = new URL('../hong_ben/X_001.png', location.href).href;
    await c.put(old, new Response('old'));
    meta = { X: { 'hong_ben/X_001.png': 'oldhash' } };
    await writeJson(META_URL, meta);
    location.reload();
    return true;`).catch(() => true);
  await sleep(1500);
  const afterPrune = await evaluate(`
    for (let i = 0; i < 40 && !index; i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 300));
    const keys = (await caches.open('songs-X').then(c => c.keys())).map(k => new URL(k.url).pathname);
    return { keys, meta: JSON.stringify(meta), state: [...document.querySelectorAll('.book')][3].querySelector('.book-state').textContent };`);
  check('old png cache entry pruned', afterPrune.keys.length === 0 && afterPrune.meta === '{"X":{}}' && afterPrune.state === '未下載', afterPrune);

  const dl = await evaluate(`
    const t0 = Date.now();
    const book = index.books.find(b => b.code === 'X');
    await download(book);
    const keys = await caches.open('songs-X').then(c => c.keys());
    const state = [...document.querySelectorAll('.book')][3].querySelector('.book-state').textContent;
    return { files: book.files.length, cached: keys.length, ms: Date.now() - t0, state };`);
  check('download 新詩(紅) fully', dl.cached === dl.files && dl.state.includes('已可離線'), dl);

  // also view one 大本 song online so the auto-save cache gets it
  await go('/index.html');
  const viewed = await evaluate(`
    toKeyboardPage(); addNumber(1); addNumber(7); addNumber(8); await submitInput();
    await new Promise(r => setTimeout(r, 800));
    const keys = await caches.open('songs-viewed').then(c => c.keys());
    return keys.map(k => new URL(k.url).pathname);`);
  check('viewed song saved automatically', viewed.includes('/shi_ge/D_178.webp'), viewed);

  // 3. go "underground": stop the web server
  stopServer();
  await sleep(500);
  await go('/index.html');
  const offline = await evaluate(`
    const title = document.title;
    const tabs = document.querySelectorAll('.book-tab-item').length;
    const covers = await Promise.all([...document.querySelectorAll('.book-item img')].map(img => img.decode().then(() => true, () => false)));
    // 新詩(紅) song 5 (downloaded book)
    document.querySelector('input[value="X"]').checked = true; changeBookFunc();
    toKeyboardPage(); addNumber(5); await submitInput();
    const x = [...document.querySelectorAll('#book-song img')].map(i => ({ src: new URL(i.src).pathname, ok: i.complete && i.naturalWidth > 0 }));
    // 大本 178 (only viewed)
    document.querySelector('input[value="D"]').checked = true; changeBookFunc();
    toKeyboardPage(); addNumber(1); addNumber(7); addNumber(8); await submitInput();
    const d = [...document.querySelectorAll('#book-song img')].map(i => new URL(i.src).pathname);
    // 大本 5 (never downloaded)
    toKeyboardPage(); addNumber(5); await submitInput();
    const miss = document.querySelector('#book-song .song-missing')?.textContent || null;
    return { title, tabs, covers: covers.filter(Boolean).length + '/' + covers.length, x, d, miss };`);
  check('index.html opens offline', offline.title === '詩歌' && offline.tabs === 4, offline.title);
  check('book covers load offline', offline.covers === '6/6', offline.covers);
  check('downloaded song shows offline', offline.x.length >= 1 && offline.x.every((i) => i.ok), offline.x);
  check('viewed song shows offline', offline.d.includes('/shi_ge/D_178.webp'), offline.d);
  check('missing song explains it', !!offline.miss, offline.miss);

  await go('/apps/piano.html');
  const piano = await evaluate(`return document.body.innerText.slice(0, 40);`);
  check('uncached page shows offline notice', piano.includes('沒有網路'), piano);

  // 4. back online: delete the book from the manager
  startServer();
  await sleep(800);
  await go('/apps/offline.html');
  const removed = await evaluate(`
    for (let i = 0; i < 40 && !index; i++) await new Promise(r => setTimeout(r, 100));
    window.confirm = () => true;
    remove(index.books.find(b => b.code === 'X'));
    await new Promise(r => setTimeout(r, 500));
    return { exists: await caches.has('songs-X'), state: [...document.querySelectorAll('.book')][3].querySelector('.book-state').textContent };`);
  check('delete removes the book', !removed.exists && removed.state === '未下載', removed);
} catch (e) {
  console.log('ERROR', e.message);
} finally {
  chrome.kill();
  if (server) stopServer();
  process.exit(0);
}
