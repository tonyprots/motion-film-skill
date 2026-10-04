// motion-film — demo film about the skill itself, made with the skill (../SCRIPT.md).
// Voice: ElevenLabs takes laid out on the grid by scripts/layout_vo.py: mark <take> = phrase start, <take>.<k> = speech
// chunk k, <take>.end = phrase end. Everything below is timed from those marks.
// Pure function of time: no timers, no Math.random, nothing mutated in run().
(() => {
  const { W, H, pick, put, reg, el, scene, sp, spHit, seg, clamp, lerp, ease, bt, beatOf, mulberry32 } = C;
  const { line, rise, type } = TYPE;
  C.fonts = ['650 100px Display', '400 40px UI', '500 40px UI', '600 40px UI'];

  const m = (k, d = 0) => beatOf(k) + d;
  const B = (t) => C.beatAt(t);
  const show = (p) => (p > 0.001 ? 1 : 0);
  const PAD = pick(140, 90, 90);
  const SW = 820, SH = 660;                                   // the stage: right column (16:9) or under the headline (9:16)
  // 9:16 keeps everything inside the Reels/TikTok safe band: x 64–950, y 269–1536
  const STAGE = { x: pick(790, 130, 64), y: pick(110, 700, 680), s: pick(1.3, 1, 1.08) };
  const HEAD = { y: pick(320, 250, 430), y3: pick(320, 250, 300), size: pick(96, 104, 92), lh: pick(116, 116, 100) };
  const abs = (parent, css, html = '', cls = 'abs') => el('div', { class: cls, style: css }, parent, html);
  const stage = (root) => reg(abs(root, `left:${STAGE.x}px;top:${STAGE.y}px;width:${SW}px;height:${SH}px;transform-origin:0 0`), { s: STAGE.s });
  // the product mark: a frame with a voice inside (bars) — used by the lockup at the start and the end
  const MARK = (px) => `<svg width="${px}" height="${px}" viewBox="0 0 64 64"><rect x="2" y="10" width="60" height="44" rx="11" fill="var(--accent)"/>` +
    [[16, 14], [24, 24], [32, 32], [40, 20], [48, 10]].map(([x, h]) => `<rect x="${x - 2.5}" y="${32 - h / 2}" width="5" height="${h}" rx="2.5" fill="#fff"/>`).join('') + '</svg>';
  const LOCKUP = (root) => abs(root, `left:${PAD}px;top:${pick(130, 90, 286)}px;width:900px`,
    `<div style="display:flex;align-items:center;gap:16px">${MARK(64)}<span style="font:650 58px/1 Display;letter-spacing:-0.04em;color:var(--ink)">motion-film</span></div>` +
    `<div style="margin-top:14px;font:500 34px/1 UI;color:var(--ink)">a skill for Claude Code &amp; Codex</div>`);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function appear(t, e, b, o = {}) {                           // grows and rises, reads ON the beat
    const p = spHit(t, b, o.preset || 'snappy'), s0 = o.s0 ?? 0.86;
    put(e, { o: show(p), s: s0 + (1 - s0) * p, y: (o.dy ?? 26) * (1 - p), x: (o.dx ?? 0) * (1 - p), r: (o.r ?? 0) * (1 - p) });
    return p;
  }
  function cardRise(t, e, b, o = {}) {                         // a card slides up and settles its tilt to zero
    const p = sp(t, (typeof b === 'string' ? beatOf(b) : b) - 0.15, o.preset || 'default');
    put(e, { o: show(p), y: (o.from ?? 560) * (1 - p), r: (o.r ?? -4) * (1 - p), s: 0.94 + 0.06 * p });
    return p;
  }
  function recede(t, e, b) {                                   // covered cards step back instead of fading
    const p = sp(t, typeof b === 'string' ? beatOf(b) : b, 'default');
    put(e, { s: 1 - 0.06 * p, y: -34 * p });
  }
  // headline of stacked lines; '*' marks the accent word(s) of a line by index
  function head(root, rows, accent = {}) {
    const y0 = rows.length > 2 ? HEAD.y3 : HEAD.y;
    return rows.map((r, i) => {
      const L = line(root, r, { x: PAD, y: y0 + i * HEAD.lh, size: HEAD.size, accent: accent[i] || [] });
      reg(L.el);
      return L;
    });
  }
  // camera push onto a point of the stage (stage px): in at `a`, back out at `b` (null = hold)
  function camera(t, st, pushes) {
    let z = 1, px = 0, py = 0;
    for (const [a, b, X, Y, Z] of pushes) {
      const k = sp(t, a, 'default') - (b == null ? 0 : sp(t, b, 'default'));
      // 9:16: grow leftwards from the right edge, small enough to stay out of the platform UI on the right
      if (k > 0.0005) { z += (pick(Z, Z, 1 + Math.min(Z - 1, 0.07)) - 1) * k; px = pick(X, X, SW); py = Y; }
    }
    put(st, { s: STAGE.s * z, x: px * STAGE.s * (1 - z), y: py * STAGE.s * (1 - z) });
  }
  const rows = (t, Ls, ats, out) => Ls.forEach((L, i) => rise(t, L, ats[i], out, { stagger: 0.06 }));
  // stepped headlines: a line turns from grey to ink when the voice reaches it
  function stepped(t, Ls, ats) {
    const b = B(t);
    Ls.forEach((L, i) => put(L.el, { css: { color: 'var(--ink)' } }));
  }

  // ------------------------------------------------------------------ transitions (no blank frames)
  const ORDER = ['hook', 'turn', 'how', 'proof', 'end'];
  const TRANS = { turn: 'match', how: 'wipe', proof: 'up', end: 'wipe' };
  const FROM = { hook: 'sc1', turn: 'sc2', how: 'sc3', proof: 'sc4', end: 'sc5' };
  function frame(t, b, S, k = 0.03) {
    const p = { s: 1 + k * ease.inOut(seg(t, S.from, S.to)) };
    const tin = TRANS[S.name];
    if (tin && tin !== 'match' && b < beatOf(S.from) + 1.5) {
      const w = sp(t, beatOf(S.from) - 1, 'default');
      if (tin === 'wipe' && w < 0.999) p.clip = C.inset(0, 0, 0, 100 * (1 - w));
      if (tin === 'up') p.y = H * (1 - w);
    }
    const nxt = ORDER[ORDER.indexOf(S.name) + 1];
    if (TRANS[nxt] === 'up') p.y = -H * 0.25 * sp(t, beatOf(S.to) - 1, 'default');
    put(S.root, p);
  }
  const sceneDef = (d) => scene({ pre: TRANS[d.name] && TRANS[d.name] !== 'match' ? 1 : 0, post: d.name === 'end' ? 0 : 1, ...d,
    build(root, S) { root.style.background = 'var(--bg)'; d.build(root, S); } });
  // the accent edge that leads every wipe
  scene({
    name: 'edge', from: 0, to: 'done',
    build(root, S) { S.e = reg(abs(root, `width:14px;height:${H}px;background:var(--accent)`), { o: 0 }); },
    run(t, b, S) {
      let x = null;
      for (const n of ORDER) if (TRANS[n] === 'wipe') {
        const f = beatOf(FROM[n]), w = sp(t, f - 1, 'default');
        if (b > f - 1 && w < 0.995) x = W * (1 - w) - 7;
      }
      put(S.e, { o: x == null ? 0 : 1, x: x ?? 0 });
    },
  });

  // ------------------------------------------------------------------ 1. Hook: the report nobody opens
  const VID_H = Math.round(SW * 9 / 16);
  // the film inside the frame: its own first shot, already playing when the dark panel lands (hook → turn)
  function miniFilm(parent) {
    const M = {};
    M.a = line(parent, 'Nobody reads', { x: 56, y: 70, size: 76, color: '#fff' });
    M.b = line(parent, 'the report.', { x: 56, y: 156, size: 76, color: '#fff', accent: [1] });
    M.doc = reg(abs(parent, `left:${SW - 250}px;top:64px;width:200px;height:250px;border-radius:14px;background:#fff;overflow:hidden`), { o: 0 });
    for (let i = 0; i < 9; i++) abs(M.doc, `left:22px;top:${28 + i * 24}px;width:${i % 4 === 3 ? 90 : 156}px;height:9px;border-radius:5px;background:rgba(18,19,22,${i ? 0.14 : 0.5})`);
    abs(parent, `left:40px;top:${VID_H - 40}px;width:${SW - 80}px;height:6px;border-radius:3px;background:rgba(255,255,255,.2)`);
    M.prog = reg(abs(parent, `left:40px;top:${VID_H - 40}px;height:6px;border-radius:3px;background:var(--accent)`), { o: 0 });
    return M;
  }
  function runMini(t, M) {
    rise(t, M.a, 6.3, null, { stagger: 0.05 });
    rise(t, M.b, 6.45, null, { stagger: 0.05 });
    const pd = sp(t, 6.6, 'snappy');
    put(M.doc, { o: show(pd), y: 40 * (1 - pd), r: 6 - 3 * pd });
    const pr = seg(t, 6.3, 'sc3');
    put(M.prog, { o: show(pr), css: { width: (SW - 80) * pr + 'px' } });
  }
  scene({
    name: 'hook', from: 'sc1', to: 'sc2',
    build(root, S) {
      root.style.background = 'var(--bg)';
      LOCKUP(root);
      S.h = head(root, ['Nobody reads', 'the report.'], { 1: [1] });
      S.st = stage(root);
      S.card = abs(S.st, `width:${SW}px;height:${SH}px;overflow:hidden`, '', 'card'); reg(S.card);
      S.doc = reg(abs(S.card, `width:${SW}px;height:${SH}px`));
      abs(S.doc, 'left:56px;top:48px;font:600 44px/1 UI;letter-spacing:-0.02em', 'Q3 Market Review');
      abs(S.doc, 'left:56px;top:108px;font:400 26px/1 UI;color:var(--ink-2)', '48 pages · PDF · shared 21 days ago');
      abs(S.doc, `left:56px;top:158px;width:${SW - 112}px;height:2px;background:color-mix(in srgb, var(--ink) 10%, transparent)`);
      S.body = reg(abs(S.doc, `left:56px;top:190px;width:${SW - 112}px;height:2400px`));
      const r = mulberry32(3);
      let y = 0;
      for (let blk = 0; blk < 9; blk++) {
        if (blk % 3 === 2) {                                   // a chart block between paragraphs
          const ch = abs(S.body, `left:0;top:${y}px;width:${SW - 112}px;height:200px;border-radius:16px;background:color-mix(in srgb, var(--ink) 4%, var(--card))`);
          for (let i = 0; i < 12; i++) abs(ch, `left:${32 + i * 56}px;top:${170 - (40 + r() * 110)}px;width:34px;height:${40 + r() * 110}px;border-radius:6px;background:color-mix(in srgb, var(--ink) ${14 + (i % 4) * 4}%, transparent)`);
          y += 236;
        } else {
          const n = 5 + Math.floor(r() * 3);
          for (let i = 0; i < n; i++) {
            abs(S.body, `left:0;top:${y}px;width:${i === n - 1 ? 260 + r() * 240 : SW - 112 - r() * 60}px;height:16px;border-radius:8px;background:color-mix(in srgb, var(--ink) 11%, transparent)`);
            y += 34;
          }
          y += 30;
        }
      }
      S.views = reg(abs(S.card, `left:auto;right:36px;top:${SH - 112}px;display:flex;align-items:center;gap:14px`,
        `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>0 views`, 'chip'), { o: 0 });
      S.views.style.color = 'var(--ink)';
      S.dark = reg(abs(S.card, `width:${SW}px;height:${SH}px;background:var(--ink)`), { o: 0 });
      S.mini = miniFilm(S.dark);
    },
    run(t, b, S) {
      put(S.root, { s: 1 + 0.03 * ease.inOut(seg(t, 'sc1', 'sc2')) });
      rows(t, S.h, [-1.0, -0.85], 7.8);                        // frame 0 already reads
      const pw = sp(t, -0.8, 'default');
      put(S.st, { y: 60 * (1 - pw), r: -2 * (1 - pw), s: STAGE.s });
      put(S.body, { y: -1100 * ease.inOut(seg(t, 0, 7)) });   // the report scrolls past, unread
      const pv = appear(t, S.views, 's1a', { dy: 30, s0: 0.8 });
      const pulse = Math.exp(-Math.max(0, t - bt('s1a.end')) * 6) * (B(t) > m('s1a.end') ? 1 : 0);
      // morph: the page becomes a dark 16:9 video frame (continues as the frame of scene 2)
      const mo = sp(t, 6.4, 'default');
      put(S.card, { css: { height: lerp(SH, VID_H, mo) + 'px' } });
      const ir = sp(t, 6.1, 'default');                       // a dark panel rises over the page: no opacity ramp
      put(S.dark, { o: show(ir), css: { clipPath: `inset(${(100 * (1 - ir)).toFixed(2)}% 0 0 0)` } });
      put(S.doc, { y: -120 * mo });
      runMini(t, S.mini);
      if (pv > 0.001) put(S.views, { o: mo < 0.2 ? 1 : 0, s: (0.8 + 0.2 * pv) * (1 + 0.08 * pulse), y: 30 * (1 - pv) + 60 * mo });
    },
  });

  // ------------------------------------------------------------------ 2. Turn: make it a film, in code, by your agent
  const CODE = [
    `scene({ name: 'hook', from: 'sc1', to: 'sc2',`,
    `  run(t, b, S) {`,
    `    rows(t, S.h, [-0.4, -0.25], 7.6);`,
    `    appear(t, S.views, 's1a');`,
    `  },`,
    `});`,
  ];
  const hl = (s) => esc(s).replace(/('[^']*')/g, '<span style="color:#8a96ff">$1</span>').replace(/\b(scene|run|rows|appear)\b/g, '<span style="color:#fff;font-weight:600">$1</span>');
  scene({
    name: 'turn', from: 'sc2', to: 'sc3', post: 1,
    build(root, S) {
      root.style.background = 'var(--bg)';
      LOCKUP(root);
      S.h = head(root, ['Make it', 'a film.'], { 1: [1] });
      S.st = stage(root);
      S.vf = abs(S.st, `width:${SW}px;height:${VID_H}px;overflow:hidden;background:var(--ink)`, '', 'card');
      S.mini = miniFilm(S.vf);
      S.field = reg(abs(S.st, `left:0;top:${VID_H + 40}px;width:${SW}px;height:112px;border-radius:56px`, '', 'card'), { o: 0 });
      S.text = reg(abs(S.field, 'left:48px;top:34px;font:500 42px/1 ui-monospace, Menlo, monospace;white-space:nowrap', ''));
      S.caret = reg(abs(S.field, 'top:28px;width:4px;height:56px;background:var(--accent)'), { o: 0 });
      S.send = reg(abs(S.field, `left:${SW - 96}px;top:16px;width:80px;height:80px;border-radius:40px;background:var(--accent);transform-origin:50% 50%`,
        '<svg width="80" height="80" viewBox="0 0 80 80"><path d="M40 54V27M28 38l12-12 12 12" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'), { o: 0 });
      S.code = reg(abs(S.st, `left:0;top:262px;width:${SW}px;height:398px;overflow:hidden;background:#1b1d24`, '', 'card'), { o: 0 });
      abs(S.code, 'left:36px;top:30px;font:500 24px/1 UI;color:rgba(255,255,255,.55)', 'film/film.js');
      S.agent = reg(abs(S.code, 'left:auto;right:28px;top:20px;padding:12px 20px;font:600 24px/1 UI;color:#fff;background:var(--accent);box-shadow:none', 'agent · writing', 'chip'), { o: 0 });
      S.lines = CODE.map((c, i) => {
        const clip = abs(S.code, `left:36px;top:${88 + i * 48}px;height:44px;overflow:hidden;white-space:pre;font-size:26px;line-height:44px;color:rgba(255,255,255,.82)`, hl(c), 'abs mono');
        return { clip: reg(clip, { o: 0 }), n: c.length };
      });
    },
    run(t, b, S) {
      frame(t, b, S);
      rows(t, S.h, [7.95, 8.1]);
      const pf = spHit(t, 8.3, 'snappy');
      put(S.field, { o: show(pf), y: 30 * (1 - pf) });
      const n = type(t, S.text, '/motion-film report.pdf', 8.6, 9.9, S.caret, 10.2);
      put(S.caret, { x: 50 + n * 23.4 });
      const ps = spHit(t, 10, 'snappy');
      put(S.send, { o: show(ps), s: 0.6 + 0.4 * ps - 0.12 * Math.exp(-Math.max(0, t - bt(10.2)) * 10) * (B(t) > 10.2 ? 1 : 0) });
      runMini(t, S.mini);   // the film keeps playing across the cut
      // the code behind it, written by the agent
      cardRise(t, S.code, 's2a.3', { from: 520, r: 3 });
      S.lines.forEach((L, i) => {
        const a = m('s2a.3', 0.2 + i * 0.36), k = clamp((B(t) - a) / 0.34);
        put(L.clip, { o: show(k), css: { width: Math.ceil(L.n * k) * 15.7 + 'px' } });
      });
      appear(t, S.agent, 's2a.4', { dy: 0, s0: 0.7 });
    },
  });

  // ------------------------------------------------------------------ 3. How: script → voice → beat
  const SCRIPT = [
    ['## 1. Hook · 0:00–0:05', 'var(--ink)', 600],
    ['**Title:** Nobody reads the report.', 'var(--ink-2)', 400],
    ['**Voice:** "Nobody reads the report."', 'var(--ink)', 500],
    ['  {pre=0.6 mood=concern pace=slow}', 'var(--accent)', 400],
    ['', '', 400],
    ['## 2. Turn · 0:05–0:12', 'var(--ink)', 600],
    ['**Voice:** "So make it a film."', 'var(--ink)', 500],
    ['  {mood=confident air=0.8}', 'var(--accent)', 400],
  ];
  const DROPS = [['headline', 's1a'], ['frame', 's2a'], ['script', 's3a'], ['scores', 's4a'], ['end card', 's5a']];
  sceneDef({
    name: 'how', from: 'sc3', to: 'sc4',
    build(root, S) {
      S.h = head(root, ['Script.', 'Voice.', 'Beat.'], { 2: [0] });
      S.st = stage(root);
      S.sc = reg(abs(S.st, `width:${SW}px;height:${SH}px;overflow:hidden`, '', 'card'), { o: 0 });
      abs(S.sc, 'left:48px;top:44px', 'SCRIPT.md', 'abs eyebrow');
      S.mark = reg(abs(S.sc, `left:32px;top:${100 + 2 * 58 - 8}px;width:${SW - 64}px;height:56px;border-radius:12px;background:color-mix(in srgb, var(--accent) 10%, transparent)`), { o: 0 });
      S.srows = SCRIPT.map(([s, c, w], i) => reg(abs(S.sc, `left:48px;top:${100 + i * 58}px;font-size:28px;line-height:40px;font-weight:${w};color:${c};white-space:pre`, esc(s), 'abs mono'), { o: 0 }));
      // the real voice of this film on the beat grid
      S.wv = reg(abs(S.st, `width:${SW}px;height:${SH}px;overflow:hidden`, '', 'card'), { o: 0 });
      abs(S.wv, 'left:48px;top:44px', 'audio/vo.wav · 120 BPM · 70 beats', 'abs eyebrow');
      const GX = 48, GW = SW - 96, WY = 330, NB = 140, NBEAT = beatOf('done');
      S.GX = GX; S.GW = GW; S.NBEAT = NBEAT;
      const pk = window.PEAKS || [];
      S.bars = Array.from({ length: NB }, (_, i) => {
        let v = 0; for (let j = 0; j < 3; j++) v = Math.max(v, pk[i * 3 + j] || 0);
        const hgt = 6 + 150 * v;
        return reg(abs(S.wv, `left:${GX + i * GW / NB}px;top:${WY - hgt / 2}px;width:${GW / NB - 1.6}px;height:${hgt}px;border-radius:3px;background:var(--ink);transform-origin:50% 50%`), { o: 0, sy: 0 });
      });
      S.ticks = Array.from({ length: NBEAT + 1 }, (_, i) =>
        reg(abs(S.wv, `left:${GX + i * GW / NBEAT}px;top:${WY + 110}px;width:2px;height:${i % 4 === 0 ? 30 : 14}px;background:color-mix(in srgb, var(--ink) ${i % 4 === 0 ? 45 : 22}%, transparent)`), { o: 0 }));
      S.flags = ['sc1', 'sc2', 'sc3', 'sc4', 'sc5'].map((k) => {
        const f = abs(S.wv, `left:${GX + beatOf(k) * GW / NBEAT}px;top:${WY + 150}px;font:600 22px/1 UI;color:var(--ink-2);white-space:nowrap`, `▲ ${k}`);
        return reg(f, { o: 0 });
      });
      S.drops = DROPS.map(([txt, k], i) => {
        const x = GX + beatOf(k) * GW / NBEAT, lv = (i % 2) * 64;
        const c = abs(S.wv, `left:${x}px;top:${WY - 200 - lv}px;padding:12px 18px;border-radius:14px;background:var(--accent);color:#fff;font:600 24px/1 UI;white-space:nowrap;transform:translateX(-50%)`, txt);
        const pin = abs(S.wv, `left:${x - 1}px;top:${WY - 152 - lv}px;width:2px;height:${152 + 110 + lv}px;background:var(--accent)`);
        return { c: reg(c, { o: 0 }), pin: reg(pin, { o: 0, sy: 0 }), x };
      });
      S.head = reg(abs(S.wv, `left:${GX}px;top:${WY - 170}px;width:3px;height:310px;background:var(--ink)`), { o: 0 });
    },
    run(t, b, S) {
      frame(t, b, S);
      camera(t, S.st, [[m('s3a', 0.7), m('s3a.2', -0.7), 300, 216, 1.3], [m('s3b', 0.3), m('s3b.end', -0.6), 730, 200, 1.18]]);
      rows(t, S.h, [18.9, 19.0, 19.1]);
      stepped(t, S.h, [m('s3a'), m('s3a.2'), m('s3b')]);
      // script
      cardRise(t, S.sc, 19.0, { from: 400 });
      S.srows.forEach((r, i) => appear(t, r, 19.2 + i * 0.16, { dy: 18, s0: 1 }));
      const pm = sp(t, m('s3a', 0.8), 'snappy');
      put(S.mark, { o: show(pm), css: { width: (SW - 64) * pm + 'px' } });
      recede(t, S.sc, m('s3a.2', -0.4));
      // voice → waveform, drawn as the voice says "rhythm"
      cardRise(t, S.wv, m('s3a.2', -0.5), { from: 600, r: 3 });
      const w0 = m('s3a.2', -0.35), w1 = m('s3a.end');
      S.bars.forEach((e, i) => { const p = sp(t, lerp(w0, w1, i / S.bars.length), 'snappy'); put(e, { o: show(p), sy: p }); });
      S.ticks.forEach((e, i) => put(e, { o: B(t) > lerp(w0, w1, i / S.ticks.length) ? 1 : 0 }));
      S.flags.forEach((f, i) => appear(t, f, m('s3a.2', 0.3 + i * 0.45), { dy: 12, s0: 1 }));
      // every frame lands on the beat: elements drop onto the marks they are timed from
      S.drops.forEach((d, i) => {
        const at = m('s3b', 0.4 + i * 0.75), p = spHit(t, at, 'snappy');
        put(d.c, { o: show(p), y: -160 * (1 - p) });
        const pi = sp(t, at, 'snappy');
        put(d.pin, { o: show(pi), sy: pi });
      });
      // then the playhead runs the film: each element pulses as it is reached
      const ph = seg(t, m('s3b.end', 0.2), 39.4), hx = S.GX + S.GW * ph;
      put(S.head, { o: B(t) > m('s3b.end', 0.2) ? 1 : 0, x: S.GW * ph });
      S.drops.forEach((d, i) => {
        if (B(t) < m('s3b.end', 0.2)) return;
        const d2 = (hx - d.x) / 40, k = d2 > 0 ? Math.exp(-d2 * 1.6) : 0;
        const p = spHit(t, m('s3b', 0.4 + i * 0.75), 'snappy');
        put(d.c, { o: show(p), y: -160 * (1 - p), s: 1 + 0.14 * k });
      });
    },
  });

  // ------------------------------------------------------------------ 4. Proof: critic, render, speed
  // the real scores of this film's last critic round (docs/review_log.md)
  const SCORES = [['Hook', 8], ['Readability', 8], ['Motion', 7], ['Variety', 8], ['Brand', 7], ['Sound sync', 8], ['Composition', 8], ['Polish', 8]];
  const LOG = [
    ['$ node scripts/render.mjs --all', 'cmd'],
    ['16x9', 'bar'],
    ['9x16', 'bar'],
    ['wrote renders/16x9.mp4  1980 frames @ 60 fps  208 s', 'out'],
    ['wrote renders/9x16.mp4  1980 frames @ 60 fps  141 s', 'out'],
  ];
  sceneDef({
    name: 'proof', from: 'sc4', to: 'sc5',
    build(root, S) {
      S.h = head(root, ['Scored.', 'Rendered.', '4× faster.'], { 2: [0] });
      S.st = stage(root);
      S.cr = reg(abs(S.st, `width:${SW}px;height:${SH}px;overflow:hidden`, '', 'card'), { o: 0 });
      abs(S.cr, 'left:48px;top:44px', 'critic · review_log.md', 'abs eyebrow');
      S.rows = SCORES.map(([k, v], i) => {
        const y = 130 + i * 62;
        const r = reg(abs(S.cr, `left:48px;top:${y}px;width:${SW - 96}px;height:52px`), { o: 0 });
        abs(r, 'left:0;top:10px;font:500 30px/1 UI;white-space:nowrap', k);
        abs(r, 'left:300px;top:20px;width:340px;height:12px;border-radius:6px;background:color-mix(in srgb, var(--ink) 9%, transparent)');
        const f = reg(abs(r, 'left:300px;top:20px;height:12px;border-radius:6px;background:var(--ink)'));
        const n = reg(abs(r, 'left:676px;top:6px;font:650 40px/1 Display;font-variant-numeric:tabular-nums', ''));
        return { r, f, n, v };
      });
      S.ship = reg(abs(S.cr, `left:${SW - 250}px;top:18px;padding:12px 24px;border:5px solid var(--accent);border-radius:14px;color:var(--accent);font:650 60px/1 Display;letter-spacing:-0.02em;transform-origin:50% 50%;background:var(--card)`, 'SHIP'), { o: 0 });
      // the render, in a terminal
      S.tm = reg(abs(S.st, `width:${SW}px;height:${SH}px;overflow:hidden;background:#1b1d24`, '', 'card'), { o: 0 });
      S.log = LOG.map(([s, kind], i) => {
        const y = 60 + i * 66;
        const e = abs(S.tm, `left:44px;top:${y}px;font-size:${kind === 'out' ? 24 : 28}px;line-height:40px;white-space:pre;color:${kind === 'cmd' ? '#fff' : 'rgba(255,255,255,.72)'}`, kind === 'bar' ? '' : esc(s), 'abs mono');
        if (kind === 'bar') {
          abs(e, 'left:0;top:0', s);
          abs(e, 'left:110px;top:14px;width:430px;height:14px;border-radius:7px;background:rgba(255,255,255,.14)');
          e.fill = reg(abs(e, 'left:110px;top:14px;height:14px;border-radius:7px;background:var(--accent)'));
          abs(e, 'left:568px;top:0;color:rgba(255,255,255,.5)', '4 workers');
        }
        return { e: reg(e, { o: 0 }), kind, s };
      });
      // speed: before / now
      S.sp = reg(abs(S.st, `left:${pick(40, 24, 24)}px;top:${SH - 270}px;width:${SW - pick(40, 24, 24)}px;height:270px`, '', 'card'), { o: 0 });
      abs(S.sp, 'left:40px;top:40px;font:500 26px/1 UI;color:var(--ink-2)', 'before');
      abs(S.sp, 'left:40px;top:118px;font:500 26px/1 UI;color:var(--ink-2)', 'now');
      S.b1 = reg(abs(S.sp, 'left:150px;top:36px;height:34px;border-radius:8px;background:color-mix(in srgb, var(--ink) 18%, transparent)'));
      S.b2 = reg(abs(S.sp, 'left:150px;top:114px;height:34px;border-radius:8px;background:var(--accent)'));
      S.t1 = reg(abs(S.sp, 'left:150px;top:80px;font:500 22px/1 UI;color:var(--ink-2);white-space:nowrap', '≈ 42 min'), { o: 0 });
      S.t2 = reg(abs(S.sp, 'left:150px;top:158px;font:600 22px/1 UI;white-space:nowrap', '9 min 46 s'), { o: 0 });
      S.x = reg(abs(S.sp, `left:auto;right:40px;top:40px;font:650 128px/1 Display;letter-spacing:-0.05em;color:var(--accent)`, '4.3×'), { o: 0 });
      abs(S.sp, 'left:40px;top:208px;font:500 28px/1 UI;color:var(--ink-2);white-space:nowrap', '2:36 film · 60 fps · Apple M1');
      S.same = reg(abs(S.sp, 'left:auto;right:40px;top:196px;padding:12px 20px;font:600 24px/1 UI;color:#fff;background:var(--accent);box-shadow:none', 'same pixels', 'chip'), { o: 0 });
    },
    run(t, b, S) {
      frame(t, b, S);
      camera(t, S.st, [[m('s4a.5', 0.6), null, 400, 470, 1.12]]);
      rows(t, S.h, [38.9, 39.0, 39.1]);
      stepped(t, S.h, [m('s4a'), m('s4a.3'), m('s4a.5')]);
      cardRise(t, S.cr, 39.1, { from: 420 });
      S.rows.forEach((R, i) => {
        const at = m('s4a', -2.6 + i * 0.3), p = spHit(t, at, 'snappy');
        put(R.r, { o: show(p), x: -24 * (1 - p) });
        const f = sp(t, at + 0.1, 'default');
        put(R.f, { css: { width: 340 * R.v / 10 * f + 'px' } });
        put(R.n, { text: String(Math.round(R.v * clamp(f * 1.15))) });
      });
      const ps = spHit(t, m('s4a.2', 0.1), 'snappy');
      put(S.ship, { o: show(ps), s: 1.5 - 0.5 * ps, r: -6 });
      recede(t, S.cr, m('s4a.4', -0.6));
      if (sp(t, m('s4a.4', -0.65), 'default') > 0.98) put(S.cr, { hide: true });
      // render
      cardRise(t, S.tm, m('s4a.4', -0.5), { from: pick(600, 600, 300), r: 3 });
      S.log.forEach((L, i) => {
        if (L.kind === 'cmd') {
          const k = clamp((B(t) - m('s4a.4', -0.9)) / 0.5);
          put(L.e, { o: show(k), css: { width: Math.ceil(L.s.length * k) * 16.9 + 'px', overflow: 'hidden' } });
        } else if (L.kind === 'bar') {
          const a = m('s4a.4', 0.1 + (i - 1) * 0.3);
          put(L.e, { o: B(t) >= a - 0.2 ? 1 : 0 });
          put(L.e.fill, { css: { width: 430 * ease.inOut(seg(t, a, m('s4a.5', -0.2 + (i - 1) * 0.2))) + 'px' } });
        } else {
          appear(t, L.e, m('s4a.5', -0.1 + (i - 3) * 0.3), { dy: 14, s0: 1 });
        }
      });
      // speed
      cardRise(t, S.sp, m('s4a.5', -0.3), { from: pick(360, 360, 200), r: -2 });
      const g1 = sp(t, m('s4a.5', 0.1), 'default'), g2 = sp(t, m('s4a.5', 0.6), 'snappy'), BW = SW - pick(40, 24, 24) - 190 - 200;
      put(S.b1, { css: { width: BW * g1 + 'px' } });
      put(S.b2, { css: { width: BW * (9.77 / 42) * g2 + 'px' } });
      put(S.t1, { o: show(g1) }); put(S.t2, { o: show(g2) });
      appear(t, S.x, m('s4a.5', 0.6), { dy: 30, s0: 0.8, preset: 'snappy' });
      appear(t, S.same, m('s4a.end', 0.9), { dy: 0, s0: 0.7 });   // one worker = the sequential render, byte for byte
    },
  });

  // ------------------------------------------------------------------ 5. Echo: your next report is a film
  sceneDef({
    name: 'end', from: 'sc5', to: 'done',
    build(root, S) {
      S.push = reg(abs(root, `width:${W}px;height:${H}px;transform-origin:${W / 2}px ${H / 2}px`));
      S.h = C.FMT === '9x16'                                   // 9:16: one stack inside the safe band, bigger type
        ? ['Your next', 'report is', 'a film.'].map((r, i) => { const L = line(S.push, r, { x: PAD, y: 300 + i * 124, size: 116, accent: i === 2 ? [1] : [] }); reg(L.el); return L; })
        : ['Your next report', 'is a film.'].map((r, i) => { const L = line(S.push, r, { x: PAD, y: pick(230, 250) + i * pick(156, 116), size: pick(138, 104), accent: i === 1 ? [2] : [] }); reg(L.el); return L; });
      const LX = PAD, LY = pick(620, 600, 720);
      S.logo = reg(abs(S.push, `left:${LX}px;top:${LY}px;display:flex;align-items:center;gap:26px`,
        `${MARK(pick(104, 96, 112))}<span style="font:650 ${pick(96, 84, 100)}px/1 Display;letter-spacing:-0.045em">motion-film</span>`), { o: 0 });
      const CY = LY + pick(18, 140, 160);
      S.chips = ['Claude Code', 'Codex', 'any agent'].map((s, i) => reg(abs(S.push, `left:${pick(860, LX, LX) + [0, pick(270, 250, 270), pick(450, 410, 450)][i]}px;top:${CY}px`, s, 'chip'), { o: 0 }));
      const UY = pick(820, 900, CY + 140);
      S.url = reg(abs(S.push, `left:${PAD}px;top:${UY}px;font-size:${pick(52, 44, 60)}px;line-height:1.15;font-weight:600;color:var(--ink);white-space:nowrap`, C.FMT === '9x16' ? 'github.com/tonyprots/<br>motion-film-skill' : 'github.com/tonyprots/motion-film-skill', 'abs mono'), { o: 0 });
      S.sweep = reg(abs(S.push, `left:${PAD}px;top:${UY + pick(76, 66, 158)}px;height:5px;border-radius:3px;background:var(--accent)`), { o: 0 });
    },
    run(t, b, S) {
      frame(t, b, S, 0);
      put(S.push, { s: 1 + 0.06 * ease.inOut(seg(t, 'sc5', 'done')) });   // never fully static
      rows(t, S.h, [54.9, 55.0, 55.1]);
      appear(t, S.logo, 55.2, { dy: 30, s0: 0.9, preset: 'default' });
      S.chips.forEach((c, i) => appear(t, c, m('sc5', 0.2 + i * 0.3), { dy: 24, s0: 0.8 }));
      appear(t, S.url, m('sc5', 1.3), { dy: 16, s0: 1 });
      const uw = pick(1190, 1010, 760);
      const sw = Motion.indicator(t, [[0, 0, 0], [bt(m('s5a.end', 0.2)), 0, uw], [bt(63.5), uw, uw], [bt(64.5), 0, uw]]);
      put(S.sweep, { o: sw.size > 0.5 ? 1 : 0, x: sw.start, css: { width: sw.size + 'px' } });
    },
  });

  if ((window.CAPS || []).length) CAPTIONS.scene({ y: pick(700, 1080, 1420), size: pick(44, 48, 42), w: pick(560, 900, 886) });
  C.start();
})();
