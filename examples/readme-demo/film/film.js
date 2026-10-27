// motion-film — README demo v2, made with the skill itself (../SCRIPT.md).
// A presenter walks through the film; every object enters on the word that names it (marks <id>.w<k>).
// The presenter is a puppet pack from assets/puppets/ (the first one found); without a pack, the drawn ACTOR stands in.
// Pure function of time: no timers, no Math.random, nothing mutated in run().
(() => {
  const { W, H, pick, put, reg, el, scene, sp, spHit, clamp, lerp, ease, bt, beatOf, beatAt } = C;
  const { line, rise } = TYPE;
  C.fonts = ['650 100px Display', '400 40px UI', '500 40px UI', '600 40px UI'];
  ILLUSTRATIONS.style({ skin: 'line', palette: { ink: '#121316', paper: '#ffffff', accent: '#3550ff' } });

  const B = (mark, ds = 0) => beatAt(bt(mark) + ds);                // a mark shifted by seconds, in beats
  const show = (p) => (p > 0.001 ? 1 : 0);
  const abs = (parent, css, html = '', cls = 'abs') => el('div', { class: cls, style: css }, parent, html);
  const WIDE = W > H;
  // zones (EDITORIAL "frame with a presenter"): the presenter stands left and gestures right, into the object zone
  const Z = WIDE ? { x: 780, y: 250, w: 1020, h: 640 } : { x: 90, y: 470, w: 860, h: 760 };
  const TITLE = { x: Z.x, y: pick(96, 96, 286), size: pick(76, 76, 72), lh: pick(88, 88, 84) };

  function appear(t, e, b, o = {}) {                               // grows and rises, reads ON the beat
    const p = spHit(t, b, o.preset || 'snappy'), s0 = o.s0 ?? 0.8;
    put(e, { o: show(p), s: s0 + (1 - s0) * p, y: (o.dy ?? 30) * (1 - p) + (o.y ?? 0), x: (o.dx ?? 0) * (1 - p) + (o.x ?? 0) });
    return p;
  }
  // scene title: whole on screen within ~1 s of the scene start; rows of words rise through their masks
  function title(root, rows, accent = {}) {
    return rows.map((r, i) => line(root, r, { x: TITLE.x, y: TITLE.y + i * TITLE.lh, size: TITLE.size, accent: accent[i] || [] }));
  }
  const titleIn = (t, Ls, at) => Ls.forEach((L, i) => rise(t, L, beatOf(at) + i * 0.12, null, { stagger: 0.05 }));
  // a positioned holder: library roots carry their own base x/y, and put({y}) would replace it, so they sit at 0,0 inside
  const at0 = (root, x, y) => reg(abs(root, `left:${x}px;top:${y}px`));
  const bg = (root, color = 'var(--bg)') => abs(root, `left:0;top:0;width:${W}px;height:${H}px;background:${color}`);

  // ------------------------------------------------------------------ 1. Hook: the report nobody reads
  const DOC = WIDE ? { x: 930, y: 300, w: 760 } : { x: 120, y: 560, w: 820 };
  function report(root) {                                          // a thick report: two sheets under the document
    const g = reg(abs(root, `left:${DOC.x}px;top:${DOC.y}px;width:${DOC.w}px;height:${DOC.w * 0.75}px`));
    for (const k of [2, 1]) abs(g, `left:${DOC.w * 0.17 + k * 14}px;top:${DOC.w * 0.75 * 0.11 + k * 12}px;width:${DOC.w * 0.66}px;height:${DOC.w * 0.75 * 0.8}px;` +
      'background:#fff;border:3px solid #121316;border-radius:10px');
    const d = ILLUSTRATIONS.object(g, 'document', { x: 0, y: 0, w: DOC.w, title: '', label: '' });
    return { g, d };
  }
  scene({
    name: 'hook', from: 0, to: 'sc2',
    build(root, S) {
      bg(root);
      S.T = title(root, WIDE ? ['Nobody reads the', '48-page report.'] : ['Nobody reads the', '48-page report.'], { 1: [1] });
      S.R = report(root);
      S.chip = reg(el('div', { class: 'chip', style: 'color:var(--ink);font:650 48px/1 UI;padding:20px 32px' }, root, '0 views'));
      C.anchor(S.chip, S.R.g, WIDE ? 'tr' : 'tl', { inset: 40 });
    },
    run(t, b, S) {
      titleIn(t, S.T, -0.6);                                       // frame 0 already reads
      put(S.R.g, { y: 8 * Math.sin(t * 1.3) });
      put(S.chip, { o: show(appear(t, S.chip, 's1a.w2')) * (1 - clamp((t - (bt('sc2') - 0.25)) / 0.15)) });   // leaves before the cut
    },
  });

  // ------------------------------------------------------------------ 2. Turn: the report becomes a film frame
  const FR = WIDE ? { x: 800, y: 300, w: 880, h: 495 } : { x: 110, y: 560, w: 860, h: 484 };
  const CODE = ["scene({ from: 's2a',", "  run(t) { /* … */ } })"];
  scene({
    name: 'turn', from: 'sc2', to: 'sc3',
    build(root, S) {
      bg(root);
      S.T = title(root, ['Make it a film.'], { 0: [3] });
      S.R = report(root);
      const k = DOC.w / 400;                                         // the document's paper inside its 400×300 view box
      S.move = MORPH.handoff({ from: MORPH.rect(DOC.x + 70 * k, DOC.y + 35 * k, 260 * k, 230 * k, 10), to: MORPH.rect(FR.x, FR.y, FR.w, FR.h, 22),
        at: bt('s2a.w4'), duration: 0.75, arc: 60 });
      S.paper = MORPH.mount(root, S.move, { fill: '#ffffff', stroke: '#121316', width: 3 });
      S.frame = reg(abs(root, `left:${FR.x}px;top:${FR.y}px;width:${FR.w}px;height:${FR.h}px;border-radius:22px;overflow:hidden;background:#121316`));
      const strip = abs(S.frame, `left:40px;top:${FR.h - 92}px;width:${FR.w - 80}px;height:44px`);
      S.blocks = [0.18, 0.12, 0.26, 0.2, 0.24].map((w, i, a) => reg(abs(strip, `left:${a.slice(0, i).reduce((s, x) => s + x, 0) * (FR.w - 80)}px;top:0;` +
        `width:${w * (FR.w - 80) - 8}px;height:44px;border-radius:10px;background:${i === 2 ? 'var(--accent)' : '#3a3d44'}`)));
      S.head = reg(abs(strip, 'left:0;top:-14px;width:4px;height:72px;border-radius:2px;background:#fff'));
      S.code = CODE.map((s, i) => abs(S.frame, `left:48px;top:${56 + i * 64}px;font:500 ${pick(40, 40, 38)}px/1.2 ui-monospace,Menlo,monospace;color:#f5f5f2;white-space:pre`));
      S.agentBox = at0(root, WIDE ? FR.x + FR.w - 170 : FR.x + FR.w - 300, FR.y + FR.h - 120);
      S.agent = ILLUSTRATIONS.object(S.agentBox, 'agent', { x: 0, y: 0, w: pick(300, 300, 320), status: '', label: '' });
    },
    run(t, b, S) {
      titleIn(t, S.T, 'sc2');
      const m0 = bt('s2a.w4'), m1 = m0 + 0.75;
      put(S.R.g, { o: 1 - clamp((t - m0) / 0.15), y: 8 * Math.sin(t * 1.3) });   // the report's lines fade as its paper starts to move
      S.paper.draw(t);
      put(S.paper.root, { o: t >= m0 - 0.02 && t < m1 + 0.1 ? 1 : 0 });
      const f = clamp((t - (m1 - 0.25)) / 0.3);                     // the paper darkens into the frame as it lands
      put(S.frame, { o: ease.inOut(f) });
      const c0 = m1 + 0.2, n = CODE.join('').length, k = Math.floor(clamp((t - c0) / (bt('s2a.end') - c0)) * n + 1e-6);
      let left = k; S.code.forEach((c, i) => { put(c, { text: CODE[i].slice(0, Math.max(0, left)) }); left -= CODE[i].length; });
      const play = clamp((t - m1) / 2.6);
      put(S.head, { x: play * (FR.w - 84) });
      S.blocks.forEach((e, i) => put(e, { sy: spHit(t, B('s2a.w8', 0.08 * i), 'snappy') }));
      const a = appear(t, S.agentBox, 's2a.w3', { s0: 0.6 });
      S.agent.draw({ work: t * 0.9, done: clamp((t - bt('s2a.end')) / 0.3), status: '' });
    },
  });

  // ------------------------------------------------------------------ 3. The voice is the timeline
  const KAR = WIDE ? { x: Z.x, y: 120, w: 1060, size: 72 } : { x: 90, y: 300, w: 900, size: 68 };
  const TRK = WIDE ? { x: 800, y: 760, w: 980 } : { x: 110, y: 1110, w: 840 };
  const DROPS = [['s3a.w2', 'noto:studio-microphone'], ['s3a.w5', 'noto:stopwatch'], ['s3a.w7', 'noto:package'], ['s3a.w11', 'noto:memo']];
  scene({
    name: 'voice', from: 'sc3', to: 'sc4',
    build(root, S) {
      bg(root);
      const box = abs(root, `left:${KAR.x}px;top:${KAR.y}px;width:${KAR.w}px;font:650 ${KAR.size}px/1.12 Display;letter-spacing:-0.035em;color:var(--ink)`);
      const words = (window.VO || []).find((v) => v.id === 's3a')?.text.split(' ') || [];
      S.words = words.map((w, i) => {
        const s = el('span', { style: `display:inline-block;margin-right:0.26em;${[1, 4, 6, 10].includes(i) ? 'color:var(--accent)' : ''}` }, box, w);
        if (i === 4) el('br', {}, box);
        return reg(s, { o: 0 });
      });
      const px = (s) => TRK.x + (s - PEAKS.t0) / (PEAKS.v.length * PEAKS.dt) * TRK.w;
      S.px = px;
      S.bars = PEAKS.v.map((v, i) => reg(abs(root, `left:${TRK.x + i * TRK.w / PEAKS.v.length}px;top:${TRK.y - 4 - v * 70}px;width:${Math.max(3, TRK.w / PEAKS.v.length - 3)}px;` +
        `height:${8 + v * 140}px;border-radius:3px;background:#c9ccd3`)));
      S.ticks = (window.VOW || []).filter((w) => w[0] >= PEAKS.t0 && w[0] < PEAKS.t0 + PEAKS.v.length * PEAKS.dt)
        .map((w) => reg(abs(root, `left:${px(w[0]) - 2}px;top:${TRK.y + 86}px;width:4px;height:22px;border-radius:2px;background:var(--ink)`), { o: 0 }));
      S.head = reg(abs(root, `left:0;top:${TRK.y - 120}px;width:4px;height:240px;border-radius:2px;background:var(--accent)`));
      S.drops = DROPS.map(([m, id]) => {
        const size = pick(150, 150, 150);
        const g = at0(root, px(bt(m)) - size / 2, TRK.y - 120 - size - 12);
        ILLUSTRATIONS.extra(g, id, { x: 0, y: 0, w: size });
        return { m, e: { root: g } };
      });
    },
    run(t, b, S) {
      S.words.forEach((w, i) => {
        const k = clamp((t - (bt(`s3a.w${i + 1}`) - 1 / 60)) / (4 / 60));   // karaoke: a word enters one frame before its mark
        put(w, { o: show(k) * ease.out(k), y: 10 * (1 - ease.out(k)) });
      });
      const head = clamp(t, PEAKS.t0, PEAKS.t0 + PEAKS.v.length * PEAKS.dt);
      put(S.head, { x: S.px(head) - 2, o: show(sp(t, 'sc3', 'snappy')) });
      S.bars.forEach((e, i) => put(e, { css: { background: PEAKS.t0 + i * PEAKS.dt <= head ? '#121316' : '#c9ccd3' }, sy: sp(t, B('sc3', 0.004 * i), 'snappy') }));
      const VW = (window.VOW || []).filter((w) => w[0] >= PEAKS.t0 && w[0] < PEAKS.t0 + PEAKS.v.length * PEAKS.dt);
      S.ticks.forEach((e, i) => put(e, { o: t >= VW[i][0] ? 1 : 0 }));
      S.drops.forEach(({ m, e }) => {                                 // each object falls onto its word and lands on the mark
        const p = spHit(t, m, 'default');
        put(e.root, { o: show(p), y: -260 * (1 - p), r: -8 * (1 - p) });
      });
    },
  });

  // ------------------------------------------------------------------ 4. The library
  const KINDS = [['agent', {}], ['funnel', { top: '', bottom: '' }], ['tokens', { amount: '', base: '' }], ['phone', { tag: '' }], ['lock', {}], ['scales', { left: '', right: '' }]];
  const SKINS = ['line', 'flat', 'mono', 'sketch'], SKIN_AT = [null, 's4a.w4', 's4a.w5', 's4a.w6'];
  const GRID = WIDE ? { cols: 3, w: 300, dx: 340, dy: 250, x: Z.x + 10, y: Z.y + 10 } : { cols: 3, w: 270, dx: 290, dy: 230, x: Z.x, y: Z.y + 20 };
  const EXTRAS = ['noto:rocket', 'noto:trophy', 'noto:light-bulb', 'noto:books', 'noto:artist-palette', 'noto:camera', 'noto:laptop', 'noto:headphone',
    'noto:gear', 'noto:alarm-clock', 'noto:clapper-board', 'noto:film-frames', 'noto:bell', 'noto:scissors', 'noto:magnifying-glass-tilted-left', 'noto:pencil',
    'noto:calendar', 'noto:bar-chart', 'noto:label', 'noto:scroll', 'noto:ticket', 'noto:bookmark', 'noto:musical-keyboard', 'noto:candle'];
  const ICONS = ['lucide:workflow', 'tabler:sitemap', 'phosphor:flow-arrow', 'lucide:chart-line', 'tabler:server', 'phosphor:globe', 'lucide:monitor', 'tabler:git-branch'];
  const EG = WIDE ? { cols: 8, size: 104, step: 126, x: Z.x + 4, y: Z.y + 10 } : { cols: 6, size: 112, step: 142, x: Z.x + 6, y: Z.y + 20 };
  scene({
    name: 'library', from: 'sc4', to: 'sc5',
    build(root, S) {
      bg(root);
      S.T = title(root, WIDE ? ['A library before a blank page.'] : ['A library before', 'a blank page.'], WIDE ? { 0: [1] } : { 0: [1] });
      S.objs = KINDS.map(([kind, o], i) => {
        const x = GRID.x + (i % GRID.cols) * GRID.dx, y = GRID.y + Math.floor(i / GRID.cols) * GRID.dy;
        const g = reg(abs(root, `left:${x}px;top:${y}px;width:${GRID.w}px;height:${GRID.w * 0.75}px`));
        return { g, v: SKINS.map((skin) => ILLUSTRATIONS.object(g, kind, { x: 0, y: 0, w: GRID.w, skin, label: '', ...o })) };
      });
      const cy = GRID.y + 2 * GRID.dy + 10;
      S.chips = SKINS.map((s, i) => reg(el('div', { class: 'chip', style: `left:${GRID.x + pick(120, 120, 0) + i * pick(220, 220, 212)}px;top:${cy}px;font:600 34px/1 UI` }, root, s)));
      S.extras = EXTRAS.map((id, i) => { const g = at0(root, EG.x + (i % EG.cols) * EG.step, EG.y + Math.floor(i / EG.cols) * EG.step); ILLUSTRATIONS.extra(g, id, { x: 0, y: 0, w: EG.size }); return { i, e: { root: g } }; })
        .slice(0, WIDE ? 24 : 24);
      const iy = EG.y + Math.ceil(EXTRAS.length / EG.cols) * EG.step + 6;
      S.icons = ICONS.slice(0, EG.cols).map((id, i) => { const g = at0(root, EG.x + 8 + i * EG.step, iy); GRAPHICS.icon(g, id, { x: 0, y: 0, size: EG.size - 16, color: 'var(--accent)' }); return g; });
      const pts = S.extras.map(({ i }) => ({ x: (i % EG.cols) * EG.step, y: Math.floor(i / EG.cols) * EG.step }));
      S.wave = CAUSAL.wave(pts, { origin: { x: 0, y: 0 }, speed: 2400, at: bt('s4b.w2') - 0.12, duration: 0.6, mode: 'radial' });
      S.chartBox = at0(root, pick(840, 840, 110), pick(250, 250, 520));
      S.chart = BLOCKS.mount(S.chartBox, 'data-chart', { id: 'library', label: '', x: 0, y: 0, w: pick(900, 900, 840),
        data: [{ label: 'objects', value: 30 }, { label: 'icons', value: 120 }, { label: 'extras', value: 563 }], max: 563, duration: 1.4 });
      S.chartBg = reg(abs(root, `left:0;top:${pick(220, 220, 450)}px;width:${W}px;height:${pick(760, 760, 900)}px;background:var(--bg)`), { o: 0 });
      root.appendChild(S.chartBg); root.appendChild(S.chartBox);
    },
    run(t, b, S) {
      titleIn(t, S.T, 'sc4');
      const out = ease.inOut(clamp((t - (bt('s4b.w2') - 0.35)) / 0.3));   // the objects step aside for the extras: a visible path down, fading only at the end
      const skin = SKIN_AT.reduce((k, m, i) => (m && C.frameTime >= bt(m) - 0.05 ? i : k), 0);
      S.objs.forEach(({ g, v }, i) => {
        const p = spHit(t, B('sc4', 0.05 + 0.08 * i), 'default');
        put(g, { o: show(p) * (1 - clamp((out - 0.65) / 0.35)), s: (0.8 + 0.2 * p) * (1 - 0.3 * out), y: 40 * (1 - p) + 90 * out });   // they sink and shrink away from the title
        v.forEach((o, k) => put(o.root, { o: k === skin ? 1 : 0 }));
        const st = { work: t * 0.8, flow: t * 0.7, level: 0.55 + 0.5 * clamp((t - bt('s4a.w2')) / 1.6), ring: (t * 1.4) % 1,
          day: 4 + Math.floor(clamp((t - bt('s4a.w2')) / 2.4) * 4) * 7, marks: 0, open: clamp((t - bt('s4a.w4')) / 0.4), tilt: 0.6 * Math.sin(t * 1.6) };
        v[skin].draw(st);
      });
      S.chips.forEach((c, i) => {
        const p = spHit(t, B('s4a.w4', C.stagger(i)), 'snappy');
        put(c, { o: show(p) * (1 - out), y: 20 * (1 - p) + 60 * out,
          css: { background: i === skin ? 'var(--accent)' : 'var(--card)', color: i === skin ? '#fff' : 'var(--ink)' } });
      });
      const ph = S.wave(t);
      S.extras.forEach(({ e }, i) => put(e.root, { o: show(ph[i]), s: 0.4 + 0.6 * ease.out(ph[i]), y: 6 * Math.sin(t * 1.2 + i) }));
      S.icons.forEach((e, i) => appear(t, e, B('s4b.w5', C.stagger(i)), { s0: 0.6 }));
      const c = sp(t, B('s4b.w6', -0.25), 'default');                // the chart card covers the grid, bars grow on "charts"
      put(S.chartBg, { o: show(c), y: pick(760, 760, 900) * (1 - c) });
      put(S.chartBox, { o: show(c), y: pick(760, 760, 900) * (1 - c) });
      S.chart.draw(t, [[0, 0], ['s4b.w6', 1]]);
    },
  });

  // ------------------------------------------------------------------ 5. A presenter, mouth timed from every word
  const TILE = WIDE ? { x: 1150, y: 330, w: 200, h: 200, dx: 224, dy: 228, cols: 3 } : { x: 90, y: 500, w: 262, h: 200, dx: 290, dy: 222, cols: 3 };
  const MOUTH = [['x', 'M B P'], ['b', 'T K S'], ['c', 'EE'], ['d', 'AH'], ['e', 'OH'], ['f', 'OO']];
  scene({
    name: 'presenter', from: 'sc5', to: 'sc6', pre: 0.5,
    build(root, S) {
      S.bg = reg(bg(root, 'var(--accent)'));
      S.T = (WIDE ? ['A presenter,', 'if you want one.'] : ['A presenter,', 'if you want one.']).map((r, i) =>
        line(root, r, { x: WIDE ? TILE.x : TITLE.x, y: TITLE.y + i * TITLE.lh, size: TITLE.size, color: '#fff' }));
      const P = PACK ? PUPPET.check(PACK) : null;
      S.tiles = MOUTH.map(([shape, label], i) => {
        const x = TILE.x + (i % TILE.cols) * TILE.dx, y = TILE.y + Math.floor(i / TILE.cols) * TILE.dy;
        const card = reg(abs(root, `left:${x}px;top:${y}px;width:${TILE.w}px;height:${TILE.h}px;border-radius:24px;background:#fff;overflow:hidden`));
        if (P?.mouths?.[shape]) el('img', { src: P.base + P.mouths[shape].src, alt: '', style: `position:absolute;left:${(TILE.w - 162) / 2}px;top:22px;width:162px;height:120px` }, card);
        else abs(card, `left:${(TILE.w - 120) / 2}px;top:40px;font:650 80px/1 Display;color:var(--ink);text-align:center;width:120px`, shape);
        abs(card, `left:0;top:${TILE.h - 54}px;width:${TILE.w}px;text-align:center;font:600 32px/1 UI;color:var(--ink)`, label);
        return { card, shape };
      });
    },
    run(t, b, S) {
      const w = sp(t, B('sc5', -0.3), 'default');                    // the blue wipes in from the right, under the presenter
      put(S.bg, { clip: C.inset(0, 0, 0, 100 * (1 - w)) });
      S.T.forEach((L, i) => rise(t, L, B('sc5', 0.1 + 0.12 * i), null, { stagger: 0.05 }));
      const lip = LIPSYNC.at(C.frameTime);
      S.tiles.forEach(({ card, shape }, i) => {
        const p = spHit(t, B('s5a.w6', -0.35 + C.stagger(i)), 'snappy');
        const on = lip.speaking && lip.shape === shape && t >= bt('s5a.w6') - 0.35 ? 1 : 0;
        put(card, { o: show(p), s: (0.85 + 0.15 * p) * (1 + 0.08 * on), y: 24 * (1 - p) - 10 * on,
          css: { boxShadow: on ? '0 0 0 8px #121316' : 'none' } });
      });
    },
  });

  // ------------------------------------------------------------------ 6. The critic gates it
  scene({
    name: 'critic', from: 'sc6', to: 'sc7', pre: 0.5,
    build(root, S) {
      S.bg = reg(bg(root));
      S.T = title(root, WIDE ? ['Ships when every score ≥ 8'] : ['Ships when every', 'score ≥ 8'], WIDE ? { 0: [4] } : { 1: [2] });
      S.boardBox = at0(root, Z.x, pick(230, 230, 470));
      S.board = BLOCKS.mount(S.boardBox, 'kanban-flow', { id: 'critic-board', label: '', x: 0, y: 0, w: pick(660, 660, 520),
        columns: ['critic', 'shipped'], cards: [
          { id: 'script', title: 'script', column: 0, to: 1, at: B('s6a.w12', -0.45) },
          { id: 'voice', title: 'voice', column: 0, to: 1, at: B('s6a.w12', -0.3) },
          { id: 'film', title: 'film', column: 0, to: 1, at: B('s6a.w12', -0.15) }], duration: 0.4 });   // all three land before the stamp
      S.scoreBox = at0(root, pick(1500, 1500, 640), pick(250, 250, 470));
      S.score = BLOCKS.mount(S.scoreBox, 'rolling-number', { id: 'score', label: 'lowest score', x: 0, y: 0, w: pick(300, 300, 310),
        from: 6, to: 8, at: 's6a.w12', fontSize: pick(150, 150, 130), mode: 'drum' });
      const SW = S.SW = pick(560, 560, 400);                                  // the stamp's art is ~0.71 of its box: ~400 / ~310 px on screen
      S.stampBox = at0(root, pick(1280, 1280, 390) - SW / 2, pick(880, 880, 745) - SW * 0.375);   // on the shipped column's axis, clear of the card labels
      S.stamp = ILLUSTRATIONS.object(S.stampBox, 'stamp', { x: 0, y: 0, w: SW, text: 'SHIP' });
    },
    run(t, b, S) {
      const w = sp(t, B('sc6', -0.3), 'default');
      put(S.bg, { clip: C.inset(0, 0, 0, 100 * (1 - w)) });
      titleIn(t, S.T, B('sc6', 0.1));
      appear(t, S.boardBox, B('s6a.w2', -0.2), { s0: 0.94, dy: 40, preset: 'default' });
      S.board.draw(t);
      appear(t, S.scoreBox, 's6a.w7', { s0: 0.9 });
      S.score.draw(t, [[0, 6], ['s6a.w7', 7], [B('s6a.w12', -0.6), 8]]);
      const p = spHit(t, 's6a.end', 'hero');                          // hero: the stamp lands right after "eight"
      put(S.stampBox, { o: show(sp(t, B('s6a.end', -0.15), 'snappy')) });   // the stamp's own press lands it in place, centred
      S.stamp.draw({ press: p });
    },
  });

  // ------------------------------------------------------------------ 7. Echo
  const MARK = (px) => `<svg width="${px}" height="${px}" viewBox="0 0 64 64"><rect x="2" y="10" width="60" height="44" rx="11" fill="var(--accent)"/>` +
    [[16, 14], [24, 24], [32, 32], [40, 20], [48, 10]].map(([x, h]) => `<rect x="${x - 2.5}" y="${32 - h / 2}" width="5" height="${h}" rx="2.5" fill="#fff"/>`).join('') + '</svg>';
  scene({
    name: 'end', from: 'sc7', to: 'done', pre: 0.5,
    build(root, S) {
      S.bg = reg(bg(root));
      S.lock = reg(abs(root, `left:${Z.x}px;top:${pick(150, 150, 330)}px;width:900px`,
        `<div style="display:flex;align-items:center;gap:18px">${MARK(68)}<span style="font:650 60px/1 Display;letter-spacing:-0.04em;color:var(--ink)">motion-film</span></div>`));
      S.T = (WIDE ? ['Your next report', 'is a film.'] : ['Your next', 'report is', 'a film.']).map((r, i, a) =>
        line(root, r, { x: Z.x, y: pick(290, 290, 470) + i * pick(116, 116, 116), size: pick(104, 104, 104), accent: i === a.length - 1 ? [a[i].split(' ').length - 1] : [] }));
      const y = pick(560, 560, 840);
      S.url = reg(abs(root, `left:${Z.x}px;top:${y}px;font:600 ${pick(46, 46, 54)}px/1.25 ui-monospace,Menlo,monospace;color:var(--ink);white-space:pre`, WIDE ? 'github.com/tonyprots/motion-film-skill' : 'github.com/tonyprots/\nmotion-film-skill'));
      S.chips = ['Claude Code', 'Codex', 'any agent'].map((s, i) => reg(el('div', { class: 'chip', style: `left:${Z.x + [0, 270, 450][i] * pick(1, 1, 1.05)}px;top:${y + pick(100, 100, 170)}px` }, root, s)));
    },
    run(t, b, S) {
      const w = sp(t, B('sc7', -0.3), 'default');
      put(S.bg, { clip: C.inset(0, 0, 0, 100 * (1 - w)) });
      appear(t, S.lock, B('sc7', 0), { s0: 0.9 });
      S.T.forEach((L, i) => rise(t, L, B('sc7', 0.05 + 0.12 * i), null, { stagger: 0.05 }));
      appear(t, S.url, B('s7a.end', 0.1));
      S.chips.forEach((c, i) => appear(t, c, B('s7a.end', 0.3 + C.stagger(i) * 2)));
    },
  });

  // ------------------------------------------------------------------ the presenter: one layer over every scene
  const PACK = PUPPET.packs[0] || null;
  const HOST = WIDE ? { x: 0, y: 230, w: 900 } : { x: 0, y: 1300, w: 650 };
  const BIG = WIDE ? { x: 110, y: 70, s: 1.2 } : { x: 80, y: 1300, s: 1.1 };
  const PLAN = [[0, 'worry', 'worried'], ['s1a.w6', 'shrug', 'worried'], ['s2a.w3', 'point', 'neutral'], ['s2a.w8', 'explain', 'happy'],
    ['s3a.w2', 'explain', 'neutral'], ['s3a.w7', 'point', 'happy'], ['s4a.w1', 'welcome', 'happy'], ['s4b.w4', 'point', 'surprised'], ['s4b.w6', 'explain', 'neutral'],
    ['s5a.w3', 'welcome', 'happy'], ['s5a.w6', 'point', 'neutral'], ['s6a.w2', 'think', 'skeptic'], ['s6a.w10', 'cheer', 'happy'],
    ['s7a.w1', 'wave', 'happy'], ['s7a.end', 'rest', 'wink']];
  scene({
    name: 'host', from: 0, to: 'done',
    build(root, S) {
      root.style.zIndex = 50;
      S.p = PACK ? PUPPET.mount(root, { id: 'host', pack: PACK, x: HOST.x, y: HOST.y, w: HOST.w, outline: false })
        : ACTOR.mount(root, { id: 'host', x: HOST.x + HOST.w * 0.2, y: HOST.y + HOST.w * 0.1, w: HOST.w * 0.6, character: 'casual' });
      S.steps = PLAN.map(([m, pose, expression]) => ({ at: typeof m === 'number' ? m : bt(m), pose, expression }));
    },
    run(t, b, S) {
      let i = 0; while (i + 1 < S.steps.length && S.steps[i + 1].at <= t) i++;
      const cur = S.steps[i], prev = S.steps[Math.max(0, i - 1)], lip = LIPSYNC.at(t);
      const blue = t >= bt('sc5') - 0.1 && t < bt('sc6');
      S.p.draw(t, { pose: cur.pose, previous: prev.pose, at: cur.at, expression: cur.expression, previousExpression: prev.expression,
        viseme: lip.shape, mouth: lip.open, ...(PACK ? { outline: blue } : {}) });
      const k = sp(t, B('sc5', -0.2), 'default') - sp(t, B('sc6', -0.2), 'default');   // steps forward for his own chapter
      put(S.p.root, { x: lerp(HOST.x, BIG.x, k), y: lerp(HOST.y, BIG.y, k), s: lerp(1, BIG.s, k) });
    },
  });

  CAPTIONS.scene(WIDE ? { x: Z.x, w: 1040, size: 48, color: 'var(--cap)' } : { x: 90, y: 1200, w: 840, size: 44, color: 'var(--cap)' });
  C.hooks.before.push((t) => {                                       // captions turn white on the blue chapter
    const blue = t >= bt('sc5') - 0.1 && t < bt('sc6') - 0.1;
    const st = document.getElementById('stage');
    st.style.setProperty('--cap', blue ? '#ffffff' : '#121316');
    const wipe = ['sc5', 'sc6', 'sc7'].some((m) => t >= bt(m) - 0.4 && t < bt(m))   // a caption leaves before the wipe covers its scene
      || (t >= bt('s6a.end') - 0.15 && t < bt('sc7'));                // and makes room for the SHIP stamp
    st.classList.toggle('nocap', wipe);
  });
  C.start();
})();
