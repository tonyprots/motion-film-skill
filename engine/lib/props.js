// Small, content-free scene recipes. Reuse a visual verb, never a product's UI or an invented fact.
// mount() builds once; draw(t, keys) paints every observable value from time, including after a backwards seek.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const KINDS = ['accumulate', 'meter', 'compare', 'connect', 'reveal', 'assemble'];
  function svg(tag, attrs, parent, text) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text != null) node.textContent = text;
    parent.appendChild(node);
    return node;
  }
  function mount(parent, kind, o = {}) {
    if (!KINDS.includes(kind)) throw new Error(`unknown prop kind: ${kind}`);
    if (!o.id || document.querySelector(`[data-prop="${CSS.escape(o.id)}"]`)) throw new Error('prop id must be unique');
    const w = o.w ?? C.pick(1100, 840, 840), h = w / 2;
    const root = C.reg(C.el('div', { class: 'abs', 'data-prop': o.id,
      style: `width:${w}px;height:${h}px` }, parent),
    { x: o.x ?? (C.W - w) / 2, y: o.y ?? (C.H - h) / 2 - C.pick(0, 0, 120) });
    const stage = svg('svg', { viewBox: '0 0 800 400', width: '100%', height: '100%',
      style: 'overflow:visible;font:500 32px UI,Arial,sans-serif;fill:var(--ink);font-variant-numeric:tabular-nums' }, root);
    const box = (x, y, width, height, extra = {}) => svg('rect', { x, y, width, height, rx: 12,
      fill: 'var(--card)', stroke: 'var(--ink-2)', 'stroke-width': 2, ...extra }, stage);
    const text = (x, y, value, extra = {}) => svg('text', { x, y, ...extra }, stage, value);
    text(40, 48, o.label || '', { 'font-size': 32 });
    const value = text(40, 370, '', { 'data-role': 'value', 'font-size': 64 });
    const max = o.max ?? (kind === 'accumulate' ? 6 : ['connect', 'reveal', 'assemble'].includes(kind) ? 1 : 100);
    if (!Number.isFinite(max) || max <= 0) throw new Error('prop max must be positive');
    let paint;
    if (kind === 'accumulate') {
      if (!Number.isInteger(max) || max > 24) throw new Error('accumulate max must be an integer from 1 to 24');
      const cols = Math.min(max, 8), nodes = Array.from({ length: max }, (_, i) =>
        box(40 + (i % cols) * 90, 90 + Math.floor(i / cols) * 65, 64, 48));
      paint = (v) => {
        const count = Math.round(v);
        nodes.forEach((n, i) => n.setAttribute('fill', i < count ? 'var(--accent)' : 'var(--card)'));
        value.textContent = `${count}${o.unit || ''}`;
      };
    } else if (kind === 'meter' || kind === 'compare') {
      const y = kind === 'compare' ? 110 : 170;
      box(40, y, 720, 64);
      const bar = box(40, y, 0, 64, { fill: 'var(--accent)', stroke: 'none', 'data-role': 'fill' });
      if (kind === 'compare') {
        const baseline = o.baseline ?? max;
        if (!Number.isFinite(baseline) || baseline < 0 || baseline > max) throw new Error('baseline outside prop range');
        box(40, 220, 720 * baseline / max, 64, { fill: 'var(--ink-2)', stroke: 'none' });
        text(50, 265, o.reference || String(baseline), { fill: 'var(--card)' });
      }
      paint = (v) => { bar.setAttribute('width', 720 * v / max); value.textContent = `${Math.round(v)}${o.unit || ''}`; };
    } else if (kind === 'connect') {
      svg('circle', { cx: 140, cy: 195, r: 65, fill: 'var(--card)', stroke: 'var(--ink-2)', 'stroke-width': 2 }, stage);
      svg('circle', { cx: 660, cy: 195, r: 65, fill: 'var(--card)', stroke: 'var(--ink-2)', 'stroke-width': 2 }, stage);
      text(140, 205, o.left || 'A', { 'text-anchor': 'middle' });
      text(660, 205, o.right || 'B', { 'text-anchor': 'middle' });
      const link = svg('path', { d: '', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 12, 'data-role': 'link' }, stage);
      paint = (v) => { link.setAttribute('d', `M210 195H${210 + 380 * v / max}`); value.textContent = `${Math.round(v / max * 100)}%`; };
    } else if (kind === 'reveal') {
      box(40, 100, 720, 160);
      text(70, 195, o.detail || '', { 'font-size': 44 });
      const mask = box(40, 100, 720, 160, { 'data-role': 'cover', fill: 'var(--ink-2)', stroke: 'none' });
      paint = (v) => { mask.setAttribute('width', 720 * (1 - v / max)); value.textContent = v / max >= 0.995 ? (o.result || o.detail || '') : (o.initial || '?'); };
    } else {
      const tiles = Array.from({ length: 4 }, () => box(0, 0, 130, 90));
      const labels = (o.parts || []).map((label, i) => text(0, 0, label, { 'font-size': 28, 'text-anchor': 'middle' }));
      if (labels.length > 4) throw new Error('assemble takes up to four part labels');
      paint = (v) => {
        const gap = 18 + 38 * (1 - v / max);
        tiles.forEach((node, i) => {
          const x = 400 + (i % 2 ? 1 : -1) * (65 + gap / 2) - 65;
          const y = 182 + (i < 2 ? -1 : 1) * (45 + gap / 2) - 45;
          node.setAttribute('x', x); node.setAttribute('y', y);
          if (labels[i]) { labels[i].setAttribute('x', x + 65); labels[i].setAttribute('y', y + 56); }
        });
        value.textContent = v / max >= 0.995 ? (o.result || '') : (o.initial || '');
      };
    }
    return { root, value, draw(t, keys) {
      const v = C.clamp(C.trk(t, keys, o.role || 'text'), 0, max);
      paint(v);
      // Chromium's incremental SVG repaint can retain AA pixels at an old geometry edge. Invalidate its layout so
      // intermediate frames, not just settled states, are bit-identical after a backwards seek (--verify).
      if (['meter', 'compare', 'connect', 'reveal'].includes(kind)) {
        stage.style.display = 'none'; stage.getBoundingClientRect(); stage.style.display = '';
      }
      return v;
    } };
  }
  window.PROPS = { kinds: KINDS, mount };
})();
