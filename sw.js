// Service worker: lets the hymnal open and show downloaded songs with no network.
//
// - App shell (index.html, css, js, covers): network first, cached copy when offline.
// - Song images and 簡譜 JSON: served from any cache that has them. apps/offline.html
//   fills one cache per book ("songs-D", ...); songs viewed online can also be kept
//   in "songs-viewed" (toggle stored in the "offline-settings" cache).
var SHELL_CACHE = 'shell-v1';
var VIEWED_CACHE = 'songs-viewed';
var SETTINGS_CACHE = 'offline-settings';
var SETTINGS_URL = new URL('./__offline-settings', self.registration.scope).href;
var NETWORK_TIMEOUT = 4000;

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './style/main.css?v=4',
  './style/newTestament.css',
  './script/marked.min.js',
  './script/jianpuPlayer.js',
  './script/newTestament.js',
  './icons/images.png',
  './assets/cover/shi_ge.png',
  './assets/cover/bu_chong_ben.png',
  './assets/cover/xin_ge_song_yong.png',
  './assets/cover/xin_shi.png',
  './assets/cover/lan_ben.png',
  './assets/cover/newTestament.jpg',
  './assets/icon/text-to-speech.png',
  './assets/icon/pause.png',
  './assets/icon/play.png',
  './assets/icon/resize-font-increase.png',
  './assets/icon/resize-font-decrease.png',
  './apps/index.html',
  './apps/apps.css',
  './apps/offline.html',
  './offline-songs.json'
];

var SHELL_PATHS = SHELL.map(function (p) { return new URL(p, self.registration.scope).pathname; });
var SONG_IMAGE = /\/(shi_ge|bu_chong_ben|xin_ge_song_yong|hong_ben|lan_ben)\/[^/]+\.webp$/;
var SONG_JSON = /\/jianpu\/[^/]+\/[^/]+\.json$/;

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(SHELL_CACHE).then(function (cache) {
    // one missing file must not stop the rest from being cached
    return Promise.all(SHELL.map(function (p) {
      return cache.add(new Request(p, { cache: 'reload' })).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.indexOf('shell-') === 0 && k !== SHELL_CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(timer); resolve(v); },
      function (e) { clearTimeout(timer); reject(e); });
  });
}

function autoSaveEnabled() {
  return caches.open(SETTINGS_CACHE)
    .then(function (c) { return c.match(SETTINGS_URL); })
    .then(function (res) { return res ? res.json() : {}; })
    .then(function (s) { return s.autoSave !== false; })
    .catch(function () { return true; });
}

function notFound() {
  return new Response('', { status: 404, statusText: 'Not cached' });
}

// A page that was never cached (e.g. the piano) opened with no network.
function offlinePage() {
  var home = new URL('./index.html', self.registration.scope).href;
  var html = '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>離線中</title></head>' +
    '<body style="font-family:sans-serif;background:#9c6644;color:#ede0d4;text-align:center;padding:40px 16px">' +
    '<h2>目前沒有網路</h2><p>這個頁面需要網路才能使用。</p>' +
    '<p><a href="' + home + '" style="color:#fff;font-size:20px">回詩歌</a></p></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Song images: cache first (pages never change once downloaded; the manager page
// re-downloads changed files). A request with cache: 'reload' is the manager
// downloading, so it always goes to the network.
function songImage(request) {
  if (request.cache === 'reload') return fetch(request);
  return caches.match(request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(request).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        autoSaveEnabled().then(function (on) {
          if (on) return caches.open(VIEWED_CACHE).then(function (c) { return c.put(request.url, copy); });
        });
      }
      return res;
    }).catch(notFound);
  });
}

// Network first, falling back to whatever cache has it.
function networkFirst(request, cacheName) {
  if (request.cache === 'reload') return fetch(request);
  return withTimeout(fetch(request), NETWORK_TIMEOUT).then(function (res) {
    if (res.ok && cacheName) {
      var copy = res.clone();
      caches.open(cacheName).then(function (c) { c.put(request, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      if (request.mode === 'navigate') return offlinePage();
      return notFound();
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (SONG_IMAGE.test(url.pathname)) {
    event.respondWith(songImage(request));
  } else if (SONG_JSON.test(url.pathname)) {
    event.respondWith(networkFirst(request, null));
  } else if (SHELL_PATHS.indexOf(url.pathname) >= 0 || request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_PATHS.indexOf(url.pathname) >= 0 ? SHELL_CACHE : null));
  }
});
