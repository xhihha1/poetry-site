// Plays a song saved by the 簡譜 editors (jianpu/{book}/{book}_{NNN}.json).
// Only the JSON's `measures` field is used: each note already carries its
// total duration (dots, "-" and ties merged), so no notation parsing is needed.
var jianpuPlayer = (function () {
  var KEY_TO_MIDI = {
    C: 60, Db: 61, D: 62, Eb: 63, E: 64, F: 65,
    'F#': 66, Gb: 66, G: 67, Ab: 68, A: 69, Bb: 70, B: 71
  };
  var DEGREE_SEMITONE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
  var INTRO_MEASURES = 2;

  var audioCtx = null;
  var oscillators = [];
  var endTimer = null;
  var onEnd = null;

  function songUrl(book, paddedNumber) {
    return './jianpu/' + book + '/' + book + '_' + paddedNumber + '.json';
  }

  // Resolves to the song object, or null when no JSON exists for that song.
  function load(book, paddedNumber) {
    return fetch(songUrl(book, paddedNumber), { cache: 'no-cache' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (song) { return song && Array.isArray(song.measures) ? song : null; })
      .catch(function () { return null; });
  }

  function midiOf(song, note) {
    var root = KEY_TO_MIDI[song.key] != null ? KEY_TO_MIDI[song.key] : 60;
    var acc = note.acc === '#' ? 1 : note.acc === 'b' ? -1 : 0;
    return root + (DEGREE_SEMITONE[note.n] || 0) + acc + 12 * (note.oct || 0);
  }

  function quarterSeconds(song) {
    var den = parseInt(String(song.time || '4/4').split('/')[1], 10) || 4;
    return (60 / (song.tempo || 72)) * (den / 4);
  }

  function tone(midi, t0, dur) {
    var osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    var gain = audioCtx.createGain();
    dur = Math.max(dur, 0.05);
    var attack = 0.015;
    var release = Math.min(0.08, dur * 0.3);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.5, t0 + attack);
    gain.gain.setValueAtTime(0.5, Math.max(t0 + attack, t0 + dur - release));
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur - 0.004);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    oscillators.push(osc);
  }

  function stop() {
    oscillators.forEach(function (o) { try { o.stop(); } catch (e) { /* already stopped */ } });
    oscillators = [];
    clearTimeout(endTimer);
    var cb = onEnd;
    onEnd = null;
    if (cb) cb();
  }

  // options.intro: sound the tonic, then only the first few measures.
  // options.onEnd: called once when playback finishes or is stopped.
  function play(song, options) {
    options = options || {};
    stop();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    var qsec = quarterSeconds(song);
    var t = audioCtx.currentTime + 0.05;
    var measures = song.measures;
    if (options.intro) {
      var primer = 0.4 * qsec;
      tone(midiOf(song, { n: 1 }), t, primer);
      t += primer + 0.15;
      measures = measures.slice(0, INTRO_MEASURES);
    }
    measures.forEach(function (m) {
      m.forEach(function (note) {
        var dur = note.dur * qsec;
        if (note.n !== 0) tone(midiOf(song, note), t, dur);
        t += dur;
      });
    });

    onEnd = options.onEnd || null;
    endTimer = setTimeout(stop, (t - audioCtx.currentTime) * 1000 + 100);
  }

  return { songUrl: songUrl, load: load, play: play, stop: stop };
})();
