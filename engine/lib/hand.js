// Handwriting, stroke by stroke: a pen writes the text along the glyphs' own strokes at a steady speed, lifts between
// strokes, and comes back for the dots and accents at the end of each word. Classic script after core.js and
// hand-glyphs.js (A. V. Hershey's single-stroke fonts); draws itself onto a canvas from a before-hook.
//
//   const H = HAND.write(parent, text, at, o)   in build(). Starts on mark/beat `at`. o:
//     x, y          top-left in parent px (0, 0)          size     cap height px (48)
//     face          'auto' (script for Latin-only text, else cyr) | 'script' | 'cyr' | 'sans'
//     width         wrap at px (none)                     lh       line height in cap heights (1.9)
//     color         ink ('#1b1b1b')                       weight   stroke px (size * 0.075)
//     cps           letters per second (8)                track    extra advance in cap heights (auto: -0.06 cyr)
//     seed          the hand's wobble: baseline, tilt and size drift per letter (o.wobble 1; 0 = typeset)
//     res           canvas pixels per px (2: sharp under a 2x camera zoom)
//   Returns { el, end, size: { w, h }, pen(t) } — end = seconds when the last stroke is done; pen(t) = { x, y, down }
//   in parent px, for a pen or a hand to follow.
//   HAND.measure(text, o)  { w, h } of the laid-out text without drawing (for centring).
// Glyphs missing from the face fall back to the other faces, then are skipped (with a console warning).
//
//   A real handwriting font instead of the single-stroke glyphs: o.font = a CSS family (a theme's T.H, e.g. 'Caveat').
//   The text is set in that font and revealed letter by letter behind the pen, through a soft front along the line —
//   an outline font has no strokes to follow, so the pen sweeps each letter's width at the same `cps`. Extra o: weight
//   (400), size = font px (48), lh line height in font sizes (1.25), soft front width in font sizes (0.3). Layout is
//   measured once the font has loaded (a gate before frame 0); `end` and the timing are known at once (they depend on
//   the letter count only), `size` is filled by frame 0. HAND.measure() in this mode needs the font loaded already.
(() => {
  const { bt, clamp, mulberry32 } = C;
  const len = (s) => { let L = 0; for (let i = 2; i < s.length; i += 2) L += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]); return L; };
  const isLatin = (txt) => !/[Ѐ-ӿ]/.test(txt);
  const upTo = (p, d) => {   // the flat polyline p cut at length d
    const q = [p[0], p[1]];
    for (let k = 2; k < p.length; k += 2) {
      const sl = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
      if (d <= sl) { const f = sl ? d / sl : 0; q.push(p[k - 2] + (p[k] - p[k - 2]) * f, p[k - 1] + (p[k + 1] - p[k - 1]) * f); return q; }
      q.push(p[k], p[k + 1]); d -= sl;
    }
    return q;
  };

  function layout(text, o) {
    const G = window.HAND_GLYPHS, size = o.size ?? 48;
    const face = !o.face || o.face === 'auto' ? (isLatin(text) ? 'script' : 'cyr') : o.face;
    const track = (o.track ?? (face === 'cyr' ? -0.06 : 0)), lh = (o.lh ?? 1.9) * size, space = 0.42;
    const rnd = mulberry32(o.seed ?? 11), wob = o.wobble ?? 1;
    const glyph = (ch) => {
      for (const f of [face, 'cyr', 'script', 'sans']) if (G[f][ch]) return { ...G[f][ch], f };
      console.warn(`HAND: no glyph for «${ch}»`); return null;
    };
    // x-height of a face (from its x), for telling dots and accents from letter strokes
    const xh = (f) => { const g = G[f].x || G[f]['х']; return g ? -Math.min(...g.s.flatMap((s) => s.filter((_, i) => i % 2))) : 0.6; };
    const wordW = (w) => w.split('').reduce((a, ch) => a + ((glyph(ch)?.w ?? 0) + track) * size, 0);
    const words = text.split(/(\s+)/).filter((w) => w.length);
    const out = []; let x = 0, line = 0, maxW = 0, word = 0;
    for (const w of words) {
      if (/^\s+$/.test(w)) { if (w.includes('\n')) { line += w.split('\n').length - 1; x = 0; } else x += space * size; continue; }
      if (o.width && x > 0 && x + wordW(w) > o.width) { line++; x = 0; }
      for (const ch of w) {
        const g = glyph(ch); if (!g) continue;
        const dy = wob * (rnd() - 0.5) * 0.06 * size, rot = wob * (rnd() - 0.5) * 0.04, k = size * (1 + wob * (rnd() - 0.5) * 0.05);
        const ox = x, oy = (o.size ?? 48) * 1.15 + line * lh + dy, c = Math.cos(rot), sn = Math.sin(rot);
        const lower = ch !== ch.toUpperCase(), top = -(xh(g.f) + 0.08);
        const strokes = g.s.map((s) => {
          const p = []; for (let i = 0; i < s.length; i += 2) { const u = s[i] * k, v = s[i + 1] * k; p.push(ox + u * c - v * sn, oy + u * sn + v * c); }
          // a dot or an accent: short, wholly above the lowercase letters (above the capitals for Ё, Й), not a flat serif
          const ys = s.filter((_, i) => i % 2), serif = s.length === 4 && Math.abs(s[3] - s[1]) < 0.02;
          const late = !serif && len(s) < 0.8 && Math.max(...ys) < (lower ? top : -1.05);
          return { p, L: len(p), late };
        });
        out.push({ word, strokes });
        x += (g.w + track) * k; maxW = Math.max(maxW, x);
      }
      word++;
    }
    return { glyphs: out, w: maxW, h: (o.size ?? 48) * 1.15 + line * lh + size * 0.55, size, nWords: word };
  }

  // ---- font mode: set the text in a real font, reveal it behind a front that follows the pen
  const fontCss = (o) => `${o.weight ?? 400} ${o.size ?? 48}px '${o.font}'`;
  function fontLayout(text, o, ctx) {   // lines of { s, x[] }: x[i] = left edge of char i (kerning kept: prefix widths)
    const size = o.size ?? 48, lh = (o.lh ?? 1.25) * size;
    ctx.font = fontCss(o);
    const W = (s) => ctx.measureText(s).width, lines = [];
    for (const para of text.split('\n')) {
      let cur = '';
      for (const w of para.split(/ +/)) {
        const next = cur ? cur + ' ' + w : w;
        if (o.width && cur && W(next) > o.width) { lines.push(cur); cur = w; } else cur = next;
      }
      lines.push(cur);
    }
    const m = ctx.measureText('ЁЙДЩрфуgjÅ'), asc = m.actualBoundingBoxAscent || size * 0.9, desc = m.actualBoundingBoxDescent || size * 0.3;
    const out = lines.map((s, li) => ({ s, base: asc + li * lh, x: Array.from({ length: s.length + 1 }, (_, i) => W(s.slice(0, i))) }));
    return { lines: out, w: Math.max(0, ...out.map((l) => l.x[l.x.length - 1])), h: asc + (out.length - 1) * lh + desc, size, asc };
  }
  // timing: every letter takes 1/cps, a space 0.3/cps plus the word gap; a line break is a longer lift
  function fontTiming(text, at, cps) {
    let T = bt(at); const t0 = [], t1 = [];
    for (const ch of text) {
      if (ch === '\n') { t0.push(T); T += 0.18; t1.push(T); continue; }
      if (/\s/.test(ch)) { t0.push(T); T += 0.3 / cps + 0.05; t1.push(T); continue; }
      t0.push(T); T += 1 / cps; t1.push(T);
    }
    return { t0, t1, end: T };
  }
  function writeFont(parent, text, at, o) {
    const cps = o.cps ?? 8, size = o.size ?? 48, pad = size * 0.6, res = o.res ?? 2, soft = (o.soft ?? 0.3) * size;
    const chars = [...text.replace(/ +/g, ' ')], tm = fontTiming(chars.join(''), at, cps);
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    parent.append(cv);
    const out = { el: cv, end: tm.end, size: { w: 0, h: 0 }, pen: null };
    let L = null, map = [], cw = 0, ch = 0, tmp = null, mask = null;
    const setup = () => {
      L = fontLayout(chars.join(''), o, ctx);
      // char index in the text → (line, index in line); spaces swallowed by a wrap map to the line end
      map = []; let li = 0, ci = 0;
      for (const c of chars) {
        const line = L.lines[li];
        if (c === '\n' || (c === ' ' && line && ci >= line.s.length)) { map.push({ li, ci: line ? line.s.length : 0, wrap: true }); li++; ci = 0; continue; }
        map.push({ li, ci }); ci++;
      }
      cw = Math.ceil(L.w + 2 * pad); ch = Math.ceil(L.h + 2 * pad);
      cv.width = cw * res; cv.height = ch * res;
      cv.setAttribute('style', `position:absolute;left:${(o.x ?? 0) - pad}px;top:${(o.y ?? 0) - pad}px;width:${cw}px;height:${ch}px;pointer-events:none`);
      tmp = Object.assign(document.createElement('canvas'), { width: cw * res, height: ch * res });
      mask = Object.assign(document.createElement('canvas'), { width: cw * res, height: ch * res });
      out.size = { w: L.w, h: L.h };
    };
    C.gates.push(document.fonts.load(fontCss(o), chars.join('')).then(setup));
    // how far the pen has got on each line at t (px from the line start; -1 = not started)
    const fronts = (t) => {
      const f = L.lines.map(() => -1);
      map.forEach((m, i) => {
        if (m.wrap || t < tm.t0[i]) return;
        const l = L.lines[m.li], u = clamp((t - tm.t0[i]) / (tm.t1[i] - tm.t0[i]));
        f[m.li] = Math.max(f[m.li], l.x[m.ci] + (l.x[m.ci + 1] - l.x[m.ci]) * u);
      });
      return f;
    };
    const draw = (t) => {
      if (!L) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      if (t < bt(at)) return;
      const f = fronts(t), tc = tmp.getContext('2d'), mc = mask.getContext('2d');
      // line by line: a line's mask must not uncover the tops of the next line's letters (script lines overlap)
      L.lines.forEach((l, i) => {
        if (f[i] < 0) return;
        for (const c of [tc, mc]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, cw * res, ch * res); c.setTransform(res, 0, 0, res, pad * res, pad * res); }
        tc.font = fontCss(o); tc.fillStyle = o.color || '#1b1b1b'; tc.textBaseline = 'alphabetic';
        tc.fillText(l.s, 0, l.base);
        const end = l.x[l.x.length - 1];
        if (f[i] >= end - 0.01) { ctx.drawImage(tmp, 0, 0); return; }   // written: the whole line, no mask
        // solid up to the front minus the soft width, fading to nothing at the front; a script letter that swings back
        // under the previous one is already covered, so the front only ever moves right
        mc.fillStyle = '#000'; mc.fillRect(-pad, -pad, Math.max(0, f[i] - soft + pad), ch);
        const g = mc.createLinearGradient(f[i] - soft, 0, f[i], 0); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
        mc.fillStyle = g; mc.fillRect(f[i] - soft, -pad, soft, ch);
        tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'destination-in'; tc.drawImage(mask, 0, 0);
        ctx.drawImage(tmp, 0, 0);
      });
    };
    C.hooks.before.push(draw);
    out.pen = (t) => {
      const ox = o.x ?? 0, oy = o.y ?? 0;
      if (!L) return { x: ox, y: oy, down: false };
      let i = chars.findIndex((_, k) => t < tm.t1[k]); if (i < 0) i = chars.length - 1;
      const m = map[i], l = L.lines[Math.min(m.li, L.lines.length - 1)], u = clamp((t - tm.t0[i]) / (tm.t1[i] - tm.t0[i]));
      const x = m.wrap ? l.x[l.x.length - 1] : l.x[m.ci] + (l.x[m.ci + 1] - l.x[m.ci]) * u;
      const down = !m.wrap && !/\s/.test(chars[i]) && t >= tm.t0[i] && t < tm.t1[i];
      // the nib bobs over the x-height while it writes: a loop every letter, deterministic from t
      const bob = down ? Math.sin(u * Math.PI * 2) * size * 0.16 : 0;
      return { x: ox + x, y: oy + l.base - size * 0.32 + bob, down };
    };
    return out;
  }

  function measure(text, o = {}) {
    if (o.font) { const L = fontLayout(text, o, document.createElement('canvas').getContext('2d')); return { w: L.w, h: L.h }; }
    const L = layout(text, o); return { w: L.w, h: L.h };
  }

  function write(parent, text, at, o = {}) {
    if (o.font) return writeFont(parent, text, at, o);
    const L = layout(text, o), size = L.size, cps = o.cps ?? 8;
    // pen order: each word's strokes as written, then that word's dots and accents
    const order = [];
    for (let wd = 0; wd < L.nWords; wd++) {
      const gs = L.glyphs.filter((g) => g.word === wd);
      for (const late of [false, true]) for (const g of gs) for (const s of g.strokes) if (s.late === late && s.L > 0) order.push({ ...s, word: wd });
    }
    // the pen keeps `cps` letters a second overall, lifts included: lifts take a fixed beat plus their distance at 2.5x the
    // ink speed, so the ink speed comes out of what time is left (Hershey Cyrillic has ~5 strokes a letter, Latin ~1.5)
    const LIFT = 0.012, GAP = 0.05;
    let J = 0, fixed = 0;
    order.forEach((s, k) => { if (!k) return; const p = order[k - 1];
      J += Math.hypot(s.p[0] - p.p[p.p.length - 2], s.p[1] - p.p[p.p.length - 1]); fixed += LIFT + (s.word !== p.word ? GAP : 0); });
    const ink = order.reduce((a, s) => a + s.L, 0), total = Math.max(0.2, L.glyphs.length / cps);
    const v = (ink + J / 2.5) / Math.max(0.35 * total, total - fixed);   // px/s
    let T = bt(at), prev = null;
    for (const s of order) {
      if (prev) {
        const jump = Math.hypot(s.p[0] - prev.p[prev.p.length - 2], s.p[1] - prev.p[prev.p.length - 1]);
        T += LIFT + jump / (v * 2.5) + (s.word !== prev.word ? GAP : 0);   // a lift travels faster than ink, a new word breathes
      }
      s.T0 = T; s.dur = s.L / v; T += s.dur; prev = s;
    }
    // a canvas, cleared and redrawn whole every frame: an SVG repainted in parts antialiased overlapping strokes a few
    // levels differently depending on the previous frame (--verify caught it). o.res (2) keeps it sharp under a 2x zoom.
    const res = o.res ?? 2, pad = size * 0.6, cw = Math.ceil(L.w + 2 * pad), ch = Math.ceil(L.h + 2 * pad);
    const cv = document.createElement('canvas'); cv.width = cw * res; cv.height = ch * res;
    cv.setAttribute('style', `position:absolute;left:${(o.x ?? 0) - pad}px;top:${(o.y ?? 0) - pad}px;width:${cw}px;height:${ch}px;pointer-events:none`);
    parent.append(cv);
    const ctx = cv.getContext('2d');
    const draw = (t) => {
      ctx.setTransform(res, 0, 0, res, pad * res, pad * res); ctx.clearRect(-pad, -pad, cw, ch);
      ctx.strokeStyle = o.color || '#1b1b1b'; ctx.lineWidth = o.weight ?? size * 0.075; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const s of order) {
        const u = clamp((t - s.T0) / s.dur); if (u <= 0) continue;
        const q = upTo(s.p, u * s.L);
        ctx.beginPath(); ctx.moveTo(q[0], q[1]); for (let k = 2; k < q.length; k += 2) ctx.lineTo(q[k], q[k + 1]); ctx.stroke();
      }
    };
    C.hooks.before.push(draw);
    const pen = (t) => {
      const ox = o.x ?? 0, oy = o.y ?? 0;
      if (!order.length) return { x: ox, y: oy, down: false };
      let i = order.findIndex((s) => t < s.T0 + s.dur); if (i < 0) i = order.length - 1;
      const s = order[i];
      if (t < s.T0) {   // in the air, moving from the previous stroke's end to this stroke's start
        const p = order[i - 1], a = p ? [p.p[p.p.length - 2], p.p[p.p.length - 1]] : [s.p[0], s.p[1]];
        const u = p ? clamp((t - p.T0 - p.dur) / (s.T0 - p.T0 - p.dur)) : 0;
        return { x: ox + a[0] + (s.p[0] - a[0]) * u, y: oy + a[1] + (s.p[1] - a[1]) * u, down: false };
      }
      const q = upTo(s.p, clamp((t - s.T0) / s.dur) * s.L);
      return { x: ox + q[q.length - 2], y: oy + q[q.length - 1], down: t <= s.T0 + s.dur };
    };
    return { el: cv, end: T, size: { w: L.w, h: L.h }, pen };
  }

  window.HAND = { write, measure };
})();
