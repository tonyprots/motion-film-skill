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
// Use real UI and real assets. Never redraw product UI that exists on the site.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url || url.startsWith('--')) { console.error('usage: node scripts/capture.mjs <url> [--sections "a,b"]'); process.exit(1); }
const si = process.argv.indexOf('--sections');
const sections = si > 0 ? process.argv[si + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];
for (const d of ['assets/site', 'assets/fonts', 'assets/brand', 'assets/cap']) fs.mkdirSync(d, { recursive: true });
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
  const faces = [], vars = {};
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch { continue; }
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
    font_families_by_use: top(fams, 12), font_faces: faces, text_colors: top(colors, 20), bg_colors: top(bgs, 20), css_vars: vars, headings,
    images: [...document.images].map((i) => ({ src: i.currentSrc || i.src, alt: i.alt, w: i.naturalWidth, h: i.naturalHeight })).slice(0, 120),
    videos: [...document.querySelectorAll('video')].map((v) => ({ src: v.currentSrc || v.src, poster: v.poster })),
    og_image: document.querySelector('meta[property="og:image"]')?.content,
    favicons: [...document.querySelectorAll('link[rel*=icon]')].map((l) => l.href),
    header_svgs: [...document.querySelectorAll('header svg, nav svg, a[href="/"] svg')].map((s) => s.outerHTML).filter((s) => s.length < 20000).slice(0, 6),
  };
});
info.network_media = [...media];
fs.writeFileSync('assets/site/info.json', JSON.stringify(info, null, 2));

// downloads: fonts, logos, og image, favicons
const get = async (u, f) => { try { const r = await ctx.request.get(u); if (r.ok()) { fs.writeFileSync(f, await r.body()); return true; } } catch {} return false; };
const done = new Set(); let nf = 0;
for (const f of info.font_faces) {
  const u = f.urls.find((x) => /woff2/i.test(x)) || f.urls[0]; if (!u || done.has(u) || u.startsWith('data:')) continue; done.add(u);
  const ext = (u.match(/\.(woff2?|ttf|otf)(\?|$)/i) || [, 'woff2'])[1];
  // unicode-range subsets share a family/weight: the one covering Latin "A" keeps the plain name, others get a suffix
  const ranges = [...f.range.matchAll(/U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/gi)].map(([, a, b]) => [parseInt(a.replace(/\?/g, '0'), 16), parseInt((b || a).replace(/\?/g, 'F'), 16)]);
  const latin = !ranges.length || ranges.some(([a, b]) => a <= 0x41 && 0x41 <= b);
  const name = `assets/fonts/${slug(f.family)}-${f.weight.replace(/\s+/g, '_')}${f.style === 'italic' ? '-italic' : ''}${latin ? '' : '-u' + ranges[0][0].toString(16)}.${ext}`;
  if (await get(u, name)) nf++;
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
await browser.close();
console.log(`assets/site/info.json  title "${info.title}"`);
console.log(`fonts in use: ${info.font_families_by_use.slice(0, 4).map(([f, n]) => `${f.split(',')[0]} (${n})`).join(', ')}`);
console.log(`font files downloaded: ${nf} → assets/fonts/   logos: ${info.header_svgs.length}   colours: ${info.text_colors.slice(0, 5).map((c) => c[0]).join(' ')}`);
