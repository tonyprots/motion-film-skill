// Local, licensed SVG assets bundled by sync.mjs. Network and active SVG content are never loaded by this helper.
(() => {
  function icon(parent, id, o = {}) {
    const source = (window.SVG_ASSETS || {})[id];
    if (!source) throw new Error(`unknown local SVG: ${id}; search the scene catalog, then run sync.mjs`);
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.localName !== 'svg' || doc.querySelector('parsererror,script,style,foreignObject,iframe')) throw new Error('invalid or active SVG');
    for (const node of [svg, ...svg.querySelectorAll('*')]) for (const a of node.attributes) {
      if (/^on/i.test(a.name) || /^(href|src)$/i.test(a.localName) || /url\s*\(|@import/i.test(a.value)) throw new Error('external or active SVG reference');
    }
    const size = o.size ?? 120;
    if (!Number.isFinite(size) || size <= 0) throw new Error('icon size must be positive');
    const root = C.reg(C.el('div', { class: 'abs', 'data-icon': id,
      style: `width:${size}px;height:${size}px;color:${o.color || 'var(--ink)'}` }, parent), { x:o.x ?? 0, y:o.y ?? 0 });
    const image = document.importNode(svg, true);
    image.setAttribute('width', '100%'); image.setAttribute('height', '100%');
    root.appendChild(image);
    return root;
  }
  window.GRAPHICS = { icon, ids: () => Object.keys(window.SVG_ASSETS || {}).sort() };
})();
