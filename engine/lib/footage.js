// Footage played frame by frame from t. Classic script, after core.js; nothing to call. Two kinds:
//
// 1. Generated B-roll (scripts/broll.py): every timeline.json "broll" entry that broll.py has generated for this format
//    (its "_out") plays full-frame from its mark for its length, above the scenes (z 40: under the cursor and captions).
//    The clip's first frame IS the film's frame at the mark and its last frame the film's frame at mark + seconds, so both
//    edges cut invisibly.
// 2. A recording under the whole film (scripts/overlay_prep.py, overlay mode): timeline.json "recording" — a talking head,
//    a talk, an interview — is the bottom layer from t = 0 to the end; the scenes are drawn over it (keep their roots
//    transparent). Its sound is the voice (audio/vo.wav). Frame k of the source is shown on [k / fps, (k + 1) / fps), so
//    a 25 or 30 fps source in a 60 fps film repeats frames (2-3 / 2), never blends them, and never drifts: k comes from t,
//    not from a running count. The frame index is taken at the FRAME time (window.FRAME_T, set by render.mjs), not at
//    the motion-blur sub-frame time: the recording carries its own blur, two of its frames averaged would ghost.
//      "recording": { "src": "assets/recording/rec", "fps": 25, "frames": 500, "w": 1920, "h": 1080, "offset": 0,
//                     "layout": { "9x16": { "mode": "split", "share": 0.45, "focus": [0.5, 0.4] } } }
//    layout per format (default: "cover" when the aspect matches within 10 %, else "split"):
//      cover  the whole frame, cropped around focus [x, y] (0..1 of the source; default centre)
//      split  full width at the bottom, share of the frame height (default 0.45); the top is the graphics area
//      box    { x, y, w, h, radius } in frame px: picture in picture
//    C.REC = { x, y, w, h, mode, box, img } — its box in frame px for the layout in film.js (split: graphics go above
//    C.REC.y); box and img are registered: put(C.REC.box, { o }) hides it, put(C.REC.img, { s }) punches in.
//
// Each frame is a JPEG loaded on demand; seek(t) returns the decode promise and the renderer waits for it (C.pending).
(() => {
  const { TL, FMT, W, H, bt, el } = C;
  for (const b of TL.broll || []) {
    const o = b._out && b._out[FMT];
    if (!o) continue;
    const img = el('img', { class: 'abs', style: `left:0;top:0;width:${W}px;height:${H}px;object-fit:cover;z-index:40;display:none` }, C.stage);
    let cur = '';
    C.hooks.before.push((t) => {
      const k = Math.floor((t - bt(b.at)) * o.fps + 1e-6);
      if (k < 0 || k >= o.frames) { img.style.display = 'none'; return; }
      img.style.display = '';
      const src = `../assets/broll/${b.id}_${FMT}/${String(k + 1).padStart(4, '0')}.jpg`;
      if (src !== cur) { cur = src; img.src = src; C.pending.push(img.decode().catch(() => 0)); }
    });
  }

  const R = TL.recording;
  if (R && R.src && R.frames) {
    const aspect = R.w / R.h, frame = W / H;
    const L = { mode: Math.abs(aspect / frame - 1) < 0.1 ? 'cover' : 'split', ...((R.layout || {})[FMT] || {}) };
    const box = L.mode === 'box' ? { x: L.x || 0, y: L.y || 0, w: L.w || W, h: L.h || H }
      : L.mode === 'split' ? { x: 0, y: Math.round(H * (1 - (L.share ?? 0.45))), w: W, h: Math.round(H * (L.share ?? 0.45)) }
      : { x: 0, y: 0, w: W, h: H };
    const [fx, fy] = L.focus || [0.5, 0.5];
    const wrap = el('div', { class: 'abs', style: `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;overflow:hidden;`
      + `border-radius:${L.radius || 0}px;background:#000` });
    C.stage.prepend(wrap);   // under every scene root: film.js builds its scenes after this script
    const img = el('img', { class: 'abs', style: `left:0;top:0;width:${box.w}px;height:${box.h}px;object-fit:cover;`
      + `object-position:${(fx * 100).toFixed(2)}% ${(fy * 100).toFixed(2)}%;transform-origin:${(fx * 100).toFixed(2)}% ${(fy * 100).toFixed(2)}%` }, wrap);
    C.reg(wrap); C.reg(img);
    C.REC = { ...box, mode: L.mode, box: wrap, img };
    const pad = R.pad || 5, off = R.offset || 0;
    let cur = '', dec = null;
    C.hooks.before.push((t) => {
      const tf = Math.max(0, Math.min(C.DUR - 1e-6, window.FRAME_T ?? t));
      const k = Math.max(0, Math.min(R.frames - 1, Math.floor((tf - off) * R.fps + 1e-6)));
      const src = `../${R.src}/${String(k + 1).padStart(pad, '0')}.jpg`;
      if (src !== cur) { cur = src; img.src = src; dec = img.decode().catch(() => 0); }
      C.pending.push(dec);   // every frame: the same file asked again right after READY's seek(0) must still wait for it
    });
  }
})();
