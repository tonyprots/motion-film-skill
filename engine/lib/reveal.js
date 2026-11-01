// Reveal with an edge: ink, wash or a flood spreads behind a ragged, noisy front instead of fading in. Classic script
// after core.js; pure functions of t.
//
//   const R = REVEAL.field(w, h, o)   once, in build(): a noise field the size of the layer (computed at 1/2 res).
//                                     o: from 'left'|'right'|'top'|'bottom'|'center' or [x, y] in 0…1 (where it starts),
//                                     rough 0…1 (0.35: how far the front wanders from a clean wipe), scale (noise blob size,
//                                     0.18 of the short side), seed.
//   REVEAL.p(t, at, dur)              the front's progress 0…1: fast at first, then slowing (ease-out), from mark/beat `at`.
//   REVEAL.css(R, p, o)               DOM layers: props for C.put() — a CSS mask that shows the part already reached.
//                                     o.band (px, 0) > 0 gives the band just behind the front instead (the wet tide line:
//                                     put it on a darker copy laid over). o.soft (px, 4; never below 1.5 field cells, or the edge steps) softens the edge. The mask image
//                                     is pushed to C.pending, so the renderer waits until it is decoded.
//   REVEAL.draw(ctx, src, R, p, o)    canvas layers: draws `src` (canvas / image) through the front into ctx at o.x, o.y;
//                                     o.tide = a colour paints the wet band (o.band px, 14; o.tideAlpha 0.6) just behind the front.
// The front is a threshold on (direction ramp + noise): equal p, equal pixels — any frame in any order.
(() => {
  const Q = 2;   // field resolution divisor
  function noiseGrid(seed, gw, gh) {
    const rnd = C.mulberry32(seed), g = new Float32Array((gw + 1) * (gh + 1));
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return (x, y) => {   // smooth value noise, x,y in grid cells
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (i, j) => g[Math.min(gh, j) * (gw + 1) + Math.min(gw, i)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  }
  function field(w, h, o = {}) {
    const fw = Math.max(2, Math.ceil(w / Q)), fh = Math.max(2, Math.ceil(h / Q)), rough = o.rough ?? 0.35, seed = o.seed ?? 3;
    const cell = Math.max(2, (o.scale ?? 0.18) * Math.min(fw, fh));
    const oct = [1, 2.3, 5.1].map((k, i) => ({ f: noiseGrid(seed * 31 + i, Math.ceil(fw / cell * k) + 2, Math.ceil(fh / cell * k) + 2), k, a: [0.6, 0.28, 0.12][i] }));
    const from = o.from || 'left';
    const ramp = (u, v) => {
      if (Array.isArray(from) || from === 'center') {
        const [cx, cy] = from === 'center' ? [0.5, 0.5] : from;
        const d = Math.hypot((u - cx) * w / Math.min(w, h), (v - cy) * h / Math.min(w, h));
        const far = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => Math.hypot((a - cx) * w / Math.min(w, h), (b - cy) * h / Math.min(w, h))));
        return d / far;
      }
      return { left: u, right: 1 - u, top: v, bottom: 1 - v }[from];
    };
    const v = new Float32Array(fw * fh);
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      let n = 0; for (const q of oct) n += q.a * q.f(i / cell * q.k, j / cell * q.k);
      v[j * fw + i] = ramp(i / (fw - 1), j / (fh - 1)) * (1 - rough) + n * rough;
    }
    let lo = Infinity, hi = -Infinity; for (const x of v) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    for (let i = 0; i < v.length; i++) v[i] = (v[i] - lo) / (hi - lo || 1);   // 0 = reached first, 1 = last
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
    return { w, h, fw, fh, v, cv, ctx: cv.getContext('2d'), cache: new Map() };
  }
  const p = (t, at, dur = 1.2) => { const u = C.clamp((t - C.bt(at)) / dur); return 1 - Math.pow(1 - u, 1.8); };
  // alpha mask at field res: 1 where reached (or inside the band behind the front)
  function paintMask(R, pr, band, soft) {
    // widths in field units: the field spans ~1 over the layer's long side; the edge needs >= 1.5 cells or it shows steps
    const L = Math.max(R.w, R.h), s = Math.max(soft, 1.5 * Q) / L, b = band / L, img = R.ctx.createImageData(R.fw, R.fh), d = img.data;
    const thr = pr * (1 + 2 * s) - s;   // p 0: nothing, p 1: everything, soft edge included
    for (let i = 0; i < R.v.length; i++) {
      const x = R.v[i];
      let a = C.clamp((thr - x) / (2 * s) + 0.5);
      if (b > 0) a *= C.clamp((x - (thr - b)) / (2 * s) + 0.5);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0; d[i * 4 + 3] = Math.round(a * 255);
    }
    R.ctx.putImageData(img, 0, 0);
    return R.cv;
  }
  function css(R, pr, o = {}) {
    const band = o.band ?? 0, soft = o.soft ?? 4, key = `${Math.round(pr * 400)}|${band}|${soft}`;
    let url = R.cache.get(key);
    if (!url) { url = paintMask(R, Math.round(pr * 400) / 400, band, soft).toDataURL('image/png'); R.cache.set(key, url); }
    const im = new Image(); im.src = url; C.pending.push(im.decode().catch(() => 0));
    const m = `url(${url})`;
    return { css: { maskImage: m, webkitMaskImage: m, maskSize: '100% 100%', webkitMaskSize: '100% 100%', maskRepeat: 'no-repeat', webkitMaskRepeat: 'no-repeat' }, hide: pr <= 0 };
  }
  function draw(ctx, src, R, pr, o = {}) {
    if (pr <= 0) return;
    const x = o.x ?? 0, y = o.y ?? 0;
    const tmp = (R.tmp ||= Object.assign(document.createElement('canvas'), { width: R.w, height: R.h })), tc = tmp.getContext('2d');
    tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, R.w, R.h);
    tc.drawImage(src, 0, 0, R.w, R.h);
    tc.globalCompositeOperation = 'destination-in'; tc.imageSmoothingEnabled = true;
    tc.drawImage(paintMask(R, pr, 0, o.soft ?? 4), 0, 0, R.w, R.h);
    if (o.tide) {
      tc.globalCompositeOperation = 'source-over';
      const band = (R.band ||= Object.assign(document.createElement('canvas'), { width: R.w, height: R.h })), bc = band.getContext('2d');
      bc.globalCompositeOperation = 'source-over'; bc.clearRect(0, 0, R.w, R.h); bc.fillStyle = o.tide; bc.fillRect(0, 0, R.w, R.h);
      bc.globalCompositeOperation = 'destination-in'; bc.drawImage(paintMask(R, pr, o.band ?? 14, o.soft ?? 4), 0, 0, R.w, R.h);
      tc.globalAlpha = o.tideAlpha ?? 0.6; tc.drawImage(band, 0, 0); tc.globalAlpha = 1;
    }
    ctx.drawImage(tmp, x, y);
  }
  window.REVEAL = { field, p, css, draw };
})();
