// Closed-form springs. Every function is a pure function of time (seconds):
// no integration, no state, so any frame can be painted in any order.
// sim() is the one integrator, and it keeps the same promise from outside: at(t) replays a fixed-step simulation from a
// checkpoint, so it too is a function of t alone. path() is a smooth camera path through timed keys.
//
// A spring is a damped harmonic oscillator released at rest toward a new target.
// Its unit step response s(τ) goes 0 → 1; s(τ ≤ 0) = 0.
//
// Loads as a classic <script> (window.Motion) or via require().
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.Motion = M;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // response: seconds for one undamped period (SwiftUI-style); damping: ratio ζ.
  // Overshoot of a step = exp(-πζ / √(1-ζ²)) for ζ < 1.
  // soft (s, optional): ease-in. A spring released at rest jumps from 0 to full acceleration on the release frame — on a
  // slow camera that reads as a jolt. soft averages the response over a window of that length (closed form), so the
  // acceleration ramps up instead; the motion lags by about soft/2. Default only for the camera role (ROLES below).
  const PRESETS = {
    snappy:  { response: 0.22, damping: 0.8 },   // ~1.5% overshoot · buttons, toggles, leading edges
    default: { response: 0.4,  damping: 0.86 },  // ~0.5% overshoot · cards, containers, camera
    heavy:   { response: 0.5,  damping: 1.0 },   // none (critical)  · big type, logo lockups
    playful: { response: 0.5,  damping: 0.45 },  // ~20% overshoot   · mascots only
  };
  // Motion tokens: roles are preset names too, so one film speaks one motion language. A brand retunes them in ONE place,
  // timeline.json "motion": {"roles": {"enter": "snappy"}, "presets": {"default": {"response": 0.35, "damping": 0.9}},
  // "stagger": 0.05} — the core calls configure() with it before the first frame.
  const ROLES = { enter: 'default', exit: 'snappy', ui: 'default', text: 'heavy', accent: 'snappy', hero: 'heavy',
    camera: { response: 0.5, damping: 1.0, soft: 0.12 } };   // camera = heavy with a soft start

  function configure(m = {}) {
    for (const [k, v] of Object.entries(m.presets || {})) PRESETS[k] = { ...(PRESETS[k] || {}), ...v };
    Object.assign(ROLES, m.roles || {});
    settleCache.clear();
  }

  function resolve(p) {
    if (p == null) return PRESETS.default;
    if (typeof p === 'string') {
      const r = PRESETS[p] || PRESETS[ROLES[p]] || (typeof ROLES[p] === 'object' ? ROLES[p] : null);
      if (!r) throw new Error(`motion: unknown preset or role "${p}" (presets: ${Object.keys(PRESETS)}; roles: ${Object.keys(ROLES)})`);
      return r;
    }
    return p;
  }

  /** Unit step response of a spring released τ seconds ago. 0 for τ ≤ 0. */
  function step(tau, preset) {
    if (!(tau > 0)) return 0;
    const p = resolve(preset);
    if (!(p.soft > 0)) return hard(tau, p);
    // mean of the hard response over [tau - soft, tau] = (S(tau) - S(tau - soft)) / soft, S(x) = ∫0^x s = x - gap(x)
    const T = p.soft, S = (x) => (x > 0 ? x - gap(x, p) : 0);
    return (S(tau) - S(tau - T)) / T;
  }
  function hard(tau, { response, damping: z }) {
    const w = (2 * Math.PI) / response;
    if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
    }
    if (z === 1) return 1 - Math.exp(-w * tau) * (1 + w * tau);
    const wd = w * Math.sqrt(z * z - 1);   // overdamped
    return 1 - Math.exp(-z * w * tau) * (Math.cosh(wd * tau) + ((z * w) / wd) * Math.sinh(wd * tau));
  }
  // gap(x) = ∫0^x (1 - hard(u)) du, closed form per damping regime
  function gap(x, { response, damping: z }) {
    const w = (2 * Math.PI) / response, a = z * w;
    if (z < 1) {
      const b = w * Math.sqrt(1 - z * z);
      const F = (u) => (Math.exp(-a * u) * ((b - (a * a) / b) * Math.sin(b * u) - 2 * a * Math.cos(b * u))) / (w * w);
      return F(x) - F(0);
    }
    if (z === 1) return 2 / w - (Math.exp(-w * x) * (2 + w * x)) / w;
    const b = w * Math.sqrt(z * z - 1), r1 = -a + b, r2 = -a - b, c1 = (1 + a / b) / 2, c2 = (1 - a / b) / 2;
    return (c1 * (Math.exp(r1 * x) - 1)) / r1 + (c2 * (Math.exp(r2 * x) - 1)) / r2;
  }

  /** Seconds until the response stays within eps of its target for good. */
  const settleCache = new Map();
  function settle(preset, eps = 0.01) {
    const p = resolve(preset);
    const key = `${p.response}/${p.damping}/${p.soft || 0}/${eps}`;
    if (settleCache.has(key)) return settleCache.get(key);
    let last = 0;
    for (let tau = 0; tau < 20 * p.response; tau += 0.001) {
      if (Math.abs(1 - step(tau, p)) >= eps) last = tau;
    }
    settleCache.set(key, last);
    return last;
  }

  /** One spring from `from` to `to`, released at t0. */
  function spring(t, t0, from, to, preset) {
    return from + (to - from) * step(t - t0, preset);
  }

  /**
   * A value with several targets: the sum of one spring per change, each released at
   * its own time. Springs are never restarted, so a new target mid-flight keeps the
   * velocity of the ones still settling (superposition of a linear system).
   *
   * keys: [[t, value, preset?], ...] sorted by t. The first key is the initial value
   * (its time is ignored). preset per key overrides the default.
   */
  function track(t, keys, preset) {
    let v = keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [ti, vi, pi] = keys[i];
      if (t <= ti) break;           // keys are sorted: nothing later has started
      v += (vi - keys[i - 1][1]) * step(t - ti, pi || preset);
    }
    return v;
  }

  /**
   * A bar/underline/selection moving between stops. Each move is split per edge: the
   * edge travelling in the direction of motion (leading) rides a stiffer spring than
   * the one behind it (trailing), so the indicator stretches mid-move and settles back.
   *
   * stops: [[t, start, end], ...] sorted by t; first stop is the initial state.
   * returns { start, end, size, center }
   */
  function indicator(t, stops, opts = {}) {
    const lead = opts.lead || 'snappy', trail = opts.trail || 'default';
    let s = stops[0][1], e = stops[0][2];
    for (let i = 1; i < stops.length; i++) {
      const [ti, si, ei] = stops[i];
      if (t <= ti) break;
      const ps = stops[i - 1][1], pe = stops[i - 1][2];
      const ds = si - ps, de = ei - pe, dc = ds + de;
      // leading edge = the front one in the direction of travel; pure grow/shrink: both lead
      const sLead = dc <= 0;
      const eLead = dc >= 0;
      s += ds * step(t - ti, sLead ? lead : trail);
      e += de * step(t - ti, eLead ? lead : trail);
    }
    return { start: s, end: e, size: e - s, center: (s + e) / 2 };
  }

  /**
   * Alpha for text living inside a morphing box. It enters `delay` after the morph
   * starting at tIn, and has fully left by tOut (when the next morph starts), so the
   * text is never visible while its container changes shape underneath it.
   */
  function swapAlpha(t, tIn, tOut = Infinity, opts = {}) {
    const preset = opts.preset || 'snappy';
    const delay = opts.delay == null ? 0.06 : opts.delay;
    const lead = opts.lead == null ? settle(preset, 0.005) : opts.lead;
    const a = step(t - (tIn + delay), preset) - step(t - (tOut - lead), preset);
    return Math.min(1, Math.max(0, a));
  }

  /**
   * Time inside a loop of length dur. t = dur (and anything within half a frame of it)
   * pins to 0, so the last frame of a rendered loop is the first frame.
   */
  function loopT(t, dur, fps) {
    let u = t % dur;
    if (u < 0) u += dur;
    const snap = fps ? 0.5 / fps : 1e-9;
    if (dur - u <= snap) u = 0;
    return u;
  }

  // ---------------------------------------------------------------- physics as a function of t
  // A spring has a closed form; a chain of dominoes, a falling stack of cards or a swarm does not. sim() runs such a
  // system at a fixed step and hides it behind at(t): the state at t is replayed from the nearest stored checkpoint at
  // or before t. The same t gives the same state in any frame order, after any other frame and in any worker, so shutter
  // subframes, --verify and parallel chunks agree. This is the one sanctioned exception to "no state between frames":
  // the state lives inside the sim and is rebuilt from t, never carried over from the previous painted frame.

  function plain(v, where) {   // state must be plain data: it is cloned at every checkpoint
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function') throw new Error(`sim state ${where} is a function: keep only data in the state`);
      return;
    }
    if (ArrayBuffer.isView(v)) return;
    if (Array.isArray(v)) { v.forEach((x, i) => plain(x, `${where}[${i}]`)); return; }
    const p = Object.getPrototypeOf(v);
    if (p !== Object.prototype && p !== null) throw new Error(`sim state ${where} is a ${v.constructor && v.constructor.name}: plain objects, arrays and typed arrays only`);
    for (const k of Object.keys(v)) plain(v[k], `${where}.${k}`);
  }
  function dclone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (ArrayBuffer.isView(v)) return v.slice();
    if (Array.isArray(v)) return v.map(dclone);
    const o = {};
    for (const k of Object.keys(v)) o[k] = dclone(v[k]);
    return o;
  }
  // a → b by k, numbers only; the structure (and every non-number) comes from b, the later step
  function dlerp(a, b, k) {
    if (typeof b === 'number') return typeof a === 'number' ? a + (b - a) * k : b;
    if (b === null || typeof b !== 'object') return b;
    if (ArrayBuffer.isView(b)) {
      const o = b.slice();
      if (a && a.length === b.length) for (let i = 0; i < o.length; i++) o[i] = a[i] + (b[i] - a[i]) * k;
      return o;
    }
    if (Array.isArray(b)) return b.map((x, i) => dlerp(Array.isArray(a) ? a[i] : undefined, x, k));
    const o = {};
    for (const key of Object.keys(b)) o[key] = dlerp(a && typeof a === 'object' ? a[key] : undefined, b[key], k);
    return o;
  }

  /**
   * sim({ init, tick, step, every, from, lerp }) → { at(t), raw(t), events(t1), steps }
   *   init()                   → the state at sim time 0: plain data (numbers, arrays, typed arrays, plain objects)
   *   tick(s, dt, t, emit)     mutates s by one fixed step dt; t = time at the start of the step (film seconds);
   *                            emit(name, data) logs an event (an impact, a domino hitting the next) — see events()
   *   step 1/240 s             4 steps per 60 fps frame; stiff contacts may want 1/480
   *   every 0.5 s              checkpoint spacing: a random-order frame replays at most this much
   *   from 0                   film second the sim starts at; before it at(t) is the initial state
   *   lerp true                at(t) blends the two steps around t (numbers only) so shutter subframes move smoothly
   * at(t) and raw(t) return fresh copies; raw(t) is the step at or before t without blending (counters, flags).
   * events(t1) runs the sim up to t1 and returns [{ t, name, ...data }] sorted by time — sound cues for impacts.
   * Rules for tick: randomness only from a seed kept IN the state (Motion.rand(s)); no Math.random, no Date, no outside
   * mutable variables (read constants and t only). Angles stay unwrapped: blending 359° → 1° goes the long way round.
   * Cost: the first at(t) in a fresh worker replays from 0 to t (a 30 s film at 1/240 is 7 200 ticks), then forward
   * frames continue from the last state and a jump back starts from a checkpoint.
   */
  function sim(o) {
    if (!o || typeof o.init !== 'function' || typeof o.tick !== 'function') throw new Error('sim needs init() and tick(s, dt, t)');
    const h = o.step ?? 1 / 240, from = o.from ?? 0, smooth = o.lerp !== false;
    const N = Math.max(1, Math.round((o.every ?? 0.5) / h));   // steps between checkpoints
    const s0 = o.init();
    plain(s0, 'init()');
    const cps = [dclone(s0)];       // cps[k] = state at step k·N; private, never handed out
    const log = [];
    let logged = 0;                 // steps [0, logged) have had their events recorded (a step emits once, on its first run)
    let cur = null, curI = -1;      // the last replayed state (private): a forward frame continues from it
    const noop = () => {};

    function stateAt(i) {
      const j = Math.min(Math.floor(i / N), cps.length - 1);
      if (!(cur && curI <= i && curI >= j * N)) { cur = dclone(cps[j]); curI = j * N; }
      while (curI < i) {
        const fresh = curI >= logged, at = from + curI * h, stepNo = curI;
        const emit = fresh ? (name, data) => log.push({ t: from + (stepNo + 1) * h, name: String(name), ...(data || {}) }) : noop;
        o.tick(cur, h, at, emit);
        curI++;
        if (fresh) logged = curI;
        if (curI % N === 0 && curI / N === cps.length) cps.push(dclone(cur));
      }
      return cur;
    }
    function index(t) {
      let x = Math.max(0, (t - from) / h);
      const r = Math.round(x);
      if (Math.abs(x - r) < 1e-6) x = r;   // 1/60 ÷ 1/240 must land on step 4, not 3.9999999
      return x;
    }
    return {
      at(t) {
        const x = index(t), i = Math.floor(x), k = x - i;
        if (!smooth || k === 0) return dclone(stateAt(i));
        const a = dclone(stateAt(i));
        return dlerp(a, stateAt(i + 1), k);
      },
      raw(t) { return dclone(stateAt(Math.floor(index(t)))); },
      events(t1) {
        if (!Number.isFinite(t1)) throw new Error('sim.events(t1) needs an end time');
        stateAt(Math.ceil(index(t1)));
        return log.filter((e) => e.t <= t1 + 1e-9).map((e) => ({ ...e }));
      },
      get steps() { return { step: h, every: N * h, checkpoints: cps.length }; },
    };
  }

  /** Seeded random for sim state: advances s[key] (an integer seed kept in the state) and returns [0, 1). mulberry32. */
  function rand(s, key = 'seed') {
    const a = (s[key] = (s[key] + 0x6d2b79f5) | 0);
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- camera paths
  function path1(t, ts, ps, free) {
    const n = ts.length;
    if (n === 1 || t <= ts[0]) return ps[0];
    if (t >= ts[n - 1]) return ps[n - 1];
    let i = 0;
    while (t >= ts[i + 1]) i++;
    const slope = (j) => (ps[j + 1] - ps[j]) / (ts[j + 1] - ts[j]);
    const tan = (j) => {
      if (j === 0) return free ? slope(0) : 0;
      if (j === n - 1) return free ? slope(n - 2) : 0;
      const d0 = slope(j - 1), d1 = slope(j);
      if (d0 * d1 <= 0) return 0;                         // a turn or a hold: stop on the key, never overshoot it
      const h0 = ts[j] - ts[j - 1], h1 = ts[j + 1] - ts[j];
      const m = (d0 * h1 + d1 * h0) / (h0 + h1);          // time-weighted mean of the two slopes
      const lim = 3 * Math.min(Math.abs(d0), Math.abs(d1)); // Fritsch–Carlson: stays monotone between keys
      return Math.sign(m) * Math.min(Math.abs(m), lim);
    };
    const dt = ts[i + 1] - ts[i], u = (t - ts[i]) / dt, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ps[i] + (u3 - 2 * u2 + u) * dt * tan(i) + (-2 * u3 + 3 * u2) * ps[i + 1] + (u3 - u2) * dt * tan(i + 1);
  }

  /**
   * A smooth path through timed keys [[t, value], ...] (seconds, increasing); value = a number, an array or a flat
   * object of numbers (a field missing from a key holds its previous value). C¹ cubic Hermite: through every key exactly, the
   * velocity at a key is the time-weighted mean of the neighbouring slopes, zero at a turn and at a hold (no overshoot
   * past a key), zero at both ends — a camera starts and lands at rest. opts.ends 'free' keeps the end slopes instead
   * (a flight that is already moving when the shot cuts in or out). Before the first key → the first value.
   *   path(t, [[0, { x: 0, y: 1, z: 9 }], [2.5, { x: 3, y: 4, z: 5 }], [6, { x: 0, y: 30, z: 2 }]])
   */
  function path(t, keys, opts = {}) {
    if (!keys || !keys.length) throw new Error('path needs keys [[t, value], ...]');
    const ts = keys.map((k) => k[0]);
    for (let i = 1; i < ts.length; i++) if (!(ts[i] > ts[i - 1])) throw new Error(`path keys must be in increasing time: key ${i} at ${ts[i]} after ${ts[i - 1]}`);
    const free = opts.ends === 'free', v0 = keys[0][1];
    if (typeof v0 === 'number') return path1(t, ts, keys.map((k) => k[1]), free);
    if (Array.isArray(v0)) return v0.map((_, j) => { let last = v0[j]; return path1(t, ts, keys.map((k) => (last = k[1][j] ?? last)), free); });
    const out = {};
    for (const f of Object.keys(v0)) {
      let last = v0[f];
      out[f] = path1(t, ts, keys.map((k) => (last = k[1][f] ?? last)), free);
    }
    return out;
  }

  return { PRESETS, ROLES, configure, resolve, step, settle, spring, track, indicator, swapAlpha, loopT, sim, rand, path };
});
