// Burned-in captions, word for word with the voice (motion-film). Data: window.CAPS from captions.json via sync.mjs:
//   [["s2a.1", "We read 1 200 reviews."], ["s2a.2", "Here is what matters."], …]
// Each entry starts on a timeline mark (usually a speech chunk <id>.<k> from layout_vo.py) and stays until the next
// entry of the same phrase, or until the phrase ends + 0.6 beat (the last entry too: it must not hang over the next scene). "|" splits an entry into consecutive captions,
// timed by letter count. Screen spelling may differ from the voice (digits on screen, words in the voice).
// Usage in film.js, before C.start():   CAPTIONS.scene({ x, y, w, size })   — size in px, two lines max.
//
// Karaoke (format «image per phrase»):  CAPTIONS.karaoke({ x, w, size, bottom, align, dim, key, keys, … })  instead of scene().
// Bottom of the frame by default (bottom = px from the frame edge to the last line); y = top placement, an explicit exception.
// The caption shows its phrase word by word: each word enters on its own mark <id>.w<k> (window.CAPW, sync.mjs) —
// rises `rise` px and sharpens from `blur` px to 0 over `frames` frames, starting one frame before the mark; words
// already said drop to `dim` opacity, the current one stays full; key words take the accent. A new caption entry (or a
// "|" page inside one) resets the whole phrase. Key words: per entry, a third element in captions.json
//   ["s2a", "until someone hits it with a DDoS attack", {"key": ["DDoS"]}]   (several words: "DDoS attack")
// exit: 'cut' drops the phrase on its last frame instead of the 4-frame blur-out, and starts its next page on the mark.
// Page selection uses C.frameTime so shutter samples do not average two phrases; word motion still follows t.
// or film-wide: karaoke({ keys: ['Mostik'] }). Lines without word marks are timed by letter count (a console warning).
(() => {
  const { scene, reg, put, el, sp, spHit, beatOf, bt, clamp, ease, lerp, pick, W, H, FPS, stage } = C;
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
  // display words: the same rule as voice.py / layout_vo.py / sync.mjs
  const tokens = (s) => {
    const out = []; let lead = '';
    for (const p of s.split(/\s+/).filter(Boolean)) {
      if (/[\p{L}\p{N}_]/u.test(p)) { out.push(lead + p); lead = ''; } else if (out.length) out[out.length - 1] += ' ' + p; else lead += p + ' ';
    }
    return out;
  };
  const wkey = (w) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
  // CSS colour → [r, g, b] through a canvas (any notation the browser knows: hex, rgb, oklch, a var() resolved by the caller)
  const rgbOf = (css) => {
    const x = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000'; x.fillStyle = css; x.fillRect(0, 0, 1, 1);
    return [...x.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, k) => a.map((v, i) => v * k + b[i] * (1 - k));
  const cssVar = (n) => getComputedStyle(stage).getPropertyValue(n).trim();

  // caption entries → pages of timed words (seconds)
  function karaokeItems(CAPS, CAPW, keysAll) {
    const out = []; let estimated = 0;
    CAPS.forEach(([k, txt, opt], i) => {
      if (!txt || !txt.trim()) return;
      const next = CAPS.slice(i + 1).find((c) => c[1] && c[1].trim()), own = endOf(k);
      const wm = CAPW[i];
      const nextAt = next ? (CAPW[CAPS.indexOf(next)] ? beatOf(CAPW[CAPS.indexOf(next)][0]) : beatOf(next[0])) : Infinity;
      const end = next && take(next[0]) === take(k) ? nextAt : Math.min(own, nextAt);
      const keys = [...keysAll, ...((opt && opt.key) || [])].map((x) => x.split(/\s+/).map(wkey));
      const pages = txt.split('|').map((p) => tokens(p)).filter((p) => p.length), flat = pages.flat();
      let at;   // beats of each word
      if (wm && wm.length === flat.length) at = wm.map(beatOf);
      else {   // no word marks: the words share [mark, phrase end] by letter count
        estimated++;
        const a = beatOf(k), b = Math.min(end, (() => { try { return beatOf(`${take(k)}.end`); } catch { return end; } })());
        const n = flat.map((w) => Math.max(1, wkey(w).length)), tot = n.reduce((x, y) => x + y, 0);
        let acc = 0; at = n.map((m) => { const v = a + (b - a) * acc / tot; acc += m; return v; });
      }
      const isKey = flat.map(() => false), K = flat.map(wkey);
      for (const kw of keys) for (let j = 0; j + kw.length <= K.length; j++) if (kw.every((x, q) => K[j + q] === x)) kw.forEach((_, q) => { isKey[j + q] = true; });
      let j = 0;
      pages.forEach((p, pi) => {
        const words = p.map((w) => ({ w, t: bt(at[j]), key: isKey[j++] }));
        const pend = pi < pages.length - 1 ? bt(at[j]) : bt(end);
        out.push({ words, t0: words[0].t, t1: pend });
      });
    });
    if (estimated) console.warn(`karaoke: ${estimated} caption(s) without word marks, timed by letter count — run voice.py check (word timings), layout_vo.py, sync.mjs`);
    return out;
  }

  window.CAPTIONS = {
    karaoke(o = {}) {
      // at the bottom like every caption: the last line sits `bottom` px above the frame edge (9:16: above the platform
      // zone, bottom 20 %), so a one-line phrase does not float. o.y puts the box's top there instead: a top caption is an
      // explicit exception, with its reason in docs/style_guide.md.
      const box = { x: o.x ?? pick(160, 90, 90), w: o.w ?? pick(W - 320, W - 180, W - 180), size: o.size ?? pick(64, 60, 68) };
      const place = o.y != null ? `top:${o.y}px` : `top:auto;bottom:${o.bottom ?? pick(84, 90, Math.round(H * 0.2) + 40)}px`;
      const F = o.frames ?? 4, rise = o.rise ?? 8, blur = o.blur ?? 6, lh = o.lineHeight ?? 1.18;
      const PAGES = karaokeItems(window.CAPS || [], window.CAPW || [], o.keys || []);
      return scene({
        name: 'karaoke', from: 0, to: 'done', ...(o.scene || {}),
        build(root, S) {
          root.style.zIndex = 60;
          const probe = el('div', { class: 'abs', style: `color:${o.color || 'var(--ink)'}` }, root);
          const ink = rgbOf(getComputedStyle(probe).color), bg = rgbOf(o.bg || cssVar('--bg') || '#fff'), acc = rgbOf(o.accent || cssVar('--accent') || '#e8552b');
          probe.remove();
          // said words: `dim` (≈ 0.55), raised until the dimmed ink still reads at 4.5:1 on the background
          S.dim = o.dim ?? 0.55;
          while (S.dim < 1 && ratio(mix(ink, bg, S.dim), bg) < 4.5) S.dim = +(S.dim + 0.01).toFixed(2);
          // key words: accent colour when it reads at 4.5:1 on the background, otherwise an accent plate under dark/light text
          let mode = o.key || 'auto', keyInk = null;
          if (mode === 'auto') mode = ratio(acc, bg) >= 4.5 ? 'color' : 'chip';
          if (mode === 'chip') {
            keyInk = [ink, bg, [17, 17, 17], [255, 255, 255]].sort((a, b) => ratio(b, acc) - ratio(a, acc))[0];
            if (ratio(keyInk, acc) < 4.5) console.warn(`karaoke: no text colour reads at 4.5:1 on the accent plate (${ratio(keyInk, acc).toFixed(2)}:1)`);
          } else if (ratio(acc, bg) < 4.5) console.warn(`karaoke: key colour on the background is ${ratio(acc, bg).toFixed(2)}:1 < 4.5 — use key: 'chip'`);
          const keyCss = mode === 'chip'
            ? `background:${o.accent || 'var(--accent)'};color:rgb(${keyInk.join(',')});padding:0 0.16em;margin:0 -0.04em;border-radius:0.16em;`
            : `color:${o.accent || 'var(--accent)'};`;
          S.mode = mode;
          S.pages = PAGES.map((pg) => {
            // every word of the page is laid out from the start (hidden words keep their place), so nothing reflows as they enter
            const box_ = el('div', { class: 'cap abs', style: `left:${box.x}px;${place};width:${box.w}px;overflow:visible;text-align:${o.align || 'left'};`
              + `font:${o.weight ?? 600} ${box.size}px/${lh} ${o.font || 'UI'};letter-spacing:-0.012em;color:${o.color || 'var(--ink)'}` }, root);
            reg(box_, { hide: true });
            pg.spans = pg.words.map((w, i) => {
              if (i) box_.appendChild(document.createTextNode(' '));
              return reg(el('span', { style: `display:inline-block;${w.key ? keyCss + (o.keyCss || '') : ''}` }, box_, w.w), { hide: true });
            });
            pg.box = box_;
            return pg;
          });
        },
        run(t, b, S) {
          const f = 1 / FPS;
          const pageTime = C.frameTime ?? t;
          for (const pg of S.pages) {
            // A hard page cut cannot pre-roll over a still fully visible previous page.
            if (pageTime < pg.t0 - (o.exit === 'cut' ? 0 : 2 * f) || pageTime >= pg.t1) continue;
            put(pg.box, { hide: false });
            const out = o.exit === 'cut' ? 0 : clamp((t - (pg.t1 - (F + 1) * f)) / (F * f));   // leaves together just before the next one; exit:'cut' = gone on the frame, no fade
            pg.words.forEach((w, i) => {
              const e = clamp((t - (w.t - f)) / (F * f));   // enters one frame before its mark, settled F frames later
              if (e <= 0) return;
              const k = ease.out(e), nx = pg.words[i + 1];
              const said = nx ? ease.out(clamp((t - (nx.t - f)) / (F * f))) : 0;
              const o_ = k * (w.key ? 1 : lerp(1, S.dim, said)) * (1 - out), bl = blur * (1 - k) + 4 * out;
              put(pg.spans[i], { hide: o_ <= 0.001, o: o_, y: rise * (1 - k) - 6 * ease.out(out), ...(bl > 0.05 ? { filter: `blur(${bl.toFixed(2)}px)` } : {}) });
            });
          }
        },
      });
    },

    scene(o = {}) {
      const box = { x: o.x ?? pick(140, 90, 90), w: o.w ?? pick(W - 280, W - 180, W - 180), size: o.size ?? pick(52, 52, 56) };
      box.y = o.y ?? pick(H - 180, H - 230, H - 516);   // 9:16: above the platform UI zone (bottom 20 %)
      const CAPT = items(window.CAPS || []);
      return scene({
        name: 'captions', from: 0, to: 'done', ...(o.scene || {}),
        build(root, S) {
          root.style.zIndex = 60;   // above generated B-roll (lib/footage.js, z 40)
          // headroom above the first line: a face whose ascent + descent exceeds line-height 1.22 (IBM Plex, Й/Ё) pokes
          // above the line box, and the mask would shave the tops of capitals with diacritics
          const pad = Math.round(box.size * 0.12), hgt = Math.round(box.size * 1.22 * 2) + 8 + pad;
          S.items = CAPT.map((c) => {
            const clip = el('div', { class: 'cap', style: `left:${box.x}px;top:${box.y - pad}px;width:${box.w}px;height:${hgt}px` }, root);
            const inner = el('div', { class: 'abs', style: `left:0;top:${pad}px;width:${box.w}px;font:500 ${box.size}px/1.22 UI;letter-spacing:-0.012em;color:${o.color || 'var(--ink)'}` }, clip, c.txt);
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
