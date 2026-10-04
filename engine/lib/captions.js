// Burned-in captions, word for word with the voice (motion-film). Data: window.CAPS from captions.json via sync.mjs:
//   [["s2a.1", "We read 1 200 reviews."], ["s2a.2", "Here is what matters."], …]
// Each entry starts on a timeline mark (usually a speech chunk <id>.<k> from layout_vo.py) and stays until the next
// entry of the same phrase, or until the phrase ends + 0.6 beat (the last entry too: it must not hang over the next scene). "|" splits an entry into consecutive captions,
// timed by letter count. Screen spelling may differ from the voice (digits on screen, words in the voice).
// Usage in film.js, before C.start():   CAPTIONS.scene({ x, y, w, size })   — size in px, two lines max.
(() => {
  const { scene, reg, put, el, sp, spHit, beatOf, pick, W, H } = C;
  const take = (k) => k.split('.')[0];
  const endOf = (k) => { try { return beatOf(`${take(k)}.end`) + 0.6; } catch { return beatOf(k) + 4; } };
  function items(CAPS) {
    const out = [];
    CAPS.forEach(([k, txt], i) => {
      const next = CAPS[i + 1], own = endOf(k);
      const end = next && take(next[0]) === take(k) ? beatOf(next[0]) : next ? Math.min(own, beatOf(next[0])) : own;
      const parts = txt.replace(/ —/g, ' —').split('|'), at = beatOf(k), span = end - at, n = txt.replace(/\|/g, '').length;
      let acc = 0;
      parts.forEach((p, j) => {
        const a = at + span * (acc / n); acc += p.length;
        out.push({ at: a, end: j < parts.length - 1 ? at + span * (acc / n) : end, txt: p });
      });
    });
    return out;
  }
  window.CAPTIONS = {
    scene(o = {}) {
      const box = { x: o.x ?? pick(140, 90, 90), w: o.w ?? pick(W - 280, W - 180, W - 180), size: o.size ?? pick(52, 52, 56) };
      box.y = o.y ?? pick(H - 180, H - 230, H - 516);   // 9:16: above the platform UI zone (bottom 20 %)
      const CAPT = items(window.CAPS || []);
      return scene({
        name: 'captions', from: 0, to: 'done', ...(o.scene || {}),
        build(root, S) {
          const hgt = Math.round(box.size * 1.22 * 2) + 8;
          S.items = CAPT.map((c) => {
            const clip = el('div', { class: 'cap', style: `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${hgt}px` }, root);
            const inner = el('div', { class: 'abs', style: `left:0;top:0;width:${box.w}px;font:500 ${box.size}px/1.22 UI;letter-spacing:-0.012em;color:${o.color || 'var(--ink)'}` }, clip, c.txt);
            return { inner: reg(inner, { y: hgt, hide: true }), c, hgt };
          });
        },
        run(t, b, S) {   // the line rises into its slot on the chunk and leaves upward: no fades
          for (const q of S.items) {
            if (b < q.c.at - 1 || b > q.c.end + 1) continue;
            const pin = spHit(t, q.c.at, 'snappy'), pout = sp(t, q.c.end - 0.3, 'snappy');
            put(q.inner, { y: q.hgt * (1 - pin) - q.hgt * pout, hide: pin < 0.001 || pout > 0.999 });
          }
        },
      });
    },
  };
})();
