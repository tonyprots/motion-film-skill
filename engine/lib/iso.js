// Isometric objects on a 2D canvas (motion-film). An option for a "one object per phrase" style, not a default look.
// Why canvas and not CSS 3D: transform-style: preserve-3d and perspective put layers on the compositor, and the frame
// stops being a pure function of seek(t) (render.mjs --verify fails). Here every face is a projected polygon: the same
// t always paints the same pixels.
//
// Space: x along the width axis (to the right and a little down), y along the depth axis (to the right and up), z up.
// An origin `o` = { cx, cy, s } places x=y=z=0 on screen at (cx, cy), s scales everything; ISO.centred(sx, sy, w, d, s)
// gives the origin that centres a w×d footprint on the screen point (sx, sy).
// Colours are [r, g, b] arrays, so faces can be shaded and two colours mixed; nothing here knows the film's palette.
//
//   const { centred, box, shadow, stack, building, token, chip, floor } = ISO;
//   S.g = C.canvas(root); S.o = centred(540, 1100, 180, 104, 1.6);           // in build()
//   g.clearRect(0, 0, W, H); shadow(g, S.o, 0, 0, 180, 104);                 // in run(t): repaint everything from t
//   box(g, { ...S.o, x: 0, y: 0, z: 0, w: 180, d: 104, h: 19 * k, col: [118, 206, 132] });
//
// Painter's order is the caller's: draw what is further back (larger y, lower z) first.
(() => {
  const AX = [0.94, 0.17], AY = [0.42, -0.30];   // screen vectors of one unit along x and y; z is straight up
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  // canvas text is invisible to render.mjs --lint (it reads the DOM): every word drawn by these helpers is listed per
  // frame in window.CANVAS_TEXT, so lint catches a caption that repeats it. Text drawn with g.fillText in a scene: ISO.note(text).
  const said = []; window.CANVAS_TEXT = said;
  if (window.C && C.hooks) C.hooks.before.push(() => { said.length = 0; });
  const note = (text) => { if (text != null && String(text).trim()) said.push(String(text)); };
  const P = (o, x, y, z) => { const k = o.s ?? 1; return [o.cx + (x * AX[0] + y * AY[0]) * k, o.cy + (x * AX[1] + y * AY[1] - z) * k]; };
  const centred = (sx, sy, w, d, s = 1) => ({ s, cx: sx - ((w / 2) * AX[0] + (d / 2) * AY[0]) * s, cy: sy - ((w / 2) * AX[1] + (d / 2) * AY[1]) * s });

  function poly(g, pts, fill) {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill();
  }
  // a box: front face lit, right face in shade, top lighter; a thin light edge on the top's near rim gives the thickness.
  // b = { cx, cy, s, x, y, z, w, d, h, col, alpha, edge }   edge: rim colour (default white at 30 %), false for none
  function box(g, b) {
    const { x, y, z, w, d, h } = b, c = b.col, q = (X, Y, Z) => P(b, X, Y, Z);
    if (h <= 0.5) return;
    const top = [q(x, y, z + h), q(x + w, y, z + h), q(x + w, y + d, z + h), q(x, y + d, z + h)];
    const front = [q(x, y, z), q(x + w, y, z), q(x + w, y, z + h), q(x, y, z + h)];
    const right = [q(x + w, y, z), q(x + w, y + d, z), q(x + w, y + d, z + h), q(x + w, y, z + h)];
    g.save(); g.globalAlpha *= b.alpha ?? 1;
    let gr = g.createLinearGradient(...q(x, y, z + h), ...q(x, y, z));
    gr.addColorStop(0, rgb(mix(c, WHITE, 0.06))); gr.addColorStop(1, rgb(mix(c, BLACK, 0.22)));
    poly(g, front, gr);
    gr = g.createLinearGradient(...q(x + w, y, z + h), ...q(x + w, y + d, z));
    gr.addColorStop(0, rgb(mix(c, BLACK, 0.38))); gr.addColorStop(1, rgb(mix(c, BLACK, 0.55)));
    poly(g, right, gr);
    gr = g.createLinearGradient(...q(x, y + d, z + h), ...q(x + w, y, z + h));
    gr.addColorStop(0, rgb(mix(c, WHITE, 0.16))); gr.addColorStop(1, rgb(mix(c, WHITE, 0.34)));
    poly(g, top, gr);
    if (b.edge !== false) {
      g.strokeStyle = b.edge || 'rgba(255,255,255,0.30)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(...top[3]); g.lineTo(...top[0]); g.lineTo(...top[1]); g.lineTo(...top[2]); g.stroke();
    }
    g.restore();
  }
  // a soft contact shadow under a w×d footprint at (x, y), slightly longer to the right-front (light from the left-back)
  function shadow(g, o, x, y, w, d, a = 0.6, blur = 22) {
    g.save(); g.filter = `blur(${blur}px)`;
    poly(g, [P(o, x - 8, y - 4, 0), P(o, x + w + 18, y - 4, 0), P(o, x + w + 26, y + d + 14, 0), P(o, x - 4, y + d + 10, 0)], `rgba(0,0,0,${a})`);
    g.restore();
  }
  // draw in the plane of a box's front face: local x along the width, local y DOWN (= −z), origin at (X, Y, Z).
  // Call g.setTransform(1, 0, 0, 1, 0, 0) when done.
  const onFront = (g, o, X, Y, Z) => { const [ex, ey] = P(o, X, Y, Z), k = o.s ?? 1; g.setTransform(AX[0] * k, AX[1] * k, 0, k, ex, ey); };

  // a flat slab with a paper band across it (a bundle of notes, a ream, a ticket): { x, y, z, w = 180, d = 104, h = 19, col, band, alpha }
  function stack(g, o, f) {
    const { x = 0, y = 0, z = 0, w = 180, d = 104, h = 19, a = f.alpha ?? 1 } = f;
    box(g, { ...o, x, y, z, w, d, h, col: f.col, alpha: a });
    if (f.band === false) return;
    g.save(); g.globalAlpha *= a;
    const band = f.band || [246, 240, 224], bx = x + w * 0.44, bw = w * 0.12;
    poly(g, [P(o, bx, y, z + h), P(o, bx + bw, y, z + h), P(o, bx + bw, y + d, z + h), P(o, bx, y + d, z + h)], rgb(band, 0.96));
    poly(g, [P(o, bx, y, z), P(o, bx + bw, y, z), P(o, bx + bw, y, z + h), P(o, bx, y, z + h)], rgb(mix(band, BLACK, 0.13), 0.96));
    g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 1;
    for (const k of [0.34, 0.67]) {
      g.beginPath(); g.moveTo(...P(o, x, y, z + h * k)); g.lineTo(...P(o, bx, y, z + h * k));
      g.moveTo(...P(o, bx + bw, y, z + h * k)); g.lineTo(...P(o, x + w, y, z + h * k)); g.stroke();
    }
    g.restore();
  }
  // a building on a plinth: { col, grow 0..1 (height), alpha, win: [r,g,b] lit windows, rows = 2, cols = 4,
  //   chimneys: true | false, smoke: true | false, label, plate, plateInk, font = 'UI', plinth: [r,g,b] }
  // t drives the smoke (a 2.4 s loop) — pass the scene's t, never a counter.
  function building(g, o, f, t) {
    const w = f.w ?? 250, d = f.d ?? 150, k = f.grow ?? 1, h = (f.h ?? 118) * k, A = f.alpha ?? 1;
    if (k <= 0.01 || A <= 0.01) return;
    const chim = f.chimneys !== false;
    g.save(); g.globalAlpha *= A;
    shadow(g, o, -10, -10, w + 20, d + 20, 0.65);
    box(g, { ...o, x: -18, y: -18, z: 0, w: w + 36, d: d + 36, h: 10, col: f.plinth || mix(f.col, BLACK, 0.75) });
    if (chim) {
      box(g, { ...o, x: 34, y: d - 52, z: 10, w: 38, d: 38, h: h + 84 * k, col: f.col });
      box(g, { ...o, x: 86, y: d - 52, z: 10, w: 38, d: 38, h: h + 58 * k, col: f.col });
    }
    box(g, { ...o, x: 0, y: 0, z: 10, w, d, h, col: f.col });
    onFront(g, o, 0, 0, 10 + h);
    const rows = f.rows ?? 2, cols = f.cols ?? 4, ww = (w - 60) / cols;
    if (f.win) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = 30 + c * ww, wy = h * 0.46 + r * h * 0.48 / rows;
      g.shadowColor = rgb(f.win, 0.9); g.shadowBlur = 14;
      g.beginPath(); g.roundRect(wx, wy, ww - 12, h * 0.14, 4); g.fillStyle = rgb(f.win); g.fill();
    }
    g.shadowBlur = 0;
    if (f.label) {
      g.font = `700 20px ${f.font || 'UI'}`; const tw = g.measureText(f.label).width + 28;
      g.beginPath(); g.roundRect((w - tw) / 2, h * 0.13, tw, 32, 8); g.fillStyle = f.plate || 'rgba(244,242,238,0.95)'; g.fill();
      g.fillStyle = f.plateInk || '#16141c'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(f.label, w / 2, h * 0.13 + 17);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (chim && f.smoke !== false) for (const [cx, ch] of [[53, h + 84 * k], [105, h + 58 * k]]) for (let i = 0; i < 3; i++) {
      const ph = ((t / 2.4) + i / 3 + cx * 0.003) % 1, s = o.s ?? 1;
      const [sx, sy] = P(o, cx, d - 33, 10 + ch + 10 + ph * 90);
      g.beginPath(); g.arc(sx + ph * 14 * s, sy, (9 + ph * 12) * s, 0, Math.PI * 2);
      g.fillStyle = rgb(f.smokeCol || [190, 184, 210], 0.22 * Math.sin(Math.PI * ph) * k); g.fill();
    }
    g.restore();
  }
  // a person token: a billboard that stands up and faces the camera, initials on the head. (sx, sy) = feet on screen.
  function token(g, sx, sy, f) {
    const { col, ini = '', s = 1, alpha: a = 1, head = '#fbf8f3', ink = '#16141c', font = 'Display' } = f;
    if (s <= 0.01 || a <= 0.01) return;
    g.save(); g.globalAlpha *= a; g.translate(sx, sy); g.scale(s, s);
    g.filter = 'blur(6px)'; g.beginPath(); g.ellipse(4, 2, 30, 9, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill(); g.filter = 'none';
    let gr = g.createLinearGradient(0, -44, 0, 0); gr.addColorStop(0, rgb(mix(col, WHITE, 0.2))); gr.addColorStop(1, rgb(mix(col, BLACK, 0.25)));
    g.beginPath(); g.roundRect(-25, -40, 50, 40, [22, 22, 8, 8]); g.fillStyle = gr; g.fill();
    gr = g.createLinearGradient(0, -86, 0, -44); gr.addColorStop(0, head); gr.addColorStop(1, '#d9d3cc');
    g.beginPath(); g.arc(0, -64, 22, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    g.strokeStyle = rgb(col); g.lineWidth = 3; g.stroke();
    g.fillStyle = ink; g.font = `800 15px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ini, 0, -63);
    g.restore();
  }
  // a label chip floating over an object: { s, alpha, fill, ink, font }
  function chip(g, sx, sy, text, f = {}) {
    const { s = 1, alpha: a = 1, fill = '#f4f2ee', ink = '#16141c', font = 'Display' } = f;
    if (s <= 0.01 || a <= 0.01) return;
    note(text); g.save(); g.globalAlpha *= a; g.translate(sx, sy); g.scale(s, s);
    g.font = `800 26px ${font}`; const tw = g.measureText(text).width + 30;
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 16; g.shadowOffsetY = 6;
    g.beginPath(); g.roundRect(-tw / 2, -22, tw, 44, 12); g.fillStyle = fill; g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 1);
    g.restore();
  }
  // a floor under the objects: lines converging to a vanishing point (vx, vy) from the horizon y0 to the frame bottom,
  // horizontals that crawl toward the camera at `crawl` per second. { y0, vx, vy, step = 150, rows = 9, col, a = 0.16, crawl = 0.12 }
  function floor(g, t, f) {
    const { W, H } = C, { y0, vx = W / 2, vy, step = 150, rows = 9, col = [150, 140, 200], a = 0.16, crawl = 0.12 } = f;
    const gr = g.createLinearGradient(0, y0, 0, H); gr.addColorStop(0, rgb(col, 0)); gr.addColorStop(1, rgb(col, a));
    g.save(); g.strokeStyle = gr; g.lineWidth = f.lw ?? 1.2; g.beginPath();
    const k = (y0 - vy) / (H - vy);
    for (let xb = -1800; xb <= W + 1800; xb += step) { g.moveTo(vx + (xb - vx) * k, y0); g.lineTo(xb, H); }
    const c = (t * crawl) % 1;
    for (let i = 0; i < rows; i++) { const s = (i + c) / rows, y = y0 + (H - y0) * s * s; g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke(); g.restore();
  }
  // draw in the plane of a top face so text reads upright (AX × AY < 0: the plain (AX, AY) basis mirrors it):
  // local x along +x, local y along −y, origin at the face's FAR-left corner (X, Y + d, Z). Reset the transform after.
  const onTop = (g, o, X, Y, Z) => { const [ex, ey] = P(o, X, Y, Z), k = o.s ?? 1; g.setTransform(AX[0] * k, AX[1] * k, -AY[0] * k, -AY[1] * k, ex, ey); };

  // ---- painter's order for a whole scene. Draw calls are queued with the box they occupy and flushed far → near
  // (depth = the footprint centre along the camera axis), so money set down between a person and a building is drawn
  // in its real place, not in the order the code happens to call it.
  //   const L = ISO.layer(); L.add({ x, y, z, w, d }, () => figure(...)); …; L.flush();
  const DEPTH = [0.386, -0.864, 0.325];   // toward the viewer (scripts/figures_build.py fits the same camera)
  function layer() {
    const q = [];
    return {
      add(b, draw) { const cx = (b.x ?? 0) + (b.w ?? 0) / 2, cy = (b.y ?? 0) + (b.d ?? 0) / 2, cz = (b.z ?? 0); q.push([DEPTH[0] * cx + DEPTH[1] * cy + DEPTH[2] * cz, q.length, draw]); },
      flush() { q.sort((a, b) => a[0] - b[0] || a[1] - b[1]); for (const [, , draw] of q) draw(); q.length = 0; },
    };
  }

  // ---- figures: sprites from library/figures (scripts/figures_build.py → assets/figures/ in a project), rendered in
  // Blender through the same projection and light as box(). Grey shading × the object's colour, accent parts × accent.
  //   ISO.useFigures(['office', 'person']);                     // top of film.js: frame 0 waits for the images
  //   ISO.figure(g, o, 'office', { x: 0, y: 0, col: [70, 110, 220], accent: [255, 210, 63], grow: k });
  const FIG = {}, TINT = new Map();
  const image = (src) => { const i = new Image(); i.src = src; C.gates.push(i.decode().catch(() => console.warn(`figure image failed: ${src}`))); return i; };
  function useFigures(names) {
    const M = window.FIGURES;
    if (!M) throw new Error('ISO figures: window.FIGURES is missing (assets/figures/figures.js; scripts/figures_build.py, init.sh copies it)');
    for (const n of names) {
      if (FIG[n]) continue;
      const m = M[n]; if (!m) throw new Error(`ISO figures: no figure "${n}" (have: ${Object.keys(M).filter((k) => k !== '_').join(', ')})`);
      FIG[n] = { m, base: image(`../assets/figures/${n}.png`), acc: m.accent ? image(`../assets/figures/${n}.accent.png`) : null };
    }
  }
  function tinted(im, col, key) {
    let c = TINT.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = rgb(col); x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(im, 0, 0);
    TINT.set(key, c); return c;
  }
  // the figure's footprint corner at (x, y, z); s scales it about that corner, grow (0..1) raises it from the ground
  function place(g, o, F, f) {
    const { x = 0, y = 0, z = 0, s = 1, grow = 1 } = f, [sx, sy] = P(o, x, y, z), k = (o.s ?? 1) * F.m.scale * s;
    g.translate(sx, sy); g.scale(k, k * grow); g.translate(-F.m.anchor[0], -F.m.anchor[1]);
  }
  function figure(g, o, name, f = {}) {
    const F = FIG[name];
    if (!F) throw new Error(`ISO.figure("${name}"): call ISO.useFigures(['${name}', …]) at the top of film.js`);
    if (!F.base.naturalWidth || (f.alpha ?? 1) <= 0.002 || (f.grow ?? 1) <= 0.002) return;
    const col = f.col ?? [236, 240, 248], acc = f.accent === undefined ? [255, 210, 63] : f.accent;
    g.save(); g.globalAlpha *= f.alpha ?? 1; place(g, o, F, f);
    g.drawImage(tinted(F.base, col, `${name}|${col}`), 0, 0);
    if (F.acc && acc && F.acc.naturalWidth) g.drawImage(tinted(F.acc, acc, `${name}.a|${acc}`), 0, 0);
    g.restore();
  }
  // paint onto a figure's flat area (phone and laptop screens, a document, a portrait frame): paint(g, w, h) draws in a
  // w × h box that the transform maps onto the area (a parallelogram through its top-left, top-right, bottom-left).
  // A real person is shown as a real photo here: figureQuad(g, o, 'portrait', f, (g, w, h) => g.drawImage(photo, 0, 0, w, h)).
  function figureQuad(g, o, name, f, paint, w = 300) {
    const F = FIG[name], q = F && F.m.quad;
    if (!q) throw new Error(`ISO.figureQuad: figure "${name}" has no flat area (quad in figures.json)`);
    const [tl, tr, , bl] = q, ex = [tr[0] - tl[0], tr[1] - tl[1]], ey = [bl[0] - tl[0], bl[1] - tl[1]];
    const h = Math.round(w * Math.hypot(...ey) / Math.hypot(...ex));
    g.save(); g.globalAlpha *= f.alpha ?? 1; place(g, o, F, f);
    g.transform(ex[0] / w, ex[1] / w, ey[0] / h, ey[1] / h, tl[0], tl[1]);
    g.beginPath(); g.rect(0, 0, w, h); g.clip(); paint(g, w, h); g.restore();
  }

  // ---- a speech bubble or callout tied to a point of the scene: the tail ends on (x, y, z), never in the air.
  // f = { dx, dy (bubble centre from the point, px), font, fill, ink, pad, k (0..1 entry scale, from the tail) }
  function callout(g, o, x, y, z, text, f = {}) {
    const k = f.k ?? 1; if (k <= 0.01) return;
    note(text); const [px, py] = P(o, x, y, z), dx = f.dx ?? 0, dy = f.dy ?? -90, pad = f.pad ?? 22;
    g.save(); g.font = f.font || '600 34px sans-serif';
    const tw = g.measureText(text).width + pad * 2, th = parseInt(g.font.match(/(\d+)px/)[1], 10) * 1.7;
    g.translate(px, py); g.scale(k, k);
    const bx = dx - tw / 2, by = dy - th / 2, tx = Math.max(bx + 18, Math.min(bx + tw - 18, dx * 0.4));
    g.fillStyle = f.fill || '#fff';
    g.beginPath(); g.roundRect(bx, by, tw, th, Math.min(20, th / 2)); g.fill();
    // the tail: from the bubble's edge nearest the point down to the point itself
    const edge = dy < 0 ? by + th - 1 : by + 1;
    g.beginPath(); g.moveTo(tx - 12, edge); g.lineTo(0, 0); g.lineTo(tx + 12, edge); g.closePath(); g.fill();
    g.fillStyle = f.ink || '#16141c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, dx, dy + 1);
    g.restore();
  }

  window.ISO = { AX, AY, P, centred, rgb, mix, poly, box, shadow, onFront, onTop, stack, building, token, chip, floor,
    layer, useFigures, figure, figureQuad, callout, note };
})();
