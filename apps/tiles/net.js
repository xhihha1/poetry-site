// 捷運拼牌 — room storage. Same interface for Firebase Realtime Database and a
// localStorage fallback used for testing with several tabs on one device.
//
//   net.subscribe(code, cb) -> unsubscribe     cb(state or null) on every change
//   net.transact(code, fn)  -> Promise<state>  fn(current or null) returns the new state,
//                                              or undefined to leave it unchanged
(function (root) {
  var FIREBASE_VERSION = '10.12.2';

  // Firebase drops empty arrays and may hand arrays back as objects; put the shape back.
  function list(x) {
    if (Array.isArray(x)) return x.filter(function (v) { return v !== null && v !== undefined; });
    if (x && typeof x === 'object') return Object.keys(x).sort(function (a, b) { return a - b; }).map(function (k) { return x[k]; });
    return [];
  }

  function normalize(s) {
    if (!s) return null;
    var hands = {};
    Object.keys(s.hands || {}).forEach(function (pid) { hands[pid] = list(s.hands[pid]); });
    (s.order ? list(s.order) : []).forEach(function (pid) { if (!hands[pid]) hands[pid] = []; });
    return Object.assign({}, s, {
      players: s.players || {},
      order: list(s.order),
      pool: list(s.pool),
      board: list(s.board).map(list).filter(function (set) { return set.length; }),
      hands: hands,
      melded: s.melded || {},
      scores: s.scores || null
    });
  }

  // ---------- localStorage (本機測試模式) ----------

  function localNet() {
    var PREFIX = 'tiles-room:';
    var listeners = {};

    function read(code) {
      try { return normalize(JSON.parse(localStorage.getItem(PREFIX + code))); } catch (e) { return null; }
    }

    function emit(code) {
      (listeners[code] || []).forEach(function (cb) { cb(read(code)); });
    }

    window.addEventListener('storage', function (e) {
      if (e.key && e.key.indexOf(PREFIX) === 0) emit(e.key.slice(PREFIX.length));
    });

    return {
      mode: 'local',
      subscribe: function (code, cb) {
        (listeners[code] = listeners[code] || []).push(cb);
        cb(read(code));
        return function () { listeners[code] = listeners[code].filter(function (f) { return f !== cb; }); };
      },
      transact: function (code, fn) {
        var next = fn(read(code));
        if (next !== undefined) {
          if (next === null) localStorage.removeItem(PREFIX + code);
          else localStorage.setItem(PREFIX + code, JSON.stringify(next));
          emit(code);
        }
        return Promise.resolve(read(code));
      }
    };
  }

  // ---------- Firebase Realtime Database ----------

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('無法載入 ' + src)); };
      document.head.appendChild(s);
    });
  }

  function firebaseNet(config) {
    var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
    var ready = loadScript(base + 'firebase-app-compat.js')
      .then(function () { return loadScript(base + 'firebase-database-compat.js'); })
      .then(function () {
        firebase.initializeApp(config);
        return firebase.database();
      });

    return {
      mode: 'firebase',
      subscribe: function (code, cb) {
        var off = null;
        var cancelled = false;
        ready.then(function (db) {
          if (cancelled) return;
          var ref = db.ref('rooms/' + code);
          var handler = function (snap) { cb(normalize(snap.val())); };
          ref.on('value', handler);
          off = function () { ref.off('value', handler); };
        });
        return function () { cancelled = true; if (off) off(); };
      },
      transact: function (code, fn) {
        // the SDK retries forever when offline or misconfigured; give the player an answer
        var timeout = new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('連不上伺服器，請確認網路後再試一次')); }, 15000);
        });
        return Promise.race([timeout, ready.then(function (db) {
          return db.ref('rooms/' + code).transaction(function (current) {
            var next = fn(normalize(current));
            // Firebase first runs this against its (possibly empty) local cache. Returning
            // undefined there would abort for good; null makes it retry with server data.
            if (next === undefined && current === null) return null;
            return next;
          }, null, false);
        }).then(function (result) {
          return normalize(result.snapshot.val());
        })]);
      }
    };
  }

  root.TileNet = {
    create: function (config) { return config ? firebaseNet(config) : localNet(); }
  };
})(this);
