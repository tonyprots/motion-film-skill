// STARTER FILM — replace these scenes with the approved shotlist. It exists so a fresh scaffold renders end to end
// and to show the house patterns: masked type on beats, hits that read ON the beat, swap handoffs, an indicator,
// a typewriter, a canvas layer, a push-through, per-format layout with C.pick(wide, square, tall).
// Pure function of time: no timers, no Math.random, nothing mutated in run().
(() => {
  const { W, H, pick, put, reg, el, scene, canvas, sp, spHit, trk, seg, clamp, lerp, ease, bt, beatOf, mulberry32 } = C;
  const { line, rise, type } = TYPE;
  C.fonts = ['600 100px Display', '500 40px UI'];
  const PAD = pick(140, 90, 80);                     // left margin: type never centred on an empty background
  const BRAND = C.TL.brand || {};                    // from a preset (init.sh --preset); the real film writes its own copy

  // ---------------------------------------------------------------- hook  (b0 → mid)
  scene({
    name: 'hook', from: 'hook', to: 'mid',
    build(root, S) {
      S.head = el('div', { class: 'abs' }, root); reg(S.head);
      S.words = line(S.head, BRAND.hook || 'Make it move.', { x: PAD, y: pick(380, 380, 640), size: pick(230, 170, 118), accent: [2] });
      S.card = el('div', { class: 'card' }, root);
      Object.assign(S.card.style, { left: PAD + 'px', top: '0px', width: W - 2 * PAD + 'px', height: pick(620, 620, 900) + 'px' });
      reg(S.card, { o: 0 });
      S.rows = [0, 1, 2].map((i) => {
        const r = el('div', { class: 'abs', style: `left:48px;top:${60 + i * 150}px;width:${W - 2 * PAD - 96}px;height:110px;border-radius:18px;background:color-mix(in srgb, var(--ink) 7%, var(--card))` }, S.card);
        return reg(r, { o: 0 });
      });
    },
    run(t, b, S) {
      // word 0 is released before t=0 so frame 0 already shows it (the hook starts on frame 0, never on an empty frame)
      rise(t, S.words, [-0.4, 'hook_w2', 'hook_w3']);
      // the card rises over the headline; the headline recedes (never fades) as it is covered
      const up = sp(t, 'hook_card', 'default');
      put(S.head, { y: -90 * up, s: 1 - 0.06 * up });
      put(S.card, { o: up > 0.001 ? 1 : 0, y: lerp(H + 40, pick(230, 240, 520), up), r: -3 * (1 - up) });
      S.rows.forEach((r, i) => {
        const p = spHit(t, beatOf('hook_card') + 0.5 + i * 0.5, 'snappy');
        put(r, { o: p > 0.001 ? 1 : 0, sx: 0.9 + 0.1 * p, x: 20 * (1 - p) });
      });
    },
  });

  // ---------------------------------------------------------------- mid  (mid → end): indicator, dot grid, typing, push-through
  const LABELS = ['Design.', 'Build.', 'Ship.'];
  const STOPS = ['mid_a', 'mid_b', 'mid_c'];
  scene({
    name: 'mid', from: 'mid', to: 'end',
    build(root, S) {
      root.style.background = 'var(--ink)'; root.style.transformOrigin = '0 0';   // inverted: works for light and dark presets
      S.ctx = canvas(root);
      S.inv = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff';
      const r = mulberry32(7);
      S.dots = [];
      for (let y = 40; y < H; y += 60) for (let x = 40; x < W; x += 60) S.dots.push({ x, y, k: r() });
      S.labels = LABELS.map((s, i) => line(root, s, { x: PAD, y: pick(200, 200, 360) + i * pick(180, 150, 200), size: pick(150, 120, 140), color: 'var(--bg)' }));
      S.bar = el('div', { class: 'abs', style: 'height:12px;background:var(--accent);border-radius:6px' }, root); reg(S.bar, { o: 0 });
      S.field = el('div', { class: 'card', style: `left:${PAD}px;top:${pick(760, 760, 1240)}px;width:${W - 2 * PAD}px;height:120px;border-radius:60px;` }, root);
      reg(S.field, { o: 0 });
      S.text = el('span', { class: 'abs', style: 'left:56px;top:34px;font-size:44px;font-weight:500;color:var(--ink)' }, S.field, '');
      S.caret = el('span', { class: 'abs', style: 'top:30px;width:4px;height:58px;background:var(--accent)' }, S.field);
      reg(S.text); reg(S.caret, { o: 0 });
    },
    run(t, b, S) {
      // canvas: seeded dot grid, a ripple from the left edge on every stop
      const g = S.ctx; g.clearRect(0, 0, W, H); g.globalAlpha = 1;
      for (const d of S.dots) {
        let s = 3;
        for (const st of STOPS) { const w = bt(st) + d.x / 3000; if (t > w) s += 5 * Math.exp(-(t - w) * 9); }
        g.globalAlpha = 0.08 + 0.1 * d.k; g.fillStyle = S.inv; g.fillRect(d.x - s / 2, d.y - s / 2, s, s);
      }
      g.globalAlpha = 1;
      // labels rise one per beat; they stay until the push-through covers them
      S.labels.forEach((L, i) => rise(t, L, beatOf('mid') + i * 0.5));
      // indicator: leading edge on a stiffer spring than the trailing one, so it stretches mid-move
      const ys = S.labels.map((L) => parseFloat(L.el.style.top) + L.size * 1.02);
      const x0 = PAD, xs = S.labels.map((L, i) => [x0, x0 + [560, 520, 400][i] * L.size / 150]);
      const stops = [[0, x0, x0], ...STOPS.map((m, i) => [bt(m) - C.leadFor('snappy'), xs[i][0], xs[i][1]])];
      const ind = Motion.indicator(t, stops);
      const yk = trk(t, [[0, ys[0]], ...STOPS.map((m, i) => [beatOf(m) - 0.06, ys[i], 'snappy'])]);
      put(S.bar, { o: ind.size > 0.5 ? 1 : 0, x: ind.start, y: yk, css: { width: Math.max(0, ind.size) + 'px' } });
      // typing field: pops on b15.5, types 16 → 18 (sfx ticks on the same beats), caret follows the text
      const pf = spHit(t, 15.5, 'snappy');
      put(S.field, { o: pf > 0.001 ? 1 : 0, s: 0.92 + 0.08 * pf });
      const n = type(t, S.text, 'Ship the launch reel by Friday', 16, 18, S.caret, 'end');
      put(S.caret, { x: 60 + n * 22.4 });
      // push-through: from 'build' the camera dives into the field (expo-in), which fills the frame by 'end'
      const k = ease.expoIn(seg(t, 'build', 'end'));
      put(S.root, { s: 1 + 7 * k, x: -PAD * 7 * k, y: -(parseFloat(S.field.style.top) + 60) * 7 * k });
    },
  });

  // ---------------------------------------------------------------- end card  (end → done): lockup, underline, CTA, slow push
  scene({
    name: 'end', from: 'end', to: 'done',
    build(root, S) {
      S.push = el('div', { class: 'abs', style: `width:${W}px;height:${H}px;transform-origin:${PAD}px ${H / 2}px` }, root); reg(S.push);
      const name = BRAND.product || 'Product', fit = Math.min(1, 7 / name.length);   // longer names set smaller, never cropped
      S.logo = line(S.push, name, { x: PAD, y: H / 2 - pick(190, 170, 200) * fit, size: pick(260, 200, 220) * fit });
      S.rule = el('div', { class: 'abs', style: `top:${H / 2 + pick(110, 80, 70)}px;height:14px;background:var(--accent)` }, S.push); reg(S.rule, { o: 0 });
      S.cta = line(S.push, BRAND.cta || 'Try it at example.com', { x: PAD, y: H / 2 + pick(170, 140, 140), size: pick(72, 64, 64), cls: 'ui' });
      S.sweep = el('div', { class: 'abs', style: `top:${H / 2 + pick(262, 222, 222)}px;height:6px;background:var(--accent)` }, S.push); reg(S.sweep, { o: 0 });
    },
    run(t, b, S) {
      put(S.push, { s: 1 + 0.08 * ease.inOut(seg(t, 'end', 'done')) });   // nothing is ever fully static
      rise(t, S.logo, 'end', null, { stagger: 0.05 });
      const u = sp(t, beatOf('end') + 0.5, 'default');
      put(S.rule, { o: u > 0.002 ? 1 : 0, x: PAD + 8, css: { width: (W - 2 * PAD) * 0.5 * u + 'px' } });
      rise(t, S.cta, 'cta', null, { stagger: 0.04, preset: 'snappy' });
      // the hold is re-lit every 2 beats: an underline sweeps through the CTA (enter left, exit right)
      const cw = pick(760, 680, 680), sw = Motion.indicator(t, [[0, PAD, PAD], [bt(28), PAD, PAD + cw], [bt(29), PAD + cw, PAD + cw], [bt(30), PAD, PAD + cw]]);
      put(S.sweep, { o: sw.size > 0.5 ? 1 : 0, x: sw.start, css: { width: sw.size + 'px' } });
    },
  });

  if ((window.CAPS || []).length) CAPTIONS.scene();   // burned-in captions from captions.json (voice films)
  C.start();
})();
