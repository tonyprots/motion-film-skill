// Capture a product site's real brand material. Run from the project root.
//   node scripts/capture.mjs https://example.com [--sections "Pricing,Built for teams,Get started"]
// Writes:
//   assets/site/hero.png, full.png (2x)      what the site looks like
//   assets/site/info.json                    title, description, font families in use (by element count), @font-face
//                                            sources, text/bg colours by frequency, :root CSS variables, headings with
//                                            family/size/weight, images, videos, og:image, favicons, header SVGs
//   assets/fonts/<family>-<weight>[-italic].<ext>   every @font-face file the site serves (the real faces)
//   assets/brand/logo_<n>.svg, og.<ext>, favicon_<n>.<ext>
//   assets/cap/<slug>.png (3x)               with --sections: the smallest block ≥ 500 px wide containing each text
//   assets/ui/<slug>.json, .png, .check.png  with --components "Text,css:.selector": a LIVE component — the block's real
//                                            markup with its computed styles inlined, its images and fonts, for scenes
//                                            where the UI changes state (C.ui in film.js). Each is re-rendered on its own
//                                            and compared with the site's pixels (<slug>.png vs .check.png); over
//                                            --max-diff % (default 3) it is marked failed and sync.mjs warns.
//                                            --min-width N (default 240): smallest block that counts as the component.
// Use real UI and real assets. Never redraw product UI that exists on the site: a live component is carried over, not drawn.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url || url.startsWith('--')) { console.error('usage: node scripts/capture.mjs <url> [--sections "a,b"]'); process.exit(1); }
const si = process.argv.indexOf('--sections');
const sections = si > 0 ? process.argv[si + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const components = arg('components', '').split(',').map((s) => s.trim()).filter(Boolean);
const MIN_W = +arg('min-width', 240), MAX_DIFF = +arg('max-diff', 3);
for (const d of ['assets/site', 'assets/fonts', 'assets/brand', 'assets/cap', ...(components.length ? ['assets/ui/img', 'review'] : [])]) fs.mkdirSync(d, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const media = new Set();
page.on('response', (r) => { const u = r.url(); if (/\.(woff2?|ttf|otf|png|jpe?g|webp|avif|svg|mp4|webm)(\?|$)/i.test(u)) media.add(u); });
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => page.goto(url, { waitUntil: 'domcontentloaded' }));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'assets/site/hero.png' });
const Hs = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < Hs; y += 700) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(300); }
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1000);
await page.screenshot({ path: 'assets/site/full.png', fullPage: true }).catch((e) => console.log('full-page screenshot failed:', e.message));

