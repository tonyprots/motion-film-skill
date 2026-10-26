// Native ports: RenderComp KPI (Copyright 2026 Trimora Inc.), RemotionUI (2026), Onda (2026 Rodrigo Botelho), MIT.
// HyperFrames chart/wipe: Copyright 2026 HeyGen, Inc., Apache-2.0. Full grants: LICENSE-rendercomp,
// LICENSE-remotion-ui, LICENSE-onda, LICENSE-hyperframes. Modified for pure C.seek, local data and format reflow.
// React, external fonts, GSAP callbacks, sample facts and global clocks are intentionally absent.
(function (host, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (host.C) host.BLOCKS = api;
})(globalThis, function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = (x) => 1 - (1 - clamp(x)) ** 5;
  // Adapted from RenderComp's wheelPos: stable decimal places, mechanical carry, no per-frame unit changes.
  function wheelPos(value, place) {
    const q = Math.max(0, value) / 10 ** place, whole = Math.floor(q), frac = q - whole;
    return whole % 10 + (place === 0 ? frac : clamp(frac * 10 - 9));
  }
  function validateKeys(keys) {
    if (!Array.isArray(keys) || !keys.length || keys.some((k) => !Array.isArray(k) || !Number.isFinite(k[1]) || !Number.isFinite(C.bt(k[0])))) throw new Error('animation keys need finite values and valid marks');
  }
  function sample(t, keys, duration = 0.8) {
    validateKeys(keys);
    let value = keys[0][1];
    for (let i = 1; i < keys.length; i++) value += (keys[i][1] - keys[i - 1][1]) * ease((t - C.bt(keys[i][0])) / duration);
    return value;
  }
  function frame(parent, o, height) {
    if (!o.id || document.querySelector(`[data-block="${CSS.escape(o.id)}"]`)) throw new Error('block id must be unique');
    const w = o.w ?? C.pick(1400, 880, 840), root = C.reg(C.el('div', { class: 'abs', 'data-block': o.id,
      style: `width:${w}px;height:${height}px;font-family:UI,Arial,sans-serif;color:var(--ink);font-variant-numeric:tabular-nums` }, parent),
    { x: o.x ?? (C.W - w) / 2, y: o.y ?? (C.H - height) / 2 - C.pick(0, 0, 100) });
    const text = (s, role, style = '') => {
      const el = C.el('div', { ...(role ? { 'data-role': role } : {}), style }, root);
      el.textContent = s;
      return el;
    };
    const title = text(o.label || '', 'label', 'font-size:40px;font-weight:600;line-height:1.2;margin-bottom:32px');
    return { root, w, text, title };
  }
  function counter(parent, o) {
    const dec = o.decimals ?? 0;
    if (![o.from ?? 0, o.to].every((x) => Number.isFinite(x) && x >= 0 && x < 1e10) || !Number.isInteger(dec) || dec < 0 || dec > 2) throw new Error('counter needs non-negative from/to below 1e10 and decimals 0..2');
    const power = 10 ** dec, from = Math.round((o.from ?? 0) * power) / power, to = Math.round(o.to * power) / power;
    const f = frame(parent, o, 330);
    const template = (Math.max(from, to)).toFixed(dec), digits = template.replace('.', '').length;
    const font = Math.min(o.fontSize ?? C.pick(190, 150, 150), f.w / (digits * 0.62 + (dec ? 0.26 : 0)));
    if (font < 72) throw new Error('number needs more space or a shorter display unit');
    const cell = font * 1.2, group = C.el('div', { 'data-role': 'number', style: `display:flex;align-items:flex-start;font-size:${font}px;font-weight:600;line-height:${cell}px;height:${cell}px` }, f.root);
    const slots = [];
    const fixed = (s) => { const n = C.el('span', { 'data-number-static': '', style: `display:block;line-height:${cell}px` }, group); n.textContent = s; };
    if (o.prefix) fixed(o.prefix);
    let digitIndex = 0;
    for (const char of template) {
      if (char === '.') { fixed(o.decimalSeparator ?? ','); continue; }
      const box = C.el('span', { 'data-digit-window': '', style: `position:relative;display:block;overflow:hidden;width:${font * 0.62}px;height:${cell}px` }, group);
      const strip = C.reg(C.el('span', { class: 'abs', style: 'width:100%' }, box));
      for (let i = 0; i <= 10; i++) {
        const n = C.el('span', { 'data-digit': '', style: `display:block;height:${cell}px;line-height:${cell}px;text-align:center` }, strip);
        n.textContent = i % 10;
      }
      slots.push({ box, strip, place: digits - 1 - digitIndex++ });
    }
    if (o.suffix) fixed(o.suffix);
    const plain = C.el('div', { 'data-role': 'plain-number', style: `display:none;font-size:${font}px;line-height:${cell}px;font-weight:600` }, f.root);
    const mode = o.mode || 'spring';
    if (!['plain', 'spring', 'drum'].includes(mode)) throw new Error('counter mode must be plain, spring or drum');
    return { ...f, number: group, draw(t, keys = [[0, from], [o.at, to]]) {
      validateKeys(keys);
      keys = keys.map(([at, v]) => [at, Math.round(v * power) / power]);
      let value = mode === 'spring' ? C.trk(t, keys, 'text') : sample(t, keys, o.duration ?? 1.4);
      value = clamp(value, Math.min(from, to), Math.max(from, to));
      const units = value * power;
      group.style.display = mode === 'drum' ? 'flex' : 'none';
      plain.style.display = mode === 'drum' ? 'none' : 'block';
      plain.textContent = `${o.prefix || ''}${value.toFixed(dec).replace('.', o.decimalSeparator ?? ',')}${o.suffix || ''}`;
      slots.forEach(({ box, strip, place }, i) => {
        const visible = units >= 0.9 * 10 ** place || place <= dec || i === digits - 1;
        box.style.visibility = visible ? '' : 'hidden';
        C.put(strip, { y: -wheelPos(units, place) * cell });
      });
      return value;
    } };
  }
  // RemotionUI's slots are arithmetic: departures close their source, the landing target is static at move time.
  function board(parent, o) {
    if (o.mode && o.mode !== 'reflow') throw new Error('board supports reflow mode only');
    const columns = o.columns, cards = o.cards;
    if (!Array.isArray(columns) || columns.length < 2 || columns.length > 3 || !Array.isArray(cards) || !cards.length || cards.length > 8) throw new Error('board needs 2–3 columns and 1–8 cards');
    const portrait = C.H > C.W;
    const capacity = columns.map((_, col) => cards.filter((c) => c.column === col || c.to === col).length);
    const sections = capacity.map((n) => 58 + Math.max(1, n) * (portrait ? 84 : 116) + 24);
    const height = 94 + (portrait ? sections.reduce((a, b) => a + b, 0) : Math.max(...sections));
    if (height > C.H * (portrait ? 0.68 : 0.8)) throw new Error('board is too dense; use fewer cards or split the scene');
    const f = frame(parent, o, height);
    const gutter = 24, columnW = portrait ? f.w : (f.w - gutter * (columns.length - 1)) / columns.length;
    const cardH = portrait ? 68 : 100, gap = 16, header = 58;
    const when = (c) => c.at == null ? Infinity : C.bt(c.at);
    cards.forEach((c) => {
      if (!Number.isInteger(c.column) || c.column < 0 || c.column >= columns.length || (c.to != null && (!Number.isInteger(c.to) || c.to < 0 || c.to >= columns.length || c.to === c.column || !Number.isFinite(when(c))))) throw new Error('invalid card column or move');
    });
    if (new Set(cards.map((c) => c.id)).size !== cards.length || cards.some((c) => typeof c.id !== 'string' || !c.id)) throw new Error('card ids must be unique non-empty strings');
    const pos = (col, row) => portrait ? { x: 0, y: 94 + sections.slice(0, col).reduce((a, b) => a + b, 0) + header + row * (cardH + gap) }
      : { x: col * (columnW + gutter), y: 94 + header + row * (cardH + gap) };
    const heads = columns.map((s, i) => {
      const p = pos(i, 0), n = f.text(s, null, `position:absolute;left:${p.x}px;top:${p.y - header}px;font-size:32px;font-weight:600;z-index:30;background:var(--bg);padding:0 12px 8px 0`);
      const count = f.text('', `count-${i}`, `position:absolute;left:${p.x + columnW - 50}px;top:${p.y - header}px;font-size:32px;z-index:30;background:var(--bg);padding-bottom:8px`);
      return { n, count };
    });
    const nodes = cards.map((c) => {
      const n = C.reg(C.el('div', { class: 'abs', 'data-card': c.id, style: `box-sizing:border-box;width:${columnW}px;height:${cardH}px;border:2px solid #c8cdd2;border-left:6px solid var(--accent);border-radius:14px;background:var(--card);padding:16px;font-size:32px;font-weight:500` }, f.root));
      n.textContent = c.title;
      return n;
    });
    const progress = (c, t) => c.to == null ? 0 : ease((t - when(c)) / (o.duration ?? 0.85));
    return { ...f, draw(t) {
      cards.forEach((c, i) => {
        const p = progress(c, t), reflow = true;
        const fromRow = cards.slice(0, i).filter((a) => a.column === c.column).reduce((sum, a) => sum + (reflow ? 1 - progress(a, t) : 1), 0);
        const residents = cards.filter((a) => a.column === c.to).reduce((sum, a) => sum + (reflow ? 1 - progress(a, t) : 1), 0);
        const arrivals = cards.filter((a, j) => a !== c && a.to === c.to && (when(a) < when(c) || (when(a) === when(c) && j < i))).reduce((sum, a) => sum + progress(a, t), 0);
        const a = pos(c.column, fromRow), b = pos(c.to ?? c.column, c.to == null ? fromRow : residents + arrivals);
        const lift = Math.sin(Math.PI * p);
        C.put(nodes[i], { x: C.lerp(a.x, b.x, p), y: C.lerp(a.y, b.y, p) - lift * 24,
          s: 1 + lift * 0.025, css: { zIndex: lift > 0.01 ? '20' : '1', boxShadow: `0 ${4 + lift * 14}px ${12 + lift * 20}px #11182718` } });
      });
      heads.forEach(({ count }, i) => { count.textContent = cards.filter((c) => (progress(c, t) >= 0.5 && c.to != null ? c.to : c.column) === i).length; });
    } };
  }
  function chart(parent, o) {
    const data = o.data;
    if (!Array.isArray(data) || data.length < 2 || data.length > 6 || data.some((d) => !Number.isFinite(d.value) || d.value < 0)) throw new Error('chart needs 2–6 non-negative finite data points');
    const max = o.max ?? Math.max(1, ...data.map((d) => d.value));
    if (!Number.isFinite(max) || max <= 0 || data.some((d) => d.value > max)) throw new Error('chart max must be positive and cover all data');
    const w = o.w ?? C.pick(1200, 840, 840), f = frame(parent, { ...o, w }, w * 430 / 800 + 160), NS = 'http://www.w3.org/2000/svg';
    const stage = document.createElementNS(NS, 'svg'); stage.setAttribute('viewBox', '0 0 800 430');
    stage.style.cssText = `width:${f.w}px;height:${f.w * 430 / 800}px;overflow:visible;font:32px UI,Arial,sans-serif;fill:var(--ink)`;
    f.root.appendChild(stage);
    const el = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; stage.appendChild(n); return n; };
    const plotBottom = 320, plotH = 240, cell = 720 / data.length, barW = Math.min(90, cell - 24), firstMax = data.findIndex((d) => d.value === Math.max(...data.map((v) => v.value)));
    el('line', { x1: 40, x2: 760, y1: plotBottom, y2: plotBottom, stroke: '#c8cdd2', 'stroke-width': 2 });
    const horizontal = o.layout === 'horizontal';
    const bars = data.map((d, i) => {
      const x = 40 + i * cell + cell / 2;
      const row = 34 + i * (340 / data.length);
      const bar = el('rect', { x: horizontal ? 190 : x - barW / 2, y: horizontal ? row : plotBottom,
        width: horizontal ? 0 : barW, height: horizontal ? 40 : 0, rx: 8, fill: o.colors?.[i] || (i === firstMax ? 'var(--accent)' : '#aeb7c0') });
      const value = el('text', { x: horizontal ? 780 : x, y: horizontal ? row + 32 : plotBottom - 14,
        'text-anchor': horizontal ? 'end' : 'middle', 'font-size': 32 });
      el('text', { x: horizontal ? 170 : x, y: horizontal ? row + 32 : plotBottom + 52,
        'text-anchor': horizontal ? 'end' : 'middle', 'font-size': 30 }, d.label);
      return { bar, value, x };
    });
    const line = el('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 5, d: '' });
    const total = f.text('', 'value', 'font-size:40px;font-weight:600;margin-top:16px');
    return { ...f, draw(t, keys) {
      const p = clamp(sample(t, keys, o.duration ?? 1.6)), points = [];
      bars.forEach(({ bar, value, x }, i) => {
        const phase = o.mode === 'together' ? p : ease((p - i * 0.09) / (1 - i * 0.09));
        const amount = data[i].value * phase, y = plotBottom - amount / max * plotH;
        if (horizontal) bar.setAttribute('width', amount / max * 480);
        else { bar.setAttribute('height', plotBottom - y); bar.setAttribute('y', y); }
        bar.style.display = o.mode === 'line' ? 'none' : '';
        if (!horizontal) value.setAttribute('y', y - 14);
        value.textContent = `${amount.toFixed(o.decimals ?? 0)}${o.unit || ''}`;
        points.push(`${x},${y}`);
      });
      line.setAttribute('d', o.mode === 'line' ? `M${points.join('L')}` : '');
      total.textContent = o.summary === 'total' ? `${o.summaryLabel || ''}${Math.round(data.reduce((s, d) => s + d.value, 0) * p)}${o.unit || ''}` : '';
      stage.style.display = 'none'; stage.getBoundingClientRect(); stage.style.display = '';
    } };
  }
  // HyperFrames before-after-wipe: one scalar owns both the clipping boundary and the divider.
  function wipe(parent, o) {
    const media = !!(o.beforeSrc && o.afterSrc), padding = media ? 0 : 44;
    const mode = o.mode ?? (media ? 'wipe' : 'cut');
    if (mode === 'wipe' && !media) throw new Error('a text comparison uses cut; wipe requires beforeSrc and afterSrc');
    const f = frame(parent, o, 500), h = 340, before = C.el('div', { style: `position:relative;box-sizing:border-box;height:${h}px;padding:${padding}px;border:2px solid #c8cdd2;border-radius:20px;background:var(--card);font-size:44px;line-height:1.4;white-space:pre-line;overflow:hidden` }, f.root);
    if (media) C.el('img', { src:o.beforeSrc,style:'width:100%;height:100%;object-fit:contain' },before); else before.textContent = o.before;
    const after = C.el('div', { style: `position:absolute;box-sizing:border-box;left:0;top:0;width:100%;height:${h}px;padding:${padding}px;border-radius:20px;background:var(--bg);color:var(--ink);clip-path:inset(0 100% 0 0)` }, before);
    if (media) C.el('img', { src:o.afterSrc,style:'width:100%;height:100%;object-fit:contain' },after); else after.textContent = o.after;
    const divider = C.el('div', { style: 'position:absolute;top:0;bottom:0;width:4px;background:var(--ink)' }, before);
    const state = f.text('', 'value', 'font-size:32px;margin-top:24px');
    return { ...f, draw(t, keys) {
      const p = clamp(sample(t, keys, o.duration ?? 1.1)), split = mode === 'cut' ? (p >= 0.5 ? 1 : 0) : p;
      after.style.clipPath = `inset(0 ${(1 - split) * 100}% 0 0)`; divider.style.left = `${split * 100}%`;
      divider.style.visibility = split <= 0 || split >= 1 ? 'hidden' : 'visible';
      state.textContent = split === 0 ? (o.beforeLabel || '') : split === 1 ? (o.afterLabel || '') : '';
      f.root.style.display = 'none'; f.root.getBoundingClientRect(); f.root.style.display = '';
    } };
  }
  const makers = { 'rolling-number': counter, 'kanban-flow': board, 'data-chart': chart, 'before-after': wipe };
  return { kinds: Object.keys(makers), wheelPos, mount(parent, kind, o) {
    if (!makers[kind]) throw new Error(`unknown block: ${kind}`);
    if (o.duration != null && (!Number.isFinite(o.duration) || o.duration <= 0)) throw new Error('duration must be positive finite seconds');
    return makers[kind](parent, o);
  } };
});
