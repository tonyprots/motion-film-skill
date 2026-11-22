// Reusable timing and object presence. Marks are beats; durations are seconds.
// No timers or hidden state: every value is recomputed on a backwards seek too.
(() => {
  const finite = (v, name) => { if (!Number.isFinite(v)) throw new Error(`${name} must be finite`); return v; };
  const tokens = s => {
    const out = []; let lead = '';
    for (const p of s.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
      if (/[\p{L}\p{N}_]/u.test(p)) { out.push(lead + p); lead = ''; }
      else if (out.length) out[out.length - 1] += ' ' + p; else lead += p + ' ';
    }
    return out;
  };
  const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}_]/gu, '');
  C.word = (id, needle, { occurrence = 0, offset = 0 } = {}) => {
    if (!Number.isInteger(occurrence) || occurrence < 0) throw new Error('word occurrence must be a non-negative integer');
    finite(offset, 'word offset');
    const text = (window.LINES || {})[id];
    if (typeof text !== 'string') throw new Error(`no line text for ${id}; run sync.mjs after preparing the voice lines`);
    if (typeof needle !== 'string' || !needle.trim()) throw new Error('word needle must be nonempty');
    const words = tokens(text).map(norm), find = tokens(needle).map(norm);
    if (!find.length || find.some(s => !s)) throw new Error('word needle must contain letters or digits');
    const hits = [];
    for (let i = 0; i <= words.length - find.length; i++) if (find.every((w, k) => words[i + k] === w)) hits.push(i);
    if (hits.length <= occurrence) throw new Error(`word ${JSON.stringify(needle)} occurrence ${occurrence} is missing in ${id}`);
    return C.beatOf(`${id}.w${hits[occurrence] + 1}`) + offset;
  };
  C.enterExit = (t, e, o) => {
    if (!e || !o || o.from == null) throw new Error('enterExit needs an element and a from mark');
    const from = C.bt(o.from), to = o.to == null ? Infinity : C.bt(o.to);
    const enter = o.enterDuration ?? .6, exit = o.exitDuration ?? .45;
    if (o.to != null) finite(to, 'exit');
    finite(t, 'time'); finite(from, 'entrance'); finite(enter, 'enterDuration'); finite(exit, 'exitDuration');
    if (enter <= 0 || exit <= 0 || to < from + enter) throw new Error('entrance must finish before exit; durations must be positive');
    const a = o.enter || { x: 0, y: C.H + 40 }, z = o.exit || { x: C.W + 40, y: 0 };
    const ax = finite(a.x ?? 0, 'enter.x'), ay = finite(a.y ?? 0, 'enter.y');
    const zx = finite(z.x ?? 0, 'exit.x'), zy = finite(z.y ?? 0, 'exit.y');
    const base = e._base || {};
    const elapsed = C.clamp(t - from, 0, enter), role = o.role || 'enter';
    const p = t < from ? 0 : t >= from + enter ? 1 : C.clamp(Motion.step(elapsed, role) / Motion.step(enter, role));
    const q = to === Infinity ? 0 : C.ease.leave(C.clamp((t - to) / exit));
    const hide = t < from || t >= to + exit;
    C.put(e, { hide, o: hide ? 0 : 1, x: (base.x || 0) + ax * (1 - p) + zx * q,
      y: (base.y || 0) + ay * (1 - p) + zy * q });
    return { phase: t < from ? 'before' : t < from + enter ? 'enter' : t < to ? 'hold' : hide ? 'after' : 'exit', enter: p, exit: q };
  };
  C.rotate = (e, degrees, { origin = '50% 50%' } = {}) => {
    if (!e) throw new Error('rotate needs an element');
    finite(degrees, 'rotation');
    if (!CSS.supports('transform-origin', origin)) throw new Error(`invalid rotation origin: ${origin}`);
    C.put(e, { r: degrees, css: { transformOrigin: origin } });
  };
})();
