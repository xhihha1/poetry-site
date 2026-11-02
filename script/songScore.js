// Interactive 簡譜 + lyrics under a song page. Reads the editor `source` text of a
// song JSON (same syntax as SPEC.md) plus lyric lines:
//
//   w1: 第一節的歌詞……
//   w2: 第二節的歌詞……
//
// Each Chinese character (or space-separated ASCII word) goes under one note; notes
// inside a slur ( … ) after the first and rests get no syllable, `_` leaves a note
// empty. A verse shorter than the melody borrows the rest from w1, so a chorus
// only needs typing once. Playback highlights the note and syllable, and tapping
// either one plays from there.
var songScore = (function () {
  var HEADER = /^(title|number|key|time|tempo)\s*:\s*(.*)$/i;
  var LYRIC = /^w(\d*)\s*[:：]\s*(.*)$/i;
  var PUNCT = /[\s，。、；：！？「」『』（）《》〈〉…—,.;:!?"'()\[\]]/;
  var ACC = { '#': '♯', b: '♭', n: '♮' };

  function parseToken(tok) {
    var s = tok;
    var slurStart = false, slurEnd = false;
    if (s.charAt(0) === '(') { slurStart = true; s = s.slice(1); }
    if (s.charAt(s.length - 1) === ')') { slurEnd = true; s = s.slice(0, -1); }
    var m = /^([#bn])?([0-7])([',._=]*)$/.exec(s);
    if (!m) return null;
    var up = 0, down = 0, dot = false, under = 0, sixteen = false;
    for (var i = 0; i < m[3].length; i++) {
      var ch = m[3].charAt(i);
      if (ch === "'") up++;
      else if (ch === ',') down++;
      else if (ch === '.') dot = true;
      else if (ch === '_') under++;
      else if (ch === '=') sixteen = true;
    }
    var n = parseInt(m[2], 10);
    var base = (sixteen || under >= 2) ? 0.25 : under === 1 ? 0.5 : 1;
    return {
      n: n, acc: n === 0 ? null : (m[1] || null), oct: n === 0 ? 0 : up - down,
      dur: dot ? base * 1.5 : base, dot: dot, lines: sixteen ? 2 : Math.min(under, 2),
      slurStart: slurStart, slurEnd: slurEnd
    };
  }

  function splitLyric(text) {
    var out = [];
    var word = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (/[A-Za-z0-9']/.test(ch)) { word += ch; continue; }
      if (word) { out.push(word); word = ''; }
      if (ch === '_') out.push('');
      else if (!PUNCT.test(ch)) out.push(ch);
    }
    if (word) out.push(word);
    return out;
  }

  // source text -> { header, rows, notes, slots, verses }
  //   rows:  [{type:'label', text} | {type:'music', measures: [[cell]]}]
  //   cells: {kind:'note'|'dash', note?}  (tie duplicates and dashes are display only)
  //   notes: every sounding note/rest in play order (what jianpuPlayer counts)
  //   slots: indexes into notes that take a syllable
  function parse(source) {
    var lines = source.replace(/\r\n/g, '\n').split('\n');
    var header = { key: 'C', time: '4/4', tempo: 72 };
    var i = 0;
    for (; i < lines.length; i++) {
      var hm = HEADER.exec(lines[i].trim());
      if (!hm) break;
      header[hm[1].toLowerCase()] = hm[1].toLowerCase() === 'tempo' ? (parseFloat(hm[2]) || 72) : hm[2].trim();
    }

    var rows = [];
    var notes = [];
    var verses = [];
    var last = null;
    var tie = false;
    var inSlur = false;

    for (; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var lm = LYRIC.exec(line);
      if (lm) {
        var v = Math.max(1, parseInt(lm[1] || '1', 10)) - 1;
        verses[v] = (verses[v] || []).concat(splitLyric(lm[2]));
        continue;
      }
      if (line.charAt(0) === '#' && !/[0-9]/.test(line.charAt(1) || '')) {
        rows.push({ type: 'label', text: line.replace(/^#\s*/, '') });
        last = null;
        tie = false;
        continue;
      }
      var measures = [[]];
      line.replace(/(\|\|?)/g, ' $1 ').trim().split(/\s+/).forEach(function (tok) {
        if (tok === '|' || tok === '||') { measures.push([]); return; }
        var cells = measures[measures.length - 1];
        if (tok === '-') {
          if (last) { last.dur += 1; cells.push({ kind: 'dash' }); }
          return;
        }
        if (tok === '~') { tie = true; return; }
        var p = parseToken(tok);
        if (!p) return;
        if (tie && last && p.n !== 0 && last.n === p.n && last.acc === p.acc && last.oct === p.oct) {
          last.dur += p.dur;
          cells.push({ kind: 'note', note: p, tied: true });
        } else {
          p.slurCont = inSlur && !p.slurStart;
          p.index = notes.length;
          notes.push(p);
          cells.push({ kind: 'note', note: p });
          last = p;
        }
        if (p.slurStart) inSlur = true;
        if (p.slurEnd) inSlur = false;
        tie = false;
      });
      rows.push({ type: 'music', measures: measures.filter(function (m) { return m.length; }) });
    }

    var slots = [];
    notes.forEach(function (n) {
      if (n.n !== 0 && !n.slurCont) { n.slot = slots.length; slots.push(n.index); }
    });
    return { header: header, rows: rows, notes: notes, slots: slots, verses: verses.filter(Boolean) };
  }

  function hasLyrics(song) {
    return !!(song && typeof song.source === 'string' && /^\s*w\d*\s*[:：]/im.test(song.source));
  }

  // syllable for (verse, slot), and whether it was borrowed from verse 1
  function syllable(score, v, slot) {
    var own = score.verses[v] || [];
    if (slot < own.length) return { text: own[slot], own: true };
    return { text: (score.verses[0] || [])[slot] || '', own: false };
  }

  function noteHtml(n) {
    var dotsUp = n.oct > 0 ? '•'.repeat(n.oct) : '';
    var dotsDown = n.oct < 0 ? '•'.repeat(-n.oct) : '';
    return '<span class="sc-oct">' + dotsUp + '</span>' +
      '<span class="sc-num sc-u' + n.lines + '">' + (n.acc ? '<small>' + ACC[n.acc] + '</small>' : '') + n.n +
      (n.dot ? '<b>·</b>' : '') + '</span>' +
      '<span class="sc-oct">' + dotsDown + '</span>';
  }

  // Render into `container`; returns nothing. `player` is jianpuPlayer.
  function render(container, song, player) {
    var score = parse(song.source);
    var verseCount = Math.max(1, score.verses.length);
    var playSong = { key: score.header.key, time: score.header.time, tempo: song.tempo || score.header.tempo,
      measures: [score.notes] };
    var noteEls = [];          // note index -> element
    var sylEls = [];           // verse -> slot -> element
    for (var v = 0; v < verseCount; v++) sylEls.push([]);
    var current = { verse: 0, playing: false, el: [] };

    container.innerHTML = '';
    container.className = 'song-score';

    var bar = document.createElement('div');
    bar.className = 'sc-bar';
    var playBtn = document.createElement('button');
    playBtn.className = 'sc-play';
    playBtn.textContent = '▶ 播放';
    bar.appendChild(playBtn);
    var verseBtns = [];
    for (var vb = 0; vb < verseCount && verseCount > 1; vb++) {
      (function (v) {
        var b = document.createElement('button');
        b.className = 'sc-verse';
        b.textContent = '第' + (v + 1) + '節';
        b.addEventListener('click', function () { selectVerse(v); if (current.playing) start(v, 0); });
        verseBtns.push(b);
        bar.appendChild(b);
      })(vb);
    }
    var hint = document.createElement('span');
    hint.className = 'sc-hint';
    hint.textContent = '點歌詞或音符可從那裡開始';
    bar.appendChild(hint);
    container.appendChild(bar);

    var sheet = document.createElement('div');
    sheet.className = 'sc-sheet';
    container.appendChild(sheet);

    score.rows.forEach(function (row) {
      if (row.type === 'label') {
        var label = document.createElement('div');
        label.className = 'sc-label';
        label.textContent = row.text;
        sheet.appendChild(label);
        return;
      }
      // how many lyric lines this row needs: verses that have their own words here
      var rowVerses = 1;
      row.measures.forEach(function (m) {
        m.forEach(function (c) {
          if (c.kind !== 'note' || c.tied || c.note.slot === undefined) return;
          for (var v = verseCount - 1; v >= rowVerses; v--) {
            if (syllable(score, v, c.note.slot).own) { rowVerses = v + 1; break; }
          }
        });
      });
      var rowEl = document.createElement('div');
      rowEl.className = 'sc-row';
      row.measures.forEach(function (m) {
        var mEl = document.createElement('div');
        mEl.className = 'sc-measure';
        m.forEach(function (c) {
          var cell = document.createElement('div');
          cell.className = 'sc-cell';
          var head = document.createElement('div');
          head.className = 'sc-note';
          if (c.kind === 'dash') head.innerHTML = '<span class="sc-oct"></span><span class="sc-num">–</span><span class="sc-oct"></span>';
          else head.innerHTML = noteHtml(c.note);
          cell.appendChild(head);
          var n = c.kind === 'note' && !c.tied ? c.note : null;
          if (n) {
            noteEls[n.index] = head;
            head.addEventListener('click', function () { start(current.verse, n.index); });
          }
          for (var v = 0; v < rowVerses; v++) {
            var syl = document.createElement('div');
            syl.className = 'sc-syl';
            if (n && n.slot !== undefined) {
              var s = syllable(score, v, n.slot);
              // a borrowed line (chorus) is shown once, on the first verse's row
              if (s.own || v === 0) {
                syl.textContent = s.text;
                (function (v, n) {
                  syl.addEventListener('click', function () { selectVerse(v); start(v, n.index); });
                })(v, n);
              }
              sylEls[v][n.slot] = syl;
            }
            cell.appendChild(syl);
          }
          mEl.appendChild(cell);
        });
        rowEl.appendChild(mEl);
      });
      sheet.appendChild(rowEl);
    });

    function selectVerse(v) {
      current.verse = v;
      verseBtns.forEach(function (b, i) { b.classList.toggle('on', i === v); });
    }

    function clearHighlight() {
      current.el.forEach(function (el) { el.classList.remove('sc-now'); });
      current.el = [];
    }

    function highlight(index) {
      clearHighlight();
      var n = score.notes[index];
      var els = [noteEls[index]];
      // during a slur keep the syllable of the note that started it lit
      var k = index;
      while (k > 0 && score.notes[k].slot === undefined && score.notes[k].slurCont) k--;
      var slot = score.notes[k].slot;
      if (slot !== undefined && n.n !== 0) {
        var s = syllable(score, current.verse, slot);
        els.push(s.own ? sylEls[current.verse][slot] : sylEls[0][slot]);
      }
      els.forEach(function (el) {
        if (!el) return;
        el.classList.add('sc-now');
        current.el.push(el);
      });
      if (els[0]) els[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function setPlaying(on) {
      current.playing = on;
      playBtn.textContent = on ? '■ 停止' : '▶ 播放';
      playBtn.classList.toggle('playing', on);
    }

    function start(verse, index) {
      selectVerse(verse);
      // play() first stops what was playing, which runs the old onEnd; mark playing after
      player.stop();
      setPlaying(true);
      player.play(playSong, {
        startIndex: index,
        onNote: highlight,
        onEnd: function (finished) {
          clearHighlight();
          setPlaying(false);
          // sing on through the remaining verses
          if (finished && current.verse < verseCount - 1) start(current.verse + 1, 0);
        }
      });
    }

    playBtn.addEventListener('click', function () {
      if (current.playing) player.stop();
      else start(current.verse, 0);
    });
    selectVerse(0);
  }

  return { parse: parse, hasLyrics: hasLyrics, render: render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = songScore;