const info = await page.evaluate(() => {
  const count = (m, k) => { m[k] = (m[k] || 0) + 1; };
  const fams = {}, colors = {}, bgs = {};
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { count(fams, cs.fontFamily); count(colors, cs.color); }
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') count(bgs, cs.backgroundColor);
  }
  const faces = [], vars = {}, blocked = [];
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch { if (sh.href) blocked.push(sh.href); continue; }
    for (const r of rules) {
      if (r instanceof CSSFontFaceRule) {
        const src = r.style.getPropertyValue('src'), m = [...src.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((x) => new URL(x[1], sh.href || location.href).href);
        faces.push({ family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(), weight: r.style.getPropertyValue('font-weight') || '400', style: r.style.getPropertyValue('font-style') || 'normal', range: r.style.getPropertyValue('unicode-range') || '', urls: m });
      }
      if (r.selectorText && /^:root/.test(r.selectorText)) for (const k of r.style) if (k.startsWith('--')) vars[k] = r.style.getPropertyValue(k).trim();
    }
  }
  const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  const headings = [...document.querySelectorAll('h1,h2,h3,p,a,button,li')].map((h) => {
    const t = h.innerText.trim(), cs = getComputedStyle(h);
    return t && t.length < 160 ? `${h.tagName}: ${t.replace(/\n/g, ' | ')}  [${cs.fontFamily.slice(0, 50)} ${cs.fontSize} ${cs.fontWeight} ls ${cs.letterSpacing} ${cs.color}]` : null;
  }).filter(Boolean).slice(0, 150);
  return {
    url: location.href, title: document.title, description: document.querySelector('meta[name=description]')?.content,
    font_families_by_use: top(fams, 12), font_faces: faces, blocked_sheets: blocked, text_colors: top(colors, 20), bg_colors: top(bgs, 20), css_vars: vars, headings,
    images: [...document.images].map((i) => ({ src: i.currentSrc || i.src, alt: i.alt, w: i.naturalWidth, h: i.naturalHeight })).slice(0, 120),
    videos: [...document.querySelectorAll('video')].map((v) => ({ src: v.currentSrc || v.src, poster: v.poster })),
    og_image: document.querySelector('meta[property="og:image"]')?.content,
    favicons: [...document.querySelectorAll('link[rel*=icon]')].map((l) => l.href),
    header_svgs: [...document.querySelectorAll('header svg, nav svg, a[href="/"] svg')].map((s) => s.outerHTML).filter((s) => s.length < 20000).slice(0, 6),
  };
});
info.network_media = [...media];
// cross-origin stylesheets (fonts on a CDN) hide their rules from the page: read their @font-face from the file itself
for (const href of info.blocked_sheets) {
  let css = ''; try { const r = await ctx.request.get(href); if (r.ok()) css = await r.text(); } catch {}
  for (const [, body] of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const val = (k) => (body.match(new RegExp(`(?:^|[;{\\s])${k}\\s*:\\s*([^;]+)`)) || [])[1]?.trim() || '';
    const urls = [...val('src').matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((x) => new URL(x[1], href).href);
    if (urls.length) info.font_faces.push({ family: val('font-family').replace(/["']/g, ''), weight: val('font-weight') || '400', style: val('font-style') || 'normal', range: val('unicode-range'), urls });
  }
}
fs.writeFileSync('assets/site/info.json', JSON.stringify(info, null, 2));

// downloads: fonts, logos, og image, favicons
const get = async (u, f) => { try { const r = await ctx.request.get(u); if (r.ok()) { fs.writeFileSync(f, await r.body()); return true; } } catch {} return false; };
const done = new Set(), fontFiles = []; let nf = 0;
for (const f of info.font_faces) {
  const u = f.urls.find((x) => /woff2/i.test(x)) || f.urls[0]; if (!u || done.has(u) || u.startsWith('data:')) continue; done.add(u);
  const ext = (u.match(/\.(woff2?|ttf|otf)(\?|$)/i) || [, 'woff2'])[1];
  // unicode-range subsets share a family/weight: the one covering Latin "A" keeps the plain name, others get a suffix
  const ranges = [...f.range.matchAll(/U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/gi)].map(([, a, b]) => [parseInt(a.replace(/\?/g, '0'), 16), parseInt((b || a).replace(/\?/g, 'F'), 16)]);
  const latin = !ranges.length || ranges.some(([a, b]) => a <= 0x41 && 0x41 <= b);
  const name = `assets/fonts/${slug(f.family)}-${f.weight.replace(/\s+/g, '_')}${f.style === 'italic' ? '-italic' : ''}${latin ? '' : '-u' + ranges[0][0].toString(16)}.${ext}`;
  if (await get(u, name)) { nf++; fontFiles.push({ ...f, file: path.basename(name) }); }
}
info.header_svgs.forEach((s, i) => fs.writeFileSync(`assets/brand/logo_${i}.svg`, s.includes('xmlns') ? s : s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')));
if (info.og_image) await get(info.og_image, `assets/brand/og${path.extname(new URL(info.og_image).pathname) || '.png'}`);
for (const [i, u] of info.favicons.entries()) await get(u, `assets/brand/favicon_${i}${path.extname(new URL(u).pathname) || '.png'}`);

// section crops at 3x
if (sections.length) {
  const p3 = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 3 })).newPage();
  await p3.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  const H3 = await p3.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H3; y += 700) { await p3.evaluate((y) => scrollTo(0, y), y); await p3.waitForTimeout(250); }
  for (const text of sections) {
    const ok = await p3.evaluate(([text, name]) => {
      const el = [...document.querySelectorAll('body *')].find((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes(text)));
      if (!el) return false; let n = el; while (n.parentElement && n.getBoundingClientRect().width < 500) n = n.parentElement;
      n.setAttribute('data-cap', name); return true;
    }, [text, slug(text)]);
    if (!ok) { console.log('section not found:', text); continue; }
    const loc = p3.locator(`[data-cap="${slug(text)}"]`).first();
    await loc.scrollIntoViewIfNeeded(); await p3.waitForTimeout(1200);
    await loc.screenshot({ path: `assets/cap/${slug(text)}.png` }).then(() => console.log('assets/cap/' + slug(text) + '.png'), (e) => console.log('failed', text, e.message.slice(0, 80)));
  }
}
// live components at 2x: markup + computed styles, re-rendered alone and compared with the site's own pixels
if (components.length) {
  const { decodePNG } = await import(new URL('./png.mjs', import.meta.url));
  const p2 = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  await p2.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  const H2 = await p2.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H2; y += 700) { await p2.evaluate((y) => scrollTo(0, y), y); await p2.waitForTimeout(250); }
  const chk = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  for (const spec of components) {
    const id = slug(spec.replace(/^css:/, ''));
    const found = await p2.evaluate(([spec, id, minW]) => {
      let n = spec.startsWith('css:') ? document.querySelector(spec.slice(4))
        : [...document.querySelectorAll('body *')].find((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes(spec)));
      if (!n) return false; while (n.parentElement && n.getBoundingClientRect().width < minW) n = n.parentElement;
      n.setAttribute('data-cmp', id); return true;
    }, [spec, id, MIN_W]);
    if (!found) { console.log('component not found:', spec); continue; }
    const loc = p2.locator(`[data-cmp="${id}"]`).first();
    await loc.scrollIntoViewIfNeeded(); await p2.waitForTimeout(1200);
    await loc.screenshot({ path: `assets/ui/${id}.png`, animations: 'disabled' });   // as it looks on the site
    // reference for the check: the component alone — everything that is neither inside it nor its ancestor is hidden
    // (a hero canvas or image behind it is backdrop, not component)
    await p2.evaluate((id) => { const r = document.querySelector(`[data-cmp="${id}"]`);
      for (const e of document.querySelectorAll('body *')) if (!r.contains(e) && !e.contains(r)) e.setAttribute('data-cmp-hide', e.style.visibility || '_'), e.style.visibility = 'hidden';
    }, id);
    await loc.screenshot({ path: `assets/ui/${id}.ref.png`, animations: 'disabled' });
    await p2.evaluate(() => { for (const e of document.querySelectorAll('[data-cmp-hide]')) { const v = e.getAttribute('data-cmp-hide'); e.style.visibility = v === '_' ? '' : v; e.removeAttribute('data-cmp-hide'); } });
    const C = await p2.evaluate((id) => {
      // inherited properties compare with the parent (what the element would get anyway), except on form controls, where the
      // browser's own stylesheet resets font and colour; everything else compares with the tag's default
      const INH = new Set(['color', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-variant', 'font-feature-settings',
        'font-variation-settings', 'font-kerning', 'font-optical-sizing', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-indent',
        'text-transform', 'text-shadow', 'text-rendering', 'white-space', 'white-space-collapse', 'text-wrap', 'text-wrap-mode', 'word-break',
        'overflow-wrap', 'hyphens', 'visibility', 'direction', 'writing-mode', 'list-style-type', 'list-style-position', 'list-style-image',
        'border-collapse', 'border-spacing', 'caption-side', 'empty-cells', 'quotes', 'tab-size', 'caret-color', 'cursor', 'fill', 'fill-opacity',
        'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'paint-order', 'color-scheme',
        '-webkit-font-smoothing', '-webkit-text-fill-color', '-webkit-text-stroke-width', '-webkit-text-stroke-color']);
      const KEEP_WEBKIT = /^-webkit-(font-smoothing|text-fill-color|text-stroke|background-clip|line-clamp|box-orient|mask)/;
      const SKIP = /^(transition|animation|will-change|view-transition|block-size|inline-size|min-block|max-block|min-inline|max-inline|margin-block|margin-inline|padding-block|padding-inline|inset-block|inset-inline|border-block|border-inline|border-start|border-end|scroll-|overscroll|app-region|contain-intrinsic|anchor|position-try|interactivity)/;
      const props = (cs) => [...cs].filter((k) => !k.startsWith('--') && !SKIP.test(k) && (!k.startsWith('-webkit-') || KEEP_WEBKIT.test(k)));
      const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px'; document.body.appendChild(fr);
      const D = fr.contentDocument, defs = {};
      D.open(); D.write('<!doctype html><html><head></head><body></body></html>'); D.close();   // standards mode, as in film/index.html
      // a tag's default depends on the attributes the browser's stylesheet keys on: a[href] is underlined, input[type] differs
      const def = (tag, ns, src) => { const ua = [['href', tag === 'a'], ['type', /^(input|button)$/.test(tag)]].filter(([k, on]) => on && src?.hasAttribute(k)).map(([k]) => [k, src.getAttribute(k)]);
        return (defs[tag + JSON.stringify(ua)] ??= (() => { const e = ns ? D.createElementNS(ns, tag) : D.createElement(tag); for (const [k, v] of ua) e.setAttribute(k, v); (ns && tag !== 'svg' ? (D.querySelector('svg') || D.body.appendChild(D.createElementNS(ns, 'svg'))) : D.body).appendChild(e);
        const o = {}, cs = getComputedStyle(e); for (const k of cs) o[k] = cs.getPropertyValue(k); return o; })()); };
      const root = document.querySelector(`[data-cmp="${id}"]`), R = root.getBoundingClientRect();
      const urls = new Set(), families = new Set(), warn = [], pseudo = [];
      let k = 0;
      const FORM = /^(input|button|select|textarea|option|optgroup|meter|progress)$/;   // the UA resets font and colour on these
      const decl = (cs, base, parent, isRoot, tag = '') => props(cs).map((p) => {
        const v = cs.getPropertyValue(p);
        if (!isRoot && !(INH.has(p) && FORM.test(tag)) && (INH.has(p) ? parent && parent.getPropertyValue(p) === v : base[p] === v)) return null;
        for (const m of v.matchAll(/url\("?([^")]+)"?\)/g)) if (!/^(data:|#)/.test(m[1])) urls.add(m[1]);
        return `${p}:${v}`;
      }).filter(Boolean).join(';');
      const walk = (e, parentCs, isRoot) => {
        if (/^(SCRIPT|NOSCRIPT|TEMPLATE|STYLE|LINK)$/.test(e.tagName)) return null;
        if (/^(CANVAS|VIDEO|IFRAME)$/.test(e.tagName)) warn.push(`${e.tagName.toLowerCase()} is not carried over: show that part as a screenshot`);
        const ns = e.namespaceURI === 'http://www.w3.org/2000/svg' ? e.namespaceURI : null, tag = e.tagName.toLowerCase();
        // a text field becomes a box with two spans (data-value, data-placeholder), so the film can type into it with put(…, { text })
        const field = (tag === 'input' && /^(|text|search|email|url|tel|number|password)$/.test(e.getAttribute('type') || '')) || tag === 'textarea';
        const c = ns ? document.createElementNS(ns, e.tagName) : document.createElement(field ? 'div' : tag), cs = getComputedStyle(e);
        // ids stay inside SVG: masks, clip paths, gradients and <use> point at them with url(#…) / href="#…"
        for (const a of e.attributes) if (!/^(class|style|on|data-|srcset|sizes|loading|tabindex|aria-|role$|draggable|autofocus)/.test(a.name) && (a.name !== 'id' || ns)) c.setAttribute(a.name, a.value);
        if (tag === 'img') { c.setAttribute('src', e.currentSrc || e.src); urls.add(e.currentSrc || e.src); }
        if (tag === 'image' && ns) { const h = e.getAttribute('href') || e.getAttribute('xlink:href'); if (h && !h.startsWith('data:')) { const u = new URL(h, location.href).href; c.setAttribute('href', u); urls.add(u); } }
        if (tag === 'input' && !field) c.setAttribute('value', e.value);
        let st = decl(cs, def(tag, ns, e), parentCs, isRoot, tag);
        if (field) {
          for (const a of ['value', 'placeholder', 'type', 'name', 'autocomplete', 'spellcheck', 'rows', 'cols']) c.removeAttribute(a);
          c.setAttribute('data-field', e.getAttribute('placeholder') || e.getAttribute('name') || '');
          st += tag === 'textarea' ? ';white-space:pre-wrap;overflow:hidden' : ';display:flex;align-items:center;white-space:pre;overflow:hidden';
          const pc = getComputedStyle(e, '::placeholder'), ph = [...INH, 'opacity'].filter((p) => pc.getPropertyValue(p) !== cs.getPropertyValue(p)).map((p) => `${p}:${pc.getPropertyValue(p)}`).join(';');
          const v = document.createElement('span'); v.setAttribute('data-value', ''); v.textContent = e.type === 'password' ? '•'.repeat(e.value.length) : e.value;
          const h = document.createElement('span'); h.setAttribute('data-placeholder', ''); h.textContent = e.value ? '' : e.getAttribute('placeholder') || '';
          h.setAttribute('style', ph + (ph ? ';' : '') + 'position:absolute;pointer-events:none'); c.append(v, h);
          if (cs.position === 'static') st += ';position:relative';
        }
        if (isRoot) { st += ';position:absolute;left:0;top:0;margin:0;transform:none;translate:none;scale:none;rotate:none'; if (document.documentElement.lang) c.setAttribute('lang', document.documentElement.lang); }
        c.setAttribute('style', st);
        for (const ps of ['::before', '::after', ...(!field && e.hasAttribute('placeholder') ? ['::placeholder'] : [])]) {
          const pc = getComputedStyle(e, ps); if (!pc || (ps !== '::placeholder' && ['none', 'normal'].includes(pc.content))) continue;
          if (!c.hasAttribute('data-k')) c.setAttribute('data-k', String(++k));
          pseudo.push(`[data-ui-k="${id}"] [data-k="${c.getAttribute('data-k')}"]${ps}{${decl(pc, {}, cs, false)}}`);
        }
        families.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
        if ((cs.mixBlendMode !== 'normal' || cs.backdropFilter !== 'none') && !warn.some((w) => w.startsWith('blends')))
          warn.push(`blends with what is behind it (${tag}: mix-blend-mode ${cs.mixBlendMode}, backdrop-filter ${cs.backdropFilter}): put the site's backdrop behind it in the scene — ${id}.png shows it in place`);
        for (const n of field ? [] : e.childNodes) {
          if (n.nodeType === 3) c.appendChild(document.createTextNode(n.textContent));
          else if (n.nodeType === 1) { const cc = walk(n, cs, false); if (cc) c.appendChild(cc); }
        }
        return c;
      };
      const out = walk(root, null, true);
      let bg = 'rgb(255, 255, 255)';
      for (let n = root; n; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) { bg = b; break; } }
      fr.remove();
      return { w: Math.round(R.width * 100) / 100, h: Math.round(R.height * 100) / 100, html: out.outerHTML, pseudo, urls: [...urls], families: [...families], bg, warn };
    }, id);
    // images → assets/ui/img/, paths relative to film/ (and to review/, where the check page lives)
    let html = C.html, pseudo = C.pseudo.join('\n');
    for (const u of C.urls) {
      let rel = null;
      try { const ext = (path.extname(new URL(u).pathname) || '.png').slice(0, 6), f = `assets/ui/img/${createHash('sha1').update(u).digest('hex').slice(0, 12)}${ext}`;
        if (fs.existsSync(f) || await get(u, f)) rel = '../' + f; } catch {}
      if (!rel) { C.warn.push(`image not downloaded: ${u.slice(0, 90)}`); continue; }
      const esc = (x) => x.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      for (const form of new Set([u, esc(u)])) { html = html.split(form).join(rel); pseudo = pseudo.split(form).join(rel); }
    }
    const faces = fontFiles.filter((f) => C.families.includes(f.family)).map((f) => `@font-face{font-family:"${f.family}";src:url(../assets/fonts/${f.file});font-weight:${f.weight};font-style:${f.style}${f.range ? ';unicode-range:' + f.range : ''}}`);
    const missing = C.families.filter((f) => !fontFiles.some((x) => x.family === f) && !/^(-apple-system|system-ui|sans-serif|serif|monospace|Arial|Helvetica|Helvetica Neue|Times|Times New Roman)$/i.test(f));
    if (missing.length) C.warn.push(`font not downloaded, the component falls back: ${missing.join(', ')}`);
    const css = faces.join('') + pseudo;
    const full = `<div data-ui-k="${id}" style="position:relative;width:${C.w}px;height:${C.h}px">${css ? `<style>${css}</style>` : ''}${html}</div>`;
    // pixel check: the component alone on the background it sat on, against the site's own screenshot
    const page = `review/ui_check_${id}.html`;
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${C.bg}}</style>${full}`);
    await chk.goto('file://' + path.resolve(page)); await chk.evaluate(() => document.fonts.ready); await chk.waitForTimeout(400);
    await chk.locator(`[data-ui-k="${id}"]`).screenshot({ path: `assets/ui/${id}.check.png` });
    const img = (f) => { const buf = fs.readFileSync(f); return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), rgb: decodePNG(buf) }; };
    const a = img(`assets/ui/${id}.ref.png`), b = img(`assets/ui/${id}.check.png`);
    const w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
    let off = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * a.w + x) * 3, j = (y * b.w + x) * 3;
      if (Math.max(Math.abs(a.rgb[i] - b.rgb[j]), Math.abs(a.rgb[i + 1] - b.rgb[j + 1]), Math.abs(a.rgb[i + 2] - b.rgb[j + 2])) > 32) off++;
    }
    const sizeOk = Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2;
    const diff = +(100 * off / Math.max(1, w * h)).toFixed(2), ok = sizeOk && diff <= MAX_DIFF;
    fs.writeFileSync(`assets/ui/${id}.json`, JSON.stringify({ source: url, spec, w: C.w, h: C.h, bg: C.bg, html: full,
      check: { ok, diff_pct: diff, max_diff_pct: MAX_DIFF, site_px: [a.w, a.h], rebuilt_px: [b.w, b.h] }, warn: C.warn }, null, 1));
    console.log(`assets/ui/${id}.json  ${C.w}×${C.h}  ${(full.length / 1024).toFixed(0)} KB  pixel check ${ok ? 'OK' : 'FAILED'}: ${diff} % off${sizeOk ? '' : `, size ${b.w}×${b.h} vs ${a.w}×${a.h}`}`);
    for (const m of C.warn) console.log('  WARN', m);
  }
}
await browser.close();
console.log(`assets/site/info.json  title "${info.title}"`);
console.log(`fonts in use: ${info.font_families_by_use.slice(0, 4).map(([f, n]) => `${f.split(',')[0]} (${n})`).join(', ')}`);
console.log(`font files downloaded: ${nf} → assets/fonts/   logos: ${info.header_svgs.length}   colours: ${info.text_colors.slice(0, 5).map((c) => c[0]).join(' ')}`);
