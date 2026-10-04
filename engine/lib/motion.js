// Closed-form springs. Every function is a pure function of time (seconds):
// no integration, no state, so any frame can be painted in any order.
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
  const PRESETS = {
    snappy:  { response: 0.22, damping: 0.8 },   // ~1.5% overshoot · buttons, toggles, leading edges
    default: { response: 0.4,  damping: 0.86 },  // ~0.5% overshoot · cards, containers, camera
    heavy:   { response: 0.5,  damping: 1.0 },   // none (critical)  · big type, logo lockups
    playful: { response: 0.5,  damping: 0.45 },  // ~20% overshoot   · mascots only
  };

  function resolve(p) {
    if (p == null) return PRESETS.default;
    if (typeof p === 'string') {
      const r = PRESETS[p];
      if (!r) throw new Error(`motion: unknown preset "${p}"`);
      return r;
    }
    return p;
  }

  /** Unit step response of a spring released τ seconds ago. 0 for τ ≤ 0. */
  function step(tau, preset) {
    if (!(tau > 0)) return 0;
    const { response, damping: z } = resolve(preset);
    const w = (2 * Math.PI) / response;
    if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
    }
    if (z === 1) return 1 - Math.exp(-w * tau) * (1 + w * tau);
    const wd = w * Math.sqrt(z * z - 1);   // overdamped
    return 1 - Math.exp(-z * w * tau) * (Math.cosh(wd * tau) + ((z * w) / wd) * Math.sinh(wd * tau));
  }

  /** Seconds until the response stays within eps of its target for good. */
  const settleCache = new Map();
  function settle(preset, eps = 0.01) {
    const p = resolve(preset);
    const key = `${p.response}/${p.damping}/${eps}`;
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

  return { PRESETS, step, settle, spring, track, indicator, swapAlpha, loopT };
});
