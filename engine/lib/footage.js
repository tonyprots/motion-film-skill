// Generated B-roll (scripts/broll.py) played frame by frame from t. Classic script, after core.js; nothing to call:
// every timeline.json "broll" entry that broll.py has generated for this format (its "_out") plays full-frame from its
// mark for its length, above the scenes (z 40: under the cursor and captions). The clip's first frame IS the film's
// frame at the mark and its last frame the film's frame at mark + seconds, so both edges cut invisibly.
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
})();
