// Headless Chrome test for the interactive score on the song page.
// usage: node tools/tests/score.test.mjs . [screenshot.png]   (needs Google Chrome; server on 8767)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = process.argv[2];
const PORT = 8767;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: SITE, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9334', '--no-first-run', '--autoplay-policy=no-user-gesture-required',
  '--window-size=390,844', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'chrome-score-'))}`, 'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
for (let i = 0; i < 50 && !ws; i++) {
  try {
    const page = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((t) => t.type === 'page');
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r));
      ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
    }
  } catch {}
  if (!ws) await sleep(200);
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
}
const check = (name, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);

try {
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE + '/index.html' });
  await sleep(1500);

  // 1. real D_178: 4 verses, chorus written once in w1 (85 + 3 x 60 syllables)
  const real = await evaluate(`
    toKeyboardPage(); addNumber(1); addNumber(7); addNumber(8); await submitInput();
    await new Promise(r => setTimeout(r, 600));
    const box = document.getElementById('song-score');
    return { imgs: document.querySelectorAll('#book-song img').length, score: !!box,
             verses: box ? [...box.querySelectorAll('.sc-verse')].map(b => b.textContent) : [],
             labels: box ? [...box.querySelectorAll('.sc-label')].map(e => e.textContent) : [],
             syl: box ? [...box.querySelectorAll('.sc-syl')].filter(e => e.textContent).length : 0 };`);
  check('real D_178 lyrics: 4 verses, 2 labels, 265 syllables',
    real.imgs >= 1 && real.score && real.verses.length === 4 && real.labels.length === 2 && real.syl === 85 + 3 * 60, real);

  // 2. inject test lyrics (2 verses, chorus only in w1) and render
  const shown = await evaluate(`
    const w1 = '一二三四五六七八九十'.repeat(9).slice(0, 84);
    currentSongJson = Object.assign({}, currentSongJson, { source: currentSongJson.source.replace(/^w\\d*\\s*[:：].*$/gm, '') + '\\nw1: ' + w1 + '\\nw2: ' + '甲乙丙丁'.repeat(16) });
    renderSongScore();
    const box = document.getElementById('song-score');
    const afterImages = box && box.previousElementSibling && box.previousElementSibling.tagName === 'IMG';
    return { exists: !!box, afterImages, notes: box.querySelectorAll('.sc-note').length,
             syl: [...box.querySelectorAll('.sc-syl')].filter(e => e.textContent).length,
             verses: [...box.querySelectorAll('.sc-verse')].map(b => b.textContent), labels: [...box.querySelectorAll('.sc-label')].map(e => e.textContent) };`);
  check('score renders under the images', shown.exists && shown.afterImages, shown);
  check('two verse buttons and section labels', shown.verses.join() === '第1節,第2節' && shown.labels.length === 2, { verses: shown.verses, labels: shown.labels });
  // verse 2 has 64 own syllables; remaining 20 slots (chorus) show once from verse 1
  check('lyrics laid out (84 verse-1 + 64 verse-2)', shown.syl === 84 + 64, shown.syl);

  // 3. press play: highlight walks along
  const walk = await evaluate(`
    document.querySelector('.sc-play').click();
    const seen = [];
    for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 250)); const n = document.querySelector('.sc-syl.sc-now'); seen.push(n ? n.textContent : null); }
    return { playing: document.querySelector('.sc-play').textContent, seen };`);
  check('playback highlights syllables in order', walk.playing.includes('停止') && walk.seen.filter(Boolean).length >= 4 && walk.seen[0] !== walk.seen[walk.seen.length - 1], walk);

  // 4. tap a verse-2 syllable in the middle: playback jumps there, verse 2 selected
  const seek = await evaluate(`
    const rows = [...document.querySelectorAll('.sc-row')];
    const target = [...rows[2].querySelectorAll('.sc-cell')].map(c => c.querySelectorAll('.sc-syl')[1]).find(s => s && s.textContent);
    target.click();
    await new Promise(r => setTimeout(r, 300));
    const now = document.querySelector('.sc-syl.sc-now');
    return { tapped: target.textContent, now: now && now.textContent, sameEl: now === target,
             verse: document.querySelector('.sc-verse.on').textContent, playing: document.querySelector('.sc-play').textContent };`);
  check('tap syllable plays from there in that verse', seek.sameEl && seek.verse === '第2節' && seek.playing.includes('停止'), seek);

  // 5. chorus in verse 2 lights the shared (verse 1 row) syllable
  const chorus = await evaluate(`
    const sc = songScore.parse(currentSongJson.source);
    const firstChorusNote = sc.notes[sc.slots[64]].index;
    document.querySelectorAll('.sc-note')[0];
    const heads = [...document.querySelectorAll('.sc-cell')].map(c => c.querySelector('.sc-note'));
    // find the cell for that note index by walking cells that own a note
    let k = -1, el = null;
    for (const h of heads) { if (h.textContent.trim() === '–') continue; k++; }
    jianpuPlayer.stop();
    // jump via the note head of the first chorus note
    const noteHeads = [...document.querySelectorAll('.sc-note')].filter(h => !h.textContent.includes('–'));
    noteHeads[firstChorusNote].click();
    await new Promise(r => setTimeout(r, 300));
    const lit = [...document.querySelectorAll('.sc-now')].map(e => e.className + ':' + e.textContent);
    return { lit, verse: document.querySelector('.sc-verse.on').textContent };`);
  check('chorus in verse 2 lights the shared line', chorus.verse === '第2節' && chorus.lit.some(s => s.startsWith('sc-syl')), chorus);

  // 6. stop button, then leaving the page stops audio
  const stop = await evaluate(`
    document.querySelector('.sc-play').click();
    await new Promise(r => setTimeout(r, 200));
    const afterStop = { label: document.querySelector('.sc-play').textContent, lit: document.querySelectorAll('.sc-now').length };
    document.querySelector('.sc-play').click();
    await new Promise(r => setTimeout(r, 200));
    toBookPage();
    await new Promise(r => setTimeout(r, 300));
    return { afterStop, afterLeave: document.querySelector('.sc-play').textContent };`);
  check('stop clears highlight; leaving page stops', stop.afterStop.label.includes('播放') && stop.afterStop.lit === 0 && stop.afterLeave.includes('播放'), stop);

  // 7. a different song without JSON: score removed
  const other = await evaluate(`
    toKeyboardPage(); addNumber(5); await submitInput(); await new Promise(r => setTimeout(r, 400));
    return { score: !!document.getElementById('song-score'), imgs: document.querySelectorAll('#book-song img').length };`);
  check('other song: no score', !other.score && other.imgs >= 1, other);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await evaluate(`toKeyboardPage(); addNumber(1); addNumber(7); addNumber(8); await submitInput(); await new Promise(r => setTimeout(r, 500));
    const w1 = '一二三四五六七八九十'.repeat(9).slice(0, 84);
    currentSongJson = Object.assign({}, currentSongJson, { source: currentSongJson.source.replace(/^w\\d*\\s*[:：].*$/gm, '') + '\\nw1: ' + w1 + '\\nw2: ' + '甲乙丙丁'.repeat(16) });
    renderSongScore(); document.getElementById('song-score').scrollIntoView(); document.querySelector('.sc-play').click(); await new Promise(r => setTimeout(r, 1500)); return 1;`);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(process.argv[3] || join(tmpdir(), 'score.png'), Buffer.from(shot2.result.data, 'base64'));
  const errs = await evaluate(`return window.__errs || [];`);
} catch (e) {
  console.log('ERROR', e.message);
} finally {
  chrome.kill();
  server.kill();
  process.exit(0);
}
