// usage: node tools/tests/tiles-rules.test.js apps/tiles/rules.js
const R = require(require('path').resolve(process.argv[2] || 'apps/tiles/rules.js'));
const assert = require('assert');
const t = (c, n, k = 0) => c * 26 + k * 13 + n - 1;
const W1 = 104, W2 = 105;
const ok = (ids) => !!R.analyzeSet(ids);
// runs
assert(ok([t(0,3),t(0,4),t(0,5)]));
assert(!ok([t(0,3),t(0,4)]));
assert(!ok([t(0,3),t(1,4),t(0,5)]));
assert(ok([t(0,3),W1,t(0,5)]));
assert.deepStrictEqual(R.analyzeSet([t(0,5),W1,t(0,3)]).ordered, [t(0,3),W1,t(0,5)]);
assert.strictEqual(R.analyzeSet([t(0,12),t(0,13),W1]).points, 11+12+13);   // wild goes before 12
assert.deepStrictEqual(R.analyzeSet([t(0,12),t(0,13),W1]).ordered, [W1,t(0,12),t(0,13)]);
assert(!ok([t(0,3),t(0,3,1),t(0,4)]));
// groups
assert(ok([t(0,7),t(1,7),t(2,7)]));
assert(ok([t(0,7),t(1,7),t(2,7),t(3,7)]));
assert(!ok([t(0,7),t(0,7,1),t(2,7)]));
assert(ok([t(0,7),t(1,7),W1]));
assert(!ok([t(0,7),t(1,7),t(2,7),t(3,7),W1]));
assert.strictEqual(R.analyzeSet([t(0,10),t(1,10),t(2,10)]).points, 30);
// first meld
const b0 = { board: [], hand: [t(0,10),t(1,10),t(2,10),t(0,1)] };
assert.strictEqual(R.checkTurn(b0, { board: [[t(0,10),t(1,10),t(2,10)]], hand: [t(0,1)] }, false), null);
assert.match(R.checkTurn({board:[],hand:[t(0,1),t(0,2),t(0,3),t(3,9)]}, {board:[[t(0,1),t(0,2),t(0,3)]],hand:[t(3,9)]}, false), /30/);
// first meld cannot touch board
const sb = { board: [[t(1,4),t(1,5),t(1,6)]], hand: [t(1,7),t(0,11),t(1,11),t(2,11)] };
assert.match(R.checkTurn(sb, { board: [[t(1,4),t(1,5),t(1,6),t(1,7)],[t(0,11),t(1,11),t(2,11)]], hand: [] }, false), /第一次/);
assert.strictEqual(R.checkTurn(sb, { board: [[t(1,4),t(1,5),t(1,6)],[t(0,11),t(1,11),t(2,11)]], hand: [t(1,7)] }, false), null);
// after melding, may extend
assert.strictEqual(R.checkTurn(sb, { board: [[t(1,4),t(1,5),t(1,6),t(1,7)]], hand: [t(0,11),t(1,11),t(2,11)] }, true), null);
// rearrange board: split run 4-7 into 4,5,6 + 7 with group
const rb = { board: [[t(1,4),t(1,5),t(1,6),t(1,7)]], hand: [t(0,7),t(2,7)] };
assert.strictEqual(R.checkTurn(rb, { board: [[t(1,4),t(1,5),t(1,6)],[t(1,7),t(0,7),t(2,7)]], hand: [] }, true), null);
// cannot take board tile into hand
assert.match(R.checkTurn(rb, { board: [[t(1,4),t(1,5),t(1,6)],[t(0,7),t(2,7),W1]], hand: [t(1,7)] }, true) || '', /./);
// must play something
assert.match(R.checkTurn(rb, rb, true), /至少/);
// invalid set
assert.match(R.checkTurn(rb, { board: [[t(1,4),t(1,5),t(1,6),t(1,7),t(0,7)]], hand: [t(2,7)] }, true), /不成立/);
// full game flow
let s = { order: ['a','b','c','d'] };
s = R.deal(s, () => 0.42);
assert.strictEqual(s.pool.length, 106 - 56);
Object.values(s.hands).forEach(h => assert.strictEqual(h.length, 14));
assert(R.draw(s, 'b').error);
let r = R.draw(s, 'a'); assert(!r.error); s = r.state;
assert.strictEqual(s.hands.a.length, 15); assert.strictEqual(s.turn, 1);
// empty pool => all pass => ends with lowest hand
let e = Object.assign({}, s, { pool: [] });
for (const p of ['b','c','d','a']) { r = R.draw(e, p); e = r.state; }
assert.strictEqual(e.status, 'ended'); assert(e.scores && e.winner);
// win by emptying hand
let w = { status:'playing', order:['a','b'], turn:0, board:[], pool:[1], passes:0, melded:{a:true,b:true}, hands:{a:[t(0,1),t(0,2),t(0,3)], b:[5]} };
r = R.commit(w, 'a', [[t(0,3),t(0,1),t(0,2)]], []);
assert.strictEqual(r.state.status, 'ended'); assert.strictEqual(r.state.winner, 'a');
assert.deepStrictEqual(r.state.board[0], [t(0,1),t(0,2),t(0,3)]);
console.log('all rules tests passed');
