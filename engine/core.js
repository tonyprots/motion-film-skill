// Motion-reel engine. The film is a pure function of time: window.seek(t) paints frame t.
//
// Frame lifecycle:  begin() → every live scene's run() calls put(el, props) → commit() → after() hooks → commit()
// Every animated element is registered once with reg(el, base). On every frame commit() writes base ⊕ this
// frame's overrides to EVERY registered element, so no state survives between frames and any frame can be
// painted in any order. No timers, no CSS transitions, no Math.random; seeded noise only (mulberry32).
//
// Loads after lib/motion.js and film/data.js (window.TL timeline, window.BEATS grid, window.VO phrases).
(() => {
  const TL = window.TL || {}, BEATS = window.BEATS || {};
  const qs = new URLSearchParams(location.search);
  const FORMATS = { '16x9': [1920, 1080], '1x1': [1080, 1080], '4x5': [1080, 1350], '9x16': [1080, 1920] };
  const FMT = qs.get('fmt') || (TL.formats || ['16x9'])[0];
  const [W, H] = FORMATS[FMT];
  const FPS = TL.fps || 60, DUR = TL.duration || 15;
  const { step, track } = window.Motion;

  // ------------------------------------------------------------------ time (beats are the unit)
  // bt(n): beat n → seconds on the MEASURED grid (beats.json), linear between measured beats,
  // extrapolated with the period outside it. Marks in timeline.json are beats; mark names work anywhere a beat does.
  const GRID = BEATS.beats && BEATS.beats.length > 1 ? BEATS.beats : null;
  const PERIOD = BEATS.beat || 60 / (TL.bpm || 120);
  const B0 = GRID ? GRID[0] : (BEATS.offset || 0);
  const beatOf = (m) => (typeof m === 'string' ? (TL.marks && m in TL.marks ? TL.marks[m] : err(`unknown mark "${m}"`)) : m);
  function err(m) { throw new Error(m); }
  function bt(x) {
    const n = beatOf(x);
    if (!GRID) return B0 + n * PERIOD;
    if (n <= 0) return GRID[0] + n * PERIOD;
    const i = Math.floor(n), L = GRID.length;
    if (i >= L - 1) return GRID[L - 1] + (n - (L - 1)) * PERIOD;
    return GRID[i] + (n - i) * (GRID[i + 1] - GRID[i]);
  }
  function beatAt(t) {
    if (!GRID || t <= GRID[0]) return (t - B0) / PERIOD;
    const L = GRID.length;
    if (t >= GRID[L - 1]) return L - 1 + (t - GRID[L - 1]) / PERIOD;
    let lo = 0, hi = L - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (GRID[m] <= t) lo = m; else hi = m; }
    return lo + (t - GRID[lo]) / (GRID[lo + 1] - GRID[lo]);
  }
  // Visual hits lead the beat so they READ on it (audio stays on the grid). A masked word only becomes visible part-way
  // through its spring, so the lead is the larger of 3 frames and the time the preset needs to cover half its travel.
  const LEAD = 3 / FPS;
  const halfCache = {};
  function leadFor(preset = 'snappy') {
    const key = typeof preset === 'string' ? preset : JSON.stringify(preset);
    if (!(key in halfCache)) { let tau = 0; while (step(tau, preset) < 0.5 && tau < 2) tau += 0.001; halfCache[key] = tau; }
    return Math.max(LEAD, halfCache[key]);
  }

  // ------------------------------------------------------------------ math
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, x) => a + (b - a) * x;
  const seg = (t, b0, b1) => clamp((t - bt(b0)) / (bt(b1) - bt(b0)));   // linear 0→1 across beats (typing, scrolls, slow pushes)
  const ease = {
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    out: (x) => 1 - Math.pow(1 - x, 3),
    expoOut: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    expoIn: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  };
  // springs released on beats (lib/motion.js). presets: snappy | default | heavy   (playful: mascots only)
  const sp = (t, beat, preset = 'default') => step(t - bt(beat), preset);
  const spHit = (t, beat, preset = 'snappy', lead = leadFor(preset)) => step(t - (bt(beat) - lead), preset);   // reads ON the beat
  // keys: [[beat, value, preset?], ...]; first key = initial value. Retargets keep velocity (superposition).
  const trk = (t, keys, preset = 'default') => track(t, keys.map(([b, v, p]) => [bt(b), v, p]), preset);
  function trkObj(t, keys, preset = 'default') {
    const out = {};
    for (const k of Object.keys(keys[0][1])) out[k] = trk(t, keys.map(([b, v, p]) => [b, v[k] ?? keys[0][1][k], p]), preset);
    return out;
  }
  // 1 inside [b0, b1) with spring edges
  const win = (t, b0, b1, pin = 'snappy', pout = 'snappy') => sp(t, b0, pin) - (b1 == null ? 0 : sp(t, b1, pout));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // smooth seeded 1D noise in [-1, 1] (drift, micro camera moves)
  function noise1(seed) {
    const r = mulberry32(seed), v = Array.from({ length: 256 }, () => r() * 2 - 1);
    return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(v[i & 255], v[(i + 1) & 255], u); };
  }
  // pick a value per format: pick(wide, square, tall)  (4x5 uses square)
  const pick = (a, b = a, c = b) => (FMT === '16x9' ? a : FMT === '9x16' ? c : b);

  // ------------------------------------------------------------------ DOM registry
  const stage = document.getElementById('stage');
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  const REG = [];
  let OVER = new Map();
  function el(tag, attrs = {}, parent = null, html = '') {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') e.style.cssText = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v);
    }
    if (html) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const frag = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

  /** Register an animated element. base = its props on frames where nobody put() it. Hidden things: {o: 0}. */
  function reg(e, base = {}) {
    if (e._reg) { Object.assign(e._base, base); return e; }
    e._reg = true; e._base = { o: 1, ...base }; e._last = {}; e._orig = {};
    REG.push(e);
    return e;
  }
  /** Override props for this frame: x y (px) s sx sy r (deg) o hide clip filter css{} text html. Later calls merge. */
  function put(e, props) {
    if (!e) return;
    if (!e._reg) reg(e);
    const cur = OVER.get(e);
    OVER.set(e, cur ? Object.assign(cur, props) : { ...props });
  }
  // 2D transforms only, and no will-change: a composited layer (translate3d / will-change / 3D rotate) keeps a cached
  // raster whose pixels depend on which frame was painted before, which breaks seek(t) determinism (render --verify).
  const TF = ['x', 'y', 's', 'sx', 'sy', 'r'];
  function commit() {
    for (const e of REG) {
      const p = Object.assign({}, e._base, OVER.get(e) || {});
      const st = {};
      if (TF.some((k) => p[k] != null)) {
        const s = p.s ?? 1;
        st.transform = `translate(${(p.x || 0).toFixed(2)}px, ${(p.y || 0).toFixed(2)}px) rotate(${(p.r || 0).toFixed(3)}deg) scale(${(s * (p.sx ?? 1)).toFixed(5)}, ${(s * (p.sy ?? 1)).toFixed(5)})`;
      }
      if (p.o < 0.999) st.opacity = String(Math.max(0, p.o).toFixed(4));
      if (p.o <= 0.001 || p.hide) st.visibility = 'hidden';
      if (p.clip) st.clipPath = p.clip;
      if (p.filter) st.filter = p.filter;
      if (p.css) Object.assign(st, p.css);
      // any style ever written but not set this frame returns to its original inline value
      for (const k of Object.keys(e._orig)) if (!(k in st)) st[k] = e._orig[k];
      for (const [k, v] of Object.entries(st)) {
        const custom = k.startsWith('--');
        if (!(k in e._orig)) e._orig[k] = custom ? e.style.getPropertyValue(k) : e.style[k];
        if (e._last[k] !== v) { custom ? e.style.setProperty(k, v) : (e.style[k] = v); e._last[k] = v; }
      }
      for (const key of ['text', 'html']) {
        const orig = '__' + key + '0';
        if (key in p || e[orig] != null) {
          if (e[orig] == null) e[orig] = key === 'text' ? e.textContent : e.innerHTML;
          const v = key in p ? p[key] : e[orig];
          if (e._last['__' + key] !== v) { key === 'text' ? (e.textContent = v) : (e.innerHTML = v); e._last['__' + key] = v; }
        }
      }
    }
  }
  const inset = (top, right, bottom, left, r = 0) => `inset(${top}% ${right}% ${bottom}% ${left}%${r ? ` round ${r}px` : ''})`;
  /** Live rect of an element in STAGE px. Reads layout: call only in after() hooks. */
  function rectOf(e) {
    const r = e.getBoundingClientRect(), s = stage.getBoundingClientRect(), k = s.width / W;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k,
      cx: (r.left - s.left + r.width / 2) / k, cy: (r.top - s.top + r.height / 2) / k };
  }

  // ------------------------------------------------------------------ scenes
  // scene({ name, from, to, pre, post, cut, build(root, S), run(t, b, S), after(t, b, S) })
  //   from/to: beats or mark names. The root is visible on [from - pre, to + post) beats and run() is only called then.
  //   cut: true (default when pre === 0) → from is a hard cut: motion-blur samples never straddle it.
  //   S = { root, name, from, to } plus anything build() stores on it.
  const SCENES = [];
  function scene(def) {
    const S = { pre: 0, post: 0, ...def };
    S.root = el('div', { class: 'scene', 'data-scene': S.name }, stage);
    reg(S.root, { hide: true });
    SCENES.push(S);
    return S;
  }
  const canvas = (parent) => {
    const c = el('canvas', { width: W, height: H, style: `position:absolute;left:0;top:0;width:${W}px;height:${H}px` }, parent);
    return c.getContext('2d');
  };
  const hooks = { before: [], after: [] };      // global per-frame hooks (camera, cursor, overlays)

  function paint(t) {
    OVER = new Map();
    const b = beatAt(t);
    for (const h of hooks.before) h(t, b);
    // a scene starting at beat <= 0 owns frame 0 even when the measured beat 0 sits a hair after t = 0
    const live = SCENES.filter((S) => (beatOf(S.from) <= 0 || b >= beatOf(S.from) - S.pre) && b < beatOf(S.to) + S.post);
    for (const S of live) { put(S.root, { hide: false }); S.run && S.run(t, b, S); }
    commit();
    if (hooks.after.length || live.some((S) => S.after)) {
      for (const S of live) S.after && S.after(t, b, S);
      for (const h of hooks.after) h(t, b);
      commit();
    }
  }

  window.C = {
    TL, BEATS, FMT, W, H, FPS, DUR, LEAD, leadFor, stage, pick,
    bt, beatAt, beatOf, clamp, lerp, seg, ease, sp, spHit, trk, trkObj, win, mulberry32, noise1,
    el, frag, reg, put, commit, inset, rectOf, scene, canvas, hooks, SCENES,
    fonts: [],              // film.js: e.g. C.fonts = ['500 100px Display', '400 40px UI'] — awaited before frame 0
  };

  // ------------------------------------------------------------------ boot (called at the end of film.js)
  C.start = () => {
    for (const S of SCENES) S.build && S.build(S.root, S);
    window.FPS = FPS; window.DURATION = DUR; window.FILM = { W, H, FMT };
    window.CUTS = SCENES.filter((S) => (S.cut ?? S.pre === 0) && beatOf(S.from) > 0).map((S) => bt(S.from)).sort((a, b) => a - b);
    window.seek = (t) => paint(Math.max(0, Math.min(DUR - 1e-6, t)));
    window.READY = (async () => {
      // a missing face must be loud (the render logs [page] warnings) but not fatal: the stack falls back
      await Promise.all(C.fonts.map((f) => document.fonts.load(f).then((r) => { if (!r.length) console.warn(`font not loaded: ${f} (falling back)`); },
        () => console.warn(`font failed: ${f} — check the @font-face url in film/index.html (falling back)`))));
      await document.fonts.ready;
      const imgs = [...document.images];
      await Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
      await Promise.all(imgs.map((i) => i.decode().catch(() => 0)));
      window.seek(0);
      return true;
    })();

    // preview player (?play): NOT used in render mode. Click to play/pause, scaled to fit the window.
    if (qs.has('play')) {
      document.body.classList.add('play');
      const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `scale(${k})`; };
      fit(); addEventListener('resize', fit);
      const audio = new Audio('../audio/mix.wav');
      document.body.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
      const loop = () => { window.seek(audio.currentTime % DUR); requestAnimationFrame(loop); };
      window.READY.then(loop);
    }
  };
})();
