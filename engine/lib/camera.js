// Camera, cursor, shake and focus for motion-film. Classic script, loaded after core.js; pure functions of t.
//
//   CAM.rig(t, el, keys, o)       virtual camera over a big element (a real screenshot, a UI card): keys are
//                                 [[mark, {x, y, z}], …] — focus point in the element's own px and zoom. Each key starts
//                                 `lead` s (0.4) BEFORE its mark: the camera arrives before the action, never chases it.
//                                 Springs keep velocity between keys (C.trkObj). o: {ax, ay} = where the focus sits on
//                                 the frame (default centre), preset 'camera' (role → heavy), lead 0.4, maxZoom 3.
//   CAM.shake(t, hits, o)         trauma shake: hits = [mark, …]; each adds trauma 1 that decays over `decay` s (0.45);
//                                 offset = amp · trauma² · seeded noise. Returns {x, y, r, s} for a put() on a scene root or a
//                                 camera container (s overscans so no edge shows). Hero hits only.
//   CAM.cursor(parent, path, o)   a directed cursor: path = [[mark, x, y, click?], …] in parent px. Moves on an eased
//                                 curve (slight arc, ease-in-out), arrives `settle` s (0.12) before a click, pulses on the
//                                 click. Returns {el, clicks: [marks]} — put a 'click' SFX on each of those marks.
//                                 Call CAM.cursor(...) in build(); it draws itself from a before-hook.
//   CAM.focus(t, els, hero, on)   dims everything in `els` except `hero` while `on` (0..1, e.g. C.win(t, a, b)): opacity
//                                 1 → 0.35. One hero per frame.
(() => {
  const { bt, clamp, lerp, ease, trkObj, noise1, put, el, reg } = C;

  const rig = (t, e, keys, o = {}) => {
    const lead = o.lead ?? 0.4, maxZ = o.maxZoom ?? 3;
    if (e._camL == null) { e._camL = e.offsetLeft; e._camT = e.offsetTop; }
    // keys are on marks; evaluating the track at t + lead moves every key `lead` seconds earlier
    const v = trkObj(t + lead, keys.map(([m, v, p]) => [m, { x: v.x, y: v.y, z: Math.min(maxZ, v.z ?? 1) }, p]), o.preset || 'camera');
    const ax = o.ax ?? C.W / 2, ay = o.ay ?? C.H / 2;
    const props = { x: ax - e._camL - v.z * v.x, y: ay - e._camT - v.z * v.y, s: v.z };
    put(e, props);
    return v;
  };

  const shake = (t, hits, o = {}) => {
    const decay = o.decay ?? 0.45, amp = o.amp ?? 14, rot = o.rot ?? 0.6, f = o.freq ?? 22;
    let trauma = 0;
    for (const m of hits) { const d = t - bt(m); if (d >= 0 && d < decay) trauma = Math.max(trauma, 1 - d / decay); }
    if (!trauma) return { x: 0, y: 0, r: 0, s: 1 };
    const n = (shake._n ||= [noise1(11), noise1(23), noise1(37)]), k = trauma * trauma;
    // s: overscan so a shaken full-frame layer never shows its edge
    return { x: amp * k * n[0](t * f), y: amp * k * n[1](t * f), r: rot * k * n[2](t * f), s: 1 + 2.4 * amp * k / Math.min(C.W, C.H) };
  };

  const ARROW = '<svg width="34" height="44" viewBox="0 0 34 44" style="display:block;overflow:visible;filter:drop-shadow(0 3px 6px rgba(0,0,0,.25))">'
    + '<path d="M2 2 L2 34 L10.5 26.5 L16 40 L22 37.5 L16.5 24.5 L28 24.5 Z" fill="#111" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  const cursor = (parent, path, o = {}) => {
    const settle = o.settle ?? 0.12, z = o.z ?? 50, size = o.size ?? C.pick(64, 60, 72);   // px tall at 1080p: reads on a phone
    const wrap = el('div', { class: 'abs', style: `z-index:${z};pointer-events:none` }, parent);
    const ring = el('div', { class: 'abs', style: `left:-${size * 0.5}px;top:-${size * 0.5}px;width:${size}px;height:${size}px;border-radius:50%;border:${Math.round(size / 14)}px solid var(--accent, #2d5bff)` }, wrap);
    const arrow = el('div', { class: 'abs', style: `left:-2px;top:-2px;transform-origin:0 0` }, wrap, ARROW.replace('width="34" height="44"', `width="${size * 34 / 44}" height="${size}"`));
    reg(wrap, { o: 0 }); reg(ring, { o: 0 }); reg(arrow);
    const P = path.map(([m, x, y, click]) => ({ m, x, y, click: !!click }));
    C.hooks.before.push((t) => {
      const T = P.map((p) => bt(p.m) - (p.click ? settle : 0));
      if (t < T[0] - 0.3 || t > bt(P[P.length - 1].m) + (o.hold ?? 0.6)) return;
      let x = P[0].x, y = P[0].y;
      for (let i = 1; i < P.length; i++) {
        const t0 = T[i - 1] + (P[i - 1].click ? settle : 0), t1 = T[i];
        if (t <= t0) break;
        const u = ease.inOut(clamp((t - t0) / Math.max(0.05, t1 - t0)));
        const dx = P[i].x - P[i - 1].x, dy = P[i].y - P[i - 1].y, bow = 0.12 * u * (1 - u) * 4;   // slight arc, not a ruler line
        x = lerp(P[i - 1].x, P[i].x, u) - dy * bow; y = lerp(P[i - 1].y, P[i].y, u) + dx * bow;
      }
      const appear = clamp((t - (T[0] - 0.3)) / 0.15);
      put(wrap, { o: appear, x, y });
      let press = 0, pulse = 0;
      for (const p of P) if (p.click) { const d = t - bt(p.m); if (d > -0.06 && d < 0.5) { press = Math.max(press, d < 0 ? 1 + d / 0.06 : clamp(1 - d / 0.12)); if (d >= 0) pulse = Math.max(pulse, 1 - d / 0.5); } }
      put(arrow, { s: 1 - 0.12 * press });
      put(ring, { o: pulse > 0 ? pulse * 0.9 : 0, s: 0.4 + 1.2 * (1 - pulse) });
    });
    return { el: wrap, clicks: P.filter((p) => p.click).map((p) => p.m) };
  };

  const focus = (t, els, hero, on) => {
    if (on <= 0) return;
    for (const e of els) if (e !== hero) put(e, { o: lerp(1, 0.35, clamp(on)) });
  };

  window.CAM = { rig, shake, cursor, focus };
})();
