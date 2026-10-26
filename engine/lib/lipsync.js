// Mouth from the voiceover words. window.VOW (sync.mjs): [[t0, t1, word], ...] in film seconds, from the word marks
// <id>.w<k> and the word ends in audio/vo/<id>.words.json. Inside a word its letters share the time (vowels count
// double) and each letter picks a mouth shape; between words the mouth closes. Not phoneme recognition: a letter
// guess on real word timing, so the mouth moves only while the voice speaks and opens on its vowels.
// Shapes: x closed (also м б п), b slightly open (most consonants), c «и/е» wide with teeth, d «а» wide open,
// e «о» round, f «у» small pucker.
(() => {
  const SHAPES = ['x', 'b', 'c', 'd', 'e', 'f'];
  const OPEN = { x: 0, b: 0.3, c: 0.5, d: 1, e: 0.75, f: 0.3 };
  const ROUND = { e: 0.6, f: 1 };
  const SHAPE = {};
  for (const [shape, letters] of [['d', 'аяa'], ['e', 'оёo'], ['f', 'уюuwщ'], ['c', 'эеиыeiy'], ['x', 'мбпmbp']])
    for (const ch of letters) SHAPE[ch] = shape;
  const VOWEL = new Set([...'аяоёуюэеиыaeiouy']);
  // one word → [[from, to, shape]] inside [t0, t1]
  function plan(t0, t1, word) {
    const letters = [...String(word).toLowerCase()].filter((ch) => /[\p{L}\p{N}]/u.test(ch));
    if (!letters.length || !(t1 > t0)) return [];
    const shapes = letters.map((ch, i) => /\p{N}/u.test(ch) ? (i % 2 ? 'c' : 'd') : SHAPE[ch] || 'b');
    const weight = letters.map((ch) => (VOWEL.has(ch) || /\p{N}/u.test(ch) ? 2 : 1)), total = weight.reduce((a, b) => a + b, 0);
    const out = []; let acc = 0;
    for (let i = 0; i < letters.length; i++) {
      const a = t0 + (t1 - t0) * acc / total; acc += weight[i];
      const b = t0 + (t1 - t0) * acc / total, last = out[out.length - 1];
      if (last && last[2] === shapes[i]) last[1] = b; else out.push([a, b, shapes[i]]);
    }
    return out;
  }
  // A shape shorter than one frame flickers: merge it into its neighbour.
  function settle(segments, minHold) {
    const out = [];
    for (const s of segments) {
      const last = out[out.length - 1];
      if (last && (s[1] - s[0] < minHold || last[2] === s[2]) && Math.abs(last[1] - s[0]) < 1e-6) last[1] = s[1];
      else out.push([...s]);
    }
    return out;
  }
  let cache = null;
  function segmentsOf(words, fps) {
    if (cache && cache.words === words && cache.fps === fps) return cache.segments;
    if (!Array.isArray(words)) throw new Error('LIPSYNC needs window.VOW or a word list [[t0, t1, word], ...]');
    const all = [];
    for (const w of words) {
      if (!Array.isArray(w) || !Number.isFinite(w[0]) || !Number.isFinite(w[1])) throw new Error('LIPSYNC word needs [t0, t1, word]');
      all.push(...settle(plan(w[0], w[1], w[2]), 1 / fps));
    }
    all.sort((a, b) => a[0] - b[0]);
    cache = { words, fps, segments: all };
    return all;
  }
  // at(t) → { shape, open 0..1, round 0..1, speaking }. words default to window.VOW; fps to the film's.
  function at(t, { words = window.VOW || [], fps = window.TL?.fps || 30 } = {}) {
    if (!Number.isFinite(t)) throw new Error('LIPSYNC.at needs a finite time');
    const S = segmentsOf(words, fps);
    let lo = 0, hi = S.length - 1, hit = null;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (S[m][1] <= t) lo = m + 1; else if (S[m][0] > t) hi = m - 1; else { hit = S[m]; break; }
    }
    const shape = hit ? hit[2] : 'x';
    return { shape, open: OPEN[shape], round: ROUND[shape] || 0, speaking: !!hit };
  }
  window.LIPSYNC = { at, plan, shapes: SHAPES };
})();
