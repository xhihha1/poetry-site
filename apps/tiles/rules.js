// 捷運拼牌 — pure game rules (no DOM, no network), shared by the page and node tests.
//
// Tiles are ids 0..105: 4 lines (colors) x 13 numbers x 2 copies, plus 2 轉乘 (wild) tiles.
(function (root) {
  var COLORS = 4;
  var MAX_NUM = 13;
  var TILE_COUNT = COLORS * MAX_NUM * 2 + 2;
  var HAND_SIZE = 14;
  var FIRST_MELD = 30;
  var WILD_PENALTY = 30;

  function isWild(id) { return id >= COLORS * MAX_NUM * 2; }
  function color(id) { return Math.floor(id / (MAX_NUM * 2)); }
  function num(id) { return (id % MAX_NUM) + 1; }

  // Sort key for a hand: by color then number (wilds last).
  function byColor(a, b) {
    if (isWild(a) !== isWild(b)) return isWild(a) ? 1 : -1;
    return color(a) - color(b) || num(a) - num(b) || a - b;
  }

  function byNumber(a, b) {
    if (isWild(a) !== isWild(b)) return isWild(a) ? 1 : -1;
    return num(a) - num(b) || color(a) - color(b) || a - b;
  }

  // A run: one color, consecutive numbers, wilds fill gaps / extend the ends.
  function asRun(ids) {
    var real = ids.filter(function (t) { return !isWild(t); }).sort(byNumber);
    var wilds = ids.filter(isWild);
    if (ids.length < 3 || ids.length > MAX_NUM) return null;
    if (real.length === 0) return null;
    for (var i = 0; i < real.length; i++) {
      if (color(real[i]) !== color(real[0])) return null;
      if (i > 0 && num(real[i]) === num(real[i - 1])) return null;
    }
    var lo = num(real[0]);
    var hi = num(real[real.length - 1]);
    var gaps = hi - lo + 1 - real.length;
    if (gaps > wilds.length) return null;
    var extra = wilds.length - gaps;
    var after = Math.min(extra, MAX_NUM - hi);
    var before = extra - after;
    lo -= before;
    hi += after;
    var ordered = [];
    var values = [];
    var w = 0;
    var r = 0;
    for (var n = lo; n <= hi; n++) {
      if (r < real.length && num(real[r]) === n) ordered.push(real[r++]);
      else ordered.push(wilds[w++]);
      values.push(n);
    }
    return { kind: 'run', ordered: ordered, points: values.reduce(function (s, v) { return s + v; }, 0) };
  }

  // A group: one number, all different colors, 3 or 4 tiles.
  function asGroup(ids) {
    var real = ids.filter(function (t) { return !isWild(t); }).sort(byColor);
    var wilds = ids.filter(isWild);
    if (ids.length < 3 || ids.length > COLORS) return null;
    if (real.length === 0) return null;
    var seen = {};
    for (var i = 0; i < real.length; i++) {
      if (num(real[i]) !== num(real[0])) return null;
      if (seen[color(real[i])]) return null;
      seen[color(real[i])] = true;
    }
    return { kind: 'group', ordered: real.concat(wilds), points: num(real[0]) * ids.length };
  }

  function analyzeSet(ids) {
    return asRun(ids) || asGroup(ids);
  }

  function handPenalty(hand) {
    return hand.reduce(function (s, t) { return s + (isWild(t) ? WILD_PENALTY : num(t)); }, 0);
  }

  function setKey(ids) {
    return ids.slice().sort(function (a, b) { return a - b; }).join(',');
  }

  // Check a finished turn. start/end are {board: [[ids]], hand: [ids]}.
  // Returns null when legal, otherwise a message for the player.
  function checkTurn(start, end, hasMelded) {
    var endBoardTiles = [].concat.apply([], end.board);
    var startBoardTiles = [].concat.apply([], start.board);
    var startAll = startBoardTiles.concat(start.hand).sort(function (a, b) { return a - b; });
    var endAll = endBoardTiles.concat(end.hand).sort(function (a, b) { return a - b; });
    if (startAll.join(',') !== endAll.join(',')) return '牌的數量不對，請按「復原」再試一次';

    var onBoard = {};
    endBoardTiles.forEach(function (t) { onBoard[t] = true; });
    for (var i = 0; i < startBoardTiles.length; i++) {
      if (!onBoard[startBoardTiles[i]]) return '桌上的牌不能收回手牌';
    }

    var played = start.hand.filter(function (t) { return onBoard[t]; });
    if (played.length === 0) return '至少要出一張牌，不能出就按「抽牌」';

    for (var s = 0; s < end.board.length; s++) {
      if (!analyzeSet(end.board[s])) return '第 ' + (s + 1) + ' 組不成立（同色連號 3 張以上，或同號不同色 3～4 張）';
    }

    if (!hasMelded) {
      var startKeys = {};
      start.board.forEach(function (set) { startKeys[setKey(set)] = (startKeys[setKey(set)] || 0) + 1; });
      var playedSet = {};
      played.forEach(function (t) { playedSet[t] = true; });
      var points = 0;
      for (var k = 0; k < end.board.length; k++) {
        var key = setKey(end.board[k]);
        if (startKeys[key]) { startKeys[key]--; continue; }
        if (!end.board[k].every(function (t) { return playedSet[t]; })) {
          return '第一次出牌只能用自己的牌組新的組，不能動桌上的牌';
        }
        points += analyzeSet(end.board[k]).points;
      }
      var untouched = Object.keys(startKeys).every(function (key) { return startKeys[key] === 0; });
      if (!untouched) return '第一次出牌只能用自己的牌組新的組，不能動桌上的牌';
      if (points < FIRST_MELD) return '第一次出牌點數要 ' + FIRST_MELD + ' 以上（目前 ' + points + '）';
    }
    return null;
  }

  // ---------- whole-game state transitions (pure: return a new state or an error) ----------

  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function deal(state, rand) {
    var pool = shuffle(Array.from({ length: TILE_COUNT }, function (_, i) { return i; }), rand || Math.random);
    var hands = {};
    var melded = {};
    state.order.forEach(function (pid) {
      hands[pid] = pool.splice(0, HAND_SIZE).sort(byColor);
      melded[pid] = false;
    });
    return Object.assign({}, state, {
      status: 'playing', pool: pool, hands: hands, melded: melded, board: [],
      turn: 0, passes: 0, winner: null, scores: null, round: (state.round || 0) + 1
    });
  }

  function nextTurn(state) {
    return (state.turn + 1) % state.order.length;
  }

  function finish(state, winner) {
    var scores = {};
    state.order.forEach(function (pid) { scores[pid] = handPenalty(state.hands[pid] || []); });
    if (!winner) {
      // pool ran out and nobody could play: lowest hand wins
      winner = state.order.slice().sort(function (a, b) { return scores[a] - scores[b]; })[0];
    }
    return Object.assign({}, state, { status: 'ended', winner: winner, scores: scores });
  }

  function draw(state, pid) {
    if (state.status !== 'playing' || state.order[state.turn] !== pid) return { error: '還沒輪到你' };
    var pool = state.pool.slice();
    var hands = Object.assign({}, state.hands);
    var passes = state.passes;
    if (pool.length) {
      hands[pid] = hands[pid].concat(pool.pop());
      passes = 0;
    } else {
      passes++;
    }
    var next = Object.assign({}, state, { pool: pool, hands: hands, passes: passes, turn: nextTurn(state) });
    if (!pool.length && passes >= state.order.length) next = finish(next, null);
    return { state: next };
  }

  function commit(state, pid, board, hand) {
    if (state.status !== 'playing' || state.order[state.turn] !== pid) return { error: '還沒輪到你' };
    var err = checkTurn({ board: state.board, hand: state.hands[pid] }, { board: board, hand: hand }, state.melded[pid]);
    if (err) return { error: err };
    var hands = Object.assign({}, state.hands);
    hands[pid] = hand.slice();
    var melded = Object.assign({}, state.melded);
    melded[pid] = true;
    var sorted = board.map(function (set) { return analyzeSet(set).ordered; });
    var next = Object.assign({}, state, { board: sorted, hands: hands, melded: melded, passes: 0, turn: nextTurn(state) });
    if (!hand.length) next = finish(next, pid);
    return { state: next };
  }

  // Skip a player who walked away (counts as a draw for them).
  function skip(state) {
    return draw(state, state.order[state.turn]);
  }

  var api = {
    COLORS: COLORS, MAX_NUM: MAX_NUM, TILE_COUNT: TILE_COUNT, HAND_SIZE: HAND_SIZE, FIRST_MELD: FIRST_MELD,
    isWild: isWild, color: color, num: num, byColor: byColor, byNumber: byNumber,
    analyzeSet: analyzeSet, checkTurn: checkTurn, handPenalty: handPenalty,
    deal: deal, draw: draw, commit: commit, skip: skip
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TileRules = api;
})(this);
