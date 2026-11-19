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

  // ---------- suggestion (提示 / 自動出牌) ----------

  // A tile "kind" ignores which copy it is: 0..51 = color*13 + num-1, 'w' = 轉乘.
  function kindOf(id) { return isWild(id) ? 'w' : color(id) * MAX_NUM + num(id) - 1; }

  // Every set that can be built from the hand alone, as kind lists with their points.
  function candidateSets(hand) {
    var count = {};
    hand.forEach(function (t) { var k = kindOf(t); count[k] = (count[k] || 0) + 1; });
    var wilds = count.w || 0;
    var rep = {};   // one real id per kind, to ask analyzeSet for points
    hand.forEach(function (t) { rep[kindOf(t)] = t; });
    var wildIds = hand.filter(isWild);
    var out = [];
    var seen = {};

    function add(kinds) {
      var w = 0;
      var ids = kinds.map(function (k) { return k === 'w' ? wildIds[w++] : rep[k]; });
      var info = analyzeSet(ids);
      if (!info) return;
      var key = kinds.slice().sort().join(',');
      if (seen[key]) return;
      seen[key] = true;
      out.push({ kinds: kinds, points: info.points, wilds: w });
    }

    for (var c = 0; c < COLORS; c++) {
      for (var lo = 1; lo <= MAX_NUM; lo++) {
        var kinds = [];
        var gaps = 0;
        var reals = 0;
        for (var hi = lo; hi <= MAX_NUM; hi++) {
          var k = c * MAX_NUM + hi - 1;
          if (count[k]) { kinds.push(k); reals++; } else { kinds.push('w'); gaps++; }
          if (gaps > wilds) break;
          if (kinds.length >= 3 && reals > 0) add(kinds.slice());
        }
      }
    }
    for (var n = 1; n <= MAX_NUM; n++) {
      var have = [];
      for (var cc = 0; cc < COLORS; cc++) if (count[cc * MAX_NUM + n - 1]) have.push(cc * MAX_NUM + n - 1);
      for (var mask = 1; mask < (1 << have.length); mask++) {
        var pick = have.filter(function (_, i) { return mask & (1 << i); });
        for (var ww = 0; ww <= wilds && pick.length + ww <= COLORS; ww++) {
          if (pick.length + ww < 3) continue;
          add(pick.concat(Array(ww).fill('w')));
        }
      }
    }
    // bigger sets first so the search finds good answers early
    out.sort(function (a, b) { return b.kinds.length - a.kinds.length || a.wilds - b.wilds; });
    return { sets: out, count: count };
  }

  // Pick disjoint sets from the hand: most tiles first, then fewest wilds, then most points.
  // With minPoints (first meld) only combinations worth that much count.
  function bestNewSets(hand, minPoints) {
    var cand = candidateSets(hand);
    var left = Object.assign({}, cand.count);
    var best = null;
    var chosen = [];
    var budget = 30000;

    function better(tiles, wilds, points) {
      if (points < minPoints) return false;
      if (!best) return tiles > 0;
      if (tiles !== best.tiles) return tiles > best.tiles;
      if (wilds !== best.wilds) return wilds < best.wilds;
      return points > best.points;
    }

    function search(from, tiles, wilds, points) {
      if (better(tiles, wilds, points)) best = { tiles: tiles, wilds: wilds, points: points, sets: chosen.slice() };
      for (var i = from; i < cand.sets.length && budget > 0; i++) {
        var s = cand.sets[i];
        var need = {};
        s.kinds.forEach(function (k) { need[k] = (need[k] || 0) + 1; });
        var fits = Object.keys(need).every(function (k) { return (left[k] || 0) >= need[k]; });
        if (!fits) continue;
        budget--;
        Object.keys(need).forEach(function (k) { left[k] -= need[k]; });
        chosen.push(s);
        search(i, tiles + s.kinds.length, wilds + s.wilds, points + s.points);
        chosen.pop();
        Object.keys(need).forEach(function (k) { left[k] += need[k]; });
      }
    }
    search(0, 0, 0, 0);
    if (!best) return null;

    // turn kinds back into real tile ids
    var pool = {};
    hand.forEach(function (t) { var k = kindOf(t); (pool[k] = pool[k] || []).push(t); });
    return best.sets.map(function (s) {
      return analyzeSet(s.kinds.map(function (k) { return pool[k].shift(); })).ordered;
    });
  }

  // Put one hand tile onto the board: append to a set, or split a run in two around it.
  // Returns the new board or null.
  function attachTile(board, tile) {
    for (var i = 0; i < board.length; i++) {
      var grown = analyzeSet(board[i].concat(tile));
      if (grown) {
        var b = board.slice();
        b[i] = grown.ordered;
        return { board: b, set: i, how: 'extend' };
      }
    }
    for (var j = 0; j < board.length; j++) {
      var info = analyzeSet(board[j]);
      if (!info || info.kind !== 'run') continue;
      for (var k = 2; k <= info.ordered.length - 3; k++) {
        var a = analyzeSet(info.ordered.slice(0, k).concat(tile));
        var c = analyzeSet(info.ordered.slice(k));
        if (a && c) {
          var nb = board.slice();
          nb.splice(j, 1, a.ordered, c.ordered);
          return { board: nb, set: j, how: 'split' };
        }
      }
    }
    return null;
  }

  // Suggest a play for this turn. Returns null when nothing can be played (draw instead),
  // otherwise {board, hand, played, moves} where board/hand pass checkTurn and moves describe
  // what to do: {type: 'new', tiles} or {type: 'extend'|'split', set: index on the start board, tiles}.
  function suggest(board, hand, hasMelded) {
    var fresh = bestNewSets(hand, hasMelded ? 0 : FIRST_MELD);
    if (!hasMelded && !fresh) return null;
    var newSets = fresh || [];
    var used = {};
    newSets.forEach(function (s) { s.forEach(function (t) { used[t] = true; }); });
    var rest = hand.filter(function (t) { return !used[t]; });
    var cur = board.map(function (s) { return s.slice(); });
    var origin = board.map(function (_, i) { return i; });   // start-board index of each set, -1 = new
    var moves = [];

    if (hasMelded) {
      // attach leftovers to the board (old sets and the new ones); keep 轉乘 unless it empties the hand
      var changed = true;
      while (changed) {
        changed = false;
        var withNew = cur.concat(newSets);
        var originAll = origin.concat(newSets.map(function () { return -1; }));
        for (var r = 0; r < rest.length; r++) {
          var t = rest[r];
          if (isWild(t) && rest.length > 1) continue;
          var at = attachTile(withNew, t);
          if (!at) continue;
          if (at.how === 'split') originAll.splice(at.set + 1, 0, originAll[at.set]);
          var src = originAll[at.set];
          if (src >= 0) {
            var mv = moves.filter(function (m) { return m.set === src && m.type !== 'new'; })[0];
            if (mv) { mv.tiles.push(t); if (at.how === 'split') mv.type = 'split'; }
            else moves.push({ type: at.how, set: src, tiles: [t] });
          }
          // split a set that came from a new set: keep both halves as new
          var nOld = originAll.filter(function (o) { return o >= 0; }).length;
          cur = at.board.slice(0, nOld);
          newSets = at.board.slice(nOld);
          origin = originAll.slice(0, nOld);
          rest.splice(r, 1);
          changed = true;
          break;
        }
      }
    }
    moves = newSets.map(function (s) { return { type: 'new', tiles: s.slice() }; }).concat(moves);
    var finalBoard = cur.concat(newSets);
    if (rest.length === hand.length) return null;
    var played = hand.filter(function (t) { return rest.indexOf(t) < 0; });
    return { board: finalBoard, hand: rest, played: played, moves: moves };
  }

  var api = {
    COLORS: COLORS, MAX_NUM: MAX_NUM, TILE_COUNT: TILE_COUNT, HAND_SIZE: HAND_SIZE, FIRST_MELD: FIRST_MELD,
    isWild: isWild, color: color, num: num, byColor: byColor, byNumber: byNumber,
    analyzeSet: analyzeSet, checkTurn: checkTurn, handPenalty: handPenalty, suggest: suggest,
    deal: deal, draw: draw, commit: commit, skip: skip
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TileRules = api;
})(this);
