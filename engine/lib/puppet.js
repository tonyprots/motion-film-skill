// Cut-out puppet presenter: a drawn character as a pack of raster layers (one picture per pose, face, mouth shape,
// closed eyes, hands over the face), driven by the same draw(t, {...}) as ACTOR, so a film swaps one for the other in
// mount. Packs: assets/puppets/<name>/puppet.json + PNGs, embedded by sync.mjs as window.PUPPETS; scripts/puppet_pack.py
// builds them. Poses replace each other on `at` (a cut hidden by the body pop, as in cut-out animation): a crossfade
// of two drawn poses shows ghost arms, and there are no limbs to interpolate.
(() => {
  const POSES = ['explain', 'point', 'listen', 'shrug', 'worry', 'welcome', 'rest', 'hush', 'think', 'chin', 'scratch', 'facepalm', 'cheer', 'wave'];
  const EXPRESSIONS = ['neutral', 'happy', 'worried', 'surprised', 'shocked', 'grimace', 'wink', 'sad', 'skeptic'];
  // same defaults as ACTOR: the pose brings its face unless the film sets one
  const POSE_FACE = { rest: 'neutral', explain: 'neutral', point: 'neutral', listen: 'worried', shrug: 'surprised', worry: 'worried', welcome: 'happy', hush: 'surprised', think: 'worried', chin: 'neutral', scratch: 'worried', facepalm: 'grimace', cheer: 'happy', wave: 'happy' };
  // a pack without a pose or a face falls back along these lines (then to rest / neutral)
  const NEAR_POSE = { listen: 'rest', worry: 'think', welcome: 'shrug', hush: 'point', chin: 'think', scratch: 'think', facepalm: 'think', cheer: 'wave', think: 'rest', explain: 'rest', point: 'explain', shrug: 'explain', wave: 'explain' };
  const NEAR_FACE = { shocked: 'surprised', grimace: 'worried', sad: 'worried', wink: 'happy', skeptic: 'worried' };
  const SHAPES = ['x', 'b', 'c', 'd', 'e', 'f'];
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const num = (x) => Number.isFinite(x);
  const pt = (p) => Array.isArray(p) && p.length === 2 && p.every(num);
  const file = (s) => typeof s === 'string' && /^[\w-]+\.png$/.test(s);
  const layer = (l) => l && file(l.src) && (l.at === undefined || pt(l.at));
  function check(name) {
    const P = (window.PUPPETS || {})[name];
    if (!P) throw new Error(`no puppet pack "${name}" (assets/puppets/${name}/puppet.json, then sync.mjs)`);
    if (!Array.isArray(P.size) || !P.size.every((x) => num(x) && x > 0) || typeof P.base !== 'string' || !P.poses?.rest)
      throw new Error(`puppet pack "${name}": needs size, base and a rest pose`);
    for (const [k, p] of Object.entries(P.poses)) if (!layer(p) || (p.head !== undefined && !pt(p.head)) || (p.over && !layer(p.over))) throw new Error(`puppet pack "${name}": bad pose ${k}`);
    for (const group of ['faces', 'mouths']) for (const [k, l] of Object.entries(P[group] || {})) if (!layer(l)) throw new Error(`puppet pack "${name}": bad ${group} ${k}`);
    if (!P.faces?.neutral) throw new Error(`puppet pack "${name}": needs a neutral face`);
    if (P.blink && !layer(P.blink)) throw new Error(`puppet pack "${name}": bad blink`);
    for (const [k, v] of Object.entries(P.alias || {})) if (!P.poses[v]) throw new Error(`puppet pack "${name}": alias ${k} → missing pose ${v}`);
    if (P.foot !== undefined && !pt(P.foot)) throw new Error(`puppet pack "${name}": bad foot`);
    return P;
  }
  // every pose name → the pack's picture it uses, and the names that fell back (not drawn for this pack)
  function resolve(P) {
    const map = {}, fallback = [];
    for (const name of POSES) {
      const seen = new Set();
      for (let at = name; ; at = NEAR_POSE[at] || 'rest') {
        const k = P.poses[at] ? at : P.alias?.[at];
        if (k) { map[name] = k; break; }
        if (seen.has(at)) { map[name] = 'rest'; break; }
        seen.add(at);
      }
      if (map[name] !== name && !P.alias?.[name]) fallback.push(name);
    }
    return { map, fallback };
  }
  const faceOf = (P, e) => P.faces[e] ? e : P.faces[NEAR_FACE[e]] ? NEAR_FACE[e] : 'neutral';
  const luminance = (css) => {
    const m = /rgba?\(([^)]+)\)/.exec(css || ''); if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return a < 0.5 ? null : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  function mount(parent, o = {}) {
    if ([o.x ?? 0, o.y ?? 0, o.w ?? 480].some((x) => !num(x)) || (o.w ?? 480) <= 0) throw new Error('puppet needs finite position and positive width');
    const P = check(o.pack), { map, fallback } = resolve(P), [PW, PH] = P.size, w = o.w ?? 480, k = w / PW, foot = P.foot || [PW / 2, PH];
    if (fallback.length) console.warn(`puppet "${o.pack}": no picture for ${fallback.join(', ')} — drawn as the nearest pose`);
    const id = String(o.id ?? 'presenter');
    const root = C.reg(C.el('div', { class: 'abs', 'data-puppet': id, 'data-pack': o.pack, style: `width:${w}px;height:${w * PH / PW}px` }, parent), { x: o.x ?? 0, y: o.y ?? 0 });
    const rig = C.el('div', { style: `position:absolute;left:0;top:0;width:${PW}px;height:${PH}px;transform:scale(${k});transform-origin:0 0` }, root);
    const body = C.el('div', { style: `position:absolute;inset:0;transform-origin:${foot[0]}px ${foot[1]}px` }, rig);
    const img = (l, box = body) => C.el('img', { src: P.base + l.src, alt: '', draggable: 'false',
      style: `position:absolute;left:${(l.at || [0, 0])[0]}px;top:${(l.at || [0, 0])[1]}px;opacity:0;pointer-events:none` }, box);
    const L = { pose: {}, face: {}, mouth: {}, over: {} };
    for (const [k2, p] of Object.entries(P.poses)) L.pose[k2] = img(p);
    const head = C.el('div', { style: 'position:absolute;inset:0' }, body);
    for (const [k2, f] of Object.entries(P.faces)) L.face[k2] = img(f, head);
    for (const [k2, m] of Object.entries(P.mouths || {})) if (SHAPES.includes(k2)) L.mouth[k2] = img(m, head);
    L.blink = P.blink ? img(P.blink, head) : null;
    for (const [k2, p] of Object.entries(P.poses)) if (p.over) L.over[k2] = img(p.over);
    // Rim for dark backgrounds: a light outline around the whole silhouette. 'auto' finds what is painted behind the
    // puppet on every draw (a film may darken a chapter): at three points by its sides and head, the last visible
    // element in DOM order with an opaque background colour that covers the point (z-index is not considered; photos,
    // canvases and video are not read: force the rim there). true / false / '#hex' force it.
    const behind = (x, y) => {
      let found = null;
      for (const n of document.body.querySelectorAll('*')) {
        if (root.contains(n)) continue;   // ancestors stay: a parent's own fill lies behind the puppet too
        const r = n.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const css = getComputedStyle(n), l = luminance(css.backgroundColor);
        if (l !== null && css.visibility === 'visible' && css.display !== 'none' && +css.opacity > 0.5) found = l;
      }
      return found;
    };
    const rimOf = (setting) => {
      if (setting === false) return null;
      if (typeof setting === 'string' && setting !== 'auto') { if (!/^#[0-9a-f]{3,8}$/i.test(setting)) throw new Error('puppet outline: auto, true, false or #hex'); return setting; }
      if (setting === true) return '#fffdf5';
      const r = root.getBoundingClientRect();
      const page = luminance(getComputedStyle(document.body).backgroundColor) ?? 1;
      const dark = [[r.left + r.width * 0.12, r.top + r.height * 0.55], [r.right - r.width * 0.12, r.top + r.height * 0.55], [r.left + r.width * 0.5, r.top + r.height * 0.03]]
        .some(([x, y]) => (behind(x, y) ?? page) < 0.4);
      return dark ? '#fffdf5' : null;
    };
    const outlineDefault = o.outline ?? 'auto';
    function draw(t, { pose = 'explain', previous = 'rest', at = 0, duration = 0.55, expression = POSE_FACE[pose], previousExpression = POSE_FACE[previous],
      mouth = 0, viseme, react = 0.6, breathe = 3, outline = outlineDefault } = {}) {
      if (!map[pose] || !map[previous] || [t, at, duration, mouth, react, breathe].some((x) => !num(x)) || duration <= 0) throw new Error('invalid puppet pose, time or state');
      if (!EXPRESSIONS.includes(expression) || !EXPRESSIONS.includes(previousExpression)) throw new Error('invalid puppet expression');
      if (viseme !== undefined && viseme !== null && !SHAPES.includes(viseme)) throw new Error('invalid puppet viseme');
      const dt = t - at, cur = map[pose], prev = map[previous], top = dt >= 0 ? cur : prev;
      for (const [k2, n] of Object.entries(L.pose)) n.style.opacity = k2 === top ? 1 : 0;
      const hd = P.poses[top].head || [0, 0];
      head.style.transform = `translate(${hd[0]}px,${hd[1]}px)`; head.style.zIndex = 3;
      const face = faceOf(P, dt < duration / 2 ? previousExpression : expression);
      for (const [k2, n] of Object.entries(L.face)) n.style.opacity = k2 === face ? 1 : 0;
      // mouth: an explicit shape (LIPSYNC.at(t).shape) or the ACTOR-style opening 0..1
      const m = clamp(mouth), shape = viseme ?? (m < 0.12 ? 'x' : m < 0.4 ? 'b' : m < 0.75 ? 'c' : 'd');
      const show = shape !== 'x' && L.mouth[shape] ? shape : face === 'neutral' && L.mouth.x ? 'x' : null;
      for (const [k2, n] of Object.entries(L.mouth)) n.style.opacity = k2 === show ? 1 : 0;
      if (L.blink) {
        const blink = Math.exp(-Math.pow(((t % 3.7) - 2.8) / 0.065, 2));
        L.blink.style.opacity = blink > 0.5 && !['surprised', 'shocked', 'wink'].includes(face) ? 1 : 0;
      }
      for (const [k2, n] of Object.entries(L.over)) { n.style.opacity = k2 === top ? 1 : 0; n.style.zIndex = 4; }
      // the same body pop and breath as ACTOR, from the feet
      const kk = Math.max(0, dt), pop = pose === previous && expression === previousExpression ? 0
        : react * (kk < 0.12 ? -0.03 * Math.sin(Math.PI * kk / 0.12) : 0.045 * Math.exp(-(kk - 0.12) / 0.18) * Math.sin(Math.PI * Math.min(1, (kk - 0.12) / 0.3)));
      body.style.transform = `translateY(${breathe * Math.sin(2 * Math.PI * t / 3.4) * PW / 500}px) scale(${1 + pop},${1 - pop * 0.6})`;
      const rim = rimOf(outline), r = 3 / k;
      body.style.filter = rim ? [[r, 0], [-r, 0], [0, r], [0, -r]].map(([x, y]) => `drop-shadow(${x}px ${y}px 0 ${rim})`).join(' ') : 'none';
      root.dataset.pose = cur; root.dataset.face = face; root.dataset.mouth = show || 'none'; root.dataset.rim = rim ? 'on' : 'off';
    }
    return { root, draw, pack: o.pack, poses: { ...map }, fallback };
  }
  window.PUPPET = { mount, check, resolve, poses: POSES, expressions: EXPRESSIONS, get packs() { return Object.keys(window.PUPPETS || {}); } };
})();
