// Paper on a desk: weight through the shadow, tape, and a real highlighter. Classic script after core.js; pure functions
// of t (the marker draws itself from a before-hook, like CAM.cursor).
//
//   PAPER.drop(t, at, o)        props for C.put() of a sheet that lands on the desk on mark/beat `at`: it slides in lifted
//                               (a touch bigger, its shadow far and soft), falls faster as it drops, lands — the shadow
//                               snaps tight — hops a hair, skids a few px and stops; its rotation overshoots ~10 % and
//                               settles. o: from 'left'|'right'|'top'|'bottom' (default 'bottom'), dist px (900), dur s (0.7),
//                               r final deg (0), spin deg added at the start (8), lift scale (0.06), skid px (6),
//                               shadow [r, g, b] (0 0 0). Returns { x, y, s, r, css: { filter }, hide, h } — h = height 0…1.
//   PAPER.tape(t, at, o)        a strip of tape slapped on from above the lens: 135 % → 100 % in o.dur (0.2 s), a small
//                               squash on impact. Returns { s, sx, sy, hide }.
//   PAPER.marker(target, at, o) a highlighter sweep under the words of `target` (a text element), line by line, left to
//                               right: rough edges, faint streaks along the stroke, a slanted chisel end, a darker blob
//                               where the pen first touched. It lies UNDER the letters (the target becomes its own stacking
//                               context), so ink stays black without any blend mode. Call in build(). o: text (a substring
//                               to mark; default all), color ('#ffe024'; lime '#c9f52a'), speed px/s (1100), gap s between
//                               lines (0.12), height share of the line (0.62), seed. Returns { el, end, lines } — end = seconds
//                               when the last line is done (filled once frame 0 is ready: read it in run(), not build()).
(() => {
  const { bt, clamp, mulberry32 } = C;
  const ease = { out: (x) => 1 - Math.pow(1 - x, 3), inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2) };
  const ROT = { response: 0.5, damping: 0.6 };   // ~10 % overshoot
  const DIR = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

  function drop(t, at, o = {}) {
    const T0 = bt(at), dur = o.dur ?? 0.7, T1 = T0 + dur, dist = o.dist ?? 900, skid = o.skid ?? 6;
    const [dx, dy] = DIR[o.from || 'bottom'];
    // travel: ease-out to skid px short of the mark, then the skid closes the gap after the landing
    const p = ease.out(clamp((t - T0) / dur));
    const sk = t > T1 ? skid * (1 - Math.exp(-(t - T1) / 0.05)) : 0;
    const off = (dist - skid) * (1 - p) + skid - sk;
    // height: held up for the first 45 %, then a fall that accelerates (gravity) to 0 at T1, then a hair of a hop
    const fall = clamp((t - (T0 + 0.45 * dur)) / (0.55 * dur));
    let h = t < T1 ? 1 - fall * fall : 0;
    if (t >= T1 && t < T1 + 0.14) h = 0.07 * Math.sin(Math.PI * (t - T1) / 0.14);
    const r = (o.r ?? 0) + (o.spin ?? 8) * (1 - Motion.step(t - T0, ROT));
    const [cr, cg, cb] = o.shadow || [0, 0, 0];
    const soft = `drop-shadow(${(4 + 30 * h).toFixed(1)}px ${(6 + 44 * h).toFixed(1)}px ${(8 + 36 * h).toFixed(1)}px rgba(${cr},${cg},${cb},${(0.26 - 0.1 * h).toFixed(3)}))`;
    const contact = `drop-shadow(0px 1px ${(1 + 6 * h).toFixed(1)}px rgba(${cr},${cg},${cb},${(0.34 * (1 - h)).toFixed(3)}))`;
    return { x: -dx * off, y: -dy * off, s: 1 + (o.lift ?? 0.06) * h, r, css: { filter: `${contact} ${soft}` }, hide: t < T0, h };
  }

  function tape(t, at, o = {}) {
    const T0 = bt(at), dur = o.dur ?? 0.2, u = clamp((t - T0) / dur);
    const s = 1 + 0.35 * (1 - u * u);   // falls toward the desk, accelerating
    const sq = t >= T0 + dur ? 0.08 * Math.exp(-(t - T0 - dur) / 0.04) : 0;   // squash on impact
    return { s, sx: 1 + sq, sy: 1 - sq, hide: t < T0 };
  }

  // the client rects of `text` inside `target`, merged per line, in the target's own px
  function lineBoxes(target, text) {
    const nodes = [], walk = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) nodes.push(n);
    const full = nodes.map((n) => n.textContent).join('');
    const i0 = text ? full.indexOf(text) : 0;
    if (i0 < 0) throw new Error(`PAPER.marker: «${text}» is not in the target's text`);
    const i1 = text ? i0 + text.length : full.length;
    const rg = document.createRange(); let acc = 0, set0 = false;
    for (const n of nodes) {
      const L = n.textContent.length;
      if (!set0 && i0 <= acc + L) { rg.setStart(n, i0 - acc); set0 = true; }
      if (i1 <= acc + L) { rg.setEnd(n, i1 - acc); break; }
      acc += L;
    }
    const R = target.getBoundingClientRect(), k = target.offsetWidth ? R.width / target.offsetWidth : 1;
    const lines = [];
    for (const q of rg.getClientRects()) {
      if (q.width < 1) continue;
      const b = { l: (q.left - R.left) / k, r: (q.right - R.left) / k, t: (q.top - R.top) / k, b: (q.bottom - R.top) / k };
      const same = lines.find((x) => Math.abs(x.t - b.t) < (b.b - b.t) * 0.5);
      if (same) { same.l = Math.min(same.l, b.l); same.r = Math.max(same.r, b.r); } else lines.push(b);
    }
    return lines.sort((a, b) => a.t - b.t);
  }

  function marker(target, at, o = {}) {
    const color = o.color || '#ffe024', speed = o.speed ?? 1100, gap = o.gap ?? 0.12, share = o.height ?? 0.62;
    const rnd = mulberry32(o.seed ?? 7);
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.style.isolation = 'isolate';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('style', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;z-index:-1;pointer-events:none');
    target.prepend(svg);
    const dark = color.replace(/^#?(..)(..)(..)$/, (m, r, g, b) => '#' + [r, g, b].map((h) => Math.round(parseInt(h, 16) * 0.82).toString(16).padStart(2, '0')).join(''));
    // measured in a gate: after the fonts load and before frame 0 paints any transform (build() runs before both)
    const out = { el: svg, end: bt(at), lines: [] };
    let L = [];
    const measure = () => { let T = bt(at); L = lineBoxes(target, o.text).map((b) => {
      const h = (b.b - b.t) * share, mid = b.t + (b.b - b.t) * 0.56, pad = h * 0.18;
      const x0 = b.l - pad, x1 = b.r + pad, n = Math.max(4, Math.ceil((x1 - x0) / 14));
      const jag = (amp) => Array.from({ length: n + 1 }, () => (rnd() * 2 - 1) * amp);
      const top = jag(h * 0.05), bot = jag(h * 0.05);
      const streaks = [0.3, 0.55, 0.78].map((f) => ({ y: mid - h / 2 + h * f + (rnd() - 0.5) * h * 0.08, a: 0.1 + rnd() * 0.12, w: 1 + rnd() * 1.5 }));
      const dur = (x1 - x0) / speed + 0.12, line = { x0, x1, n, h, mid, top, bot, streaks, T0: T, dur };
      T += dur + gap;
      const g = document.createElementNS(NS, 'g');
      line.blob = document.createElementNS(NS, 'ellipse');
      line.body = document.createElementNS(NS, 'path');
      line.lines = streaks.map(() => document.createElementNS(NS, 'path'));
      line.body.setAttribute('fill', color);
      line.blob.setAttribute('fill', dark); line.blob.setAttribute('opacity', '0.55');
      for (const [k, s] of line.lines.entries()) { s.setAttribute('stroke', '#fff'); s.setAttribute('stroke-opacity', String(streaks[k].a)); s.setAttribute('stroke-width', String(streaks[k].w)); s.setAttribute('fill', 'none'); }
      g.append(line.body, line.blob, ...line.lines); svg.append(g);
      return line;
    });
    if (L.length) { out.end = L[L.length - 1].T0 + L[L.length - 1].dur; out.lines = L.map((l) => ({ start: l.T0, end: l.T0 + l.dur })); } };
    C.gates.push(document.fonts.ready.then(measure));
    const slant = (h) => h * 0.32;   // chisel: the top edge runs ahead of the bottom one
    const draw = (t) => {
      for (const l of L) {
        const u = ease.inOut(clamp((t - l.T0) / l.dur));
        if (u <= 0) { l.body.setAttribute('d', ''); l.blob.setAttribute('rx', '0'); for (const s of l.lines) s.setAttribute('d', ''); continue; }
        const xe = l.x0 + (l.x1 - l.x0) * u, step = (l.x1 - l.x0) / l.n, yt = l.mid - l.h / 2, yb = l.mid + l.h / 2;
        const pts = [[l.x0 + slant(l.h), yt + l.top[0]]];
        for (let i = 1; i <= l.n && l.x0 + i * step < xe; i++) pts.push([l.x0 + i * step, yt + l.top[i]]);
        const k = Math.min(l.n, Math.floor((xe - l.x0) / step));
        pts.push([xe, yt + l.top[k]], [xe - slant(l.h), yb + l.bot[k]]);
        for (let i = k; i >= 1; i--) if (l.x0 + i * step < xe - slant(l.h)) pts.push([l.x0 + i * step, yb + l.bot[i]]);
        pts.push([l.x0, yb + l.bot[0]]);
        l.body.setAttribute('d', 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L') + 'Z');
        l.blob.setAttribute('cx', (l.x0 + l.h * 0.35).toFixed(1)); l.blob.setAttribute('cy', l.mid.toFixed(1));
        l.blob.setAttribute('rx', (l.h * 0.38 * Math.min(1, u * 8)).toFixed(1)); l.blob.setAttribute('ry', (l.h * 0.44).toFixed(1));
        l.lines.forEach((s, i) => s.setAttribute('d', `M${(l.x0 + l.h * 0.5).toFixed(1)} ${l.streaks[i].y.toFixed(1)}L${Math.max(l.x0 + l.h * 0.5, xe - slant(l.h) - 4).toFixed(1)} ${l.streaks[i].y.toFixed(1)}`));
      }
    };
    C.hooks.before.push(draw);
    return out;
  }

  window.PAPER = { drop, tape, marker };
})();
