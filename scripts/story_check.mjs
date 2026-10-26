// Structural and rendered evidence for visual-events.json. Meaning is deliberately left to an independent critic.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const properties = new Set(['text', 'digits', 'attr:width', 'attr:height', 'attr:d']);
const actions = new Set(['accumulate', 'fill', 'compare', 'connect', 'reveal', 'assemble', 'change']);

export function validatePlan(plan, phrases, marks) {
  const errors = [], ids = new Set(), known = new Map(phrases.map((p) => [p.id, p]));
  if (!plan || typeof plan !== 'object' || plan.version !== 1 || !Array.isArray(plan.events)) return ['visual-events.json needs version:1 and events:[]'];
  for (const e of plan.events) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push('each event must be an object'); continue; }
    if (!e.id || !/^[a-zA-Z0-9_-]+$/.test(e.id) || ids.has(e.id)) errors.push('event id must be unique and filename-safe');
    ids.add(e.id);
    if (!known.has(e.phrase)) errors.push(`${e.id}: unknown phrase ${e.phrase}`);
    if (typeof e.at !== 'string' || !Object.hasOwn(marks, e.at)) errors.push(`${e.id}: at must name a timeline mark`);
    if (!properties.has(e.property)) errors.push(`${e.id}: unsupported observable property (transforms do not count)`);
    if (!actions.has(e.action) || typeof e.meaning !== 'string' || !e.meaning.trim()) errors.push(`${e.id}: needs action and meaning`);
    if (!e.selector || !e.region || !Object.hasOwn(e, 'from') || !Object.hasOwn(e, 'to') || String(e.from) === String(e.to)) errors.push(`${e.id}: needs region, selector and different from/to states`);
    const window = e.window || [-0.1, 0.7];
    if (!Array.isArray(window) || window.length !== 2 || !window.every(Number.isFinite) || window[0] >= 0 || window[1] <= 0 || window[1] - window[0] > 2) errors.push(`${e.id}: window must straddle the mark and span at most 2 seconds`);
  }
  return errors;
}

function observe(e) {
  const targets = document.querySelectorAll(e.selector), regions = document.querySelectorAll(e.region);
  if (targets.length !== 1 || regions.length !== 1) return { error: 'selector and region must each match one element' };
  const node = targets[0], region = regions[0];
  if (e.property === 'text') {
    if (node.childElementCount) return { error: 'text observable must be a leaf element (hidden descendant text does not count)' };
    const css = getComputedStyle(node), ink = node instanceof SVGElement ? css.fill : css.color;
    if (ink === 'transparent' || ink === 'none' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(ink)) return { error: 'text observable has transparent ink' };
  }
  if (e.property !== 'text' && e.property !== 'digits') {
    const name = e.property.slice(5), tags = name === 'd' ? ['path'] : ['rect', 'image', 'svg'];
    if (!(node instanceof SVGElement) || !tags.includes(node.localName)) return { error: 'attribute is not a rendered SVG property on this element' };
    if (name !== 'd' && Math.abs(node.getBBox()[name] - Number(node.getAttribute(name))) > 0.01) return { error: 'SVG attribute is overridden by CSS or does not control rendered geometry' };
  }
  if (!region.contains(node) || region.closest('.cap,[data-caption],.karaoke') || region.querySelector('.cap,[data-caption],.karaoke') || node.closest('.cap,[data-caption],.karaoke')) return { error: 'observable must be inside a prop region without captions' };
  const rect = region.getBoundingClientRect();
  const visible = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const css = getComputedStyle(n);
      if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) < 0.05) return false;
    }
    return true;
  };
  const r = node.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  const hit = document.elementFromPoint(cx, cy);
  const stroke = node instanceof SVGElement ? getComputedStyle(node).stroke : 'none';
  const line = e.property === 'attr:d' && stroke !== 'none' && stroke !== 'transparent' && (r.width > 0 || r.height > 0);
  let readable = visible(node) && ((r.width > 0 && r.height > 0) || line) && hit && (node.contains(hit) || hit.contains(node));
  let value = e.property === 'text' ? node.textContent.trim() : e.property.startsWith('attr:')
    ? node.getAttribute(e.property.slice(5)) : getComputedStyle(node).getPropertyValue(e.property.slice(6)).trim();
  if (e.property === 'digits') {
    value = ''; let slots = 0;
    readable = visible(node);
    for (const child of node.children) {
      if (!visible(child)) continue;
      if (child.hasAttribute('data-number-static')) { value += child.textContent; continue; }
      if (!child.hasAttribute('data-digit-window')) return { error: 'digit observer needs real clipped digit windows' };
      const box = child.getBoundingClientRect(), centre = (box.top + box.bottom) / 2;
      const rows = [...child.querySelectorAll('[data-digit]')].filter((n) => /^\d$/.test(n.textContent));
      rows.sort((a, b) => Math.abs((a.getBoundingClientRect().top + a.getBoundingClientRect().bottom) / 2 - centre)
        - Math.abs((b.getBoundingClientRect().top + b.getBoundingClientRect().bottom) / 2 - centre));
      if (!rows.length) return { error: 'digit window has no rendered digits' };
      const at = document.elementFromPoint(box.x + box.width / 2, centre);
      readable = readable && box.width > 0 && box.height > 0 && !!at && child.contains(at);
      value += rows[0].textContent; slots++;
    }
    if (!slots) return { error: 'no visible digit windows' };
  }
  return { value, readable: !!readable, visible: visible(region), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
}

function equal(actual, expected, tolerance = 0.01) {
  return typeof expected === 'number' ? actual != null && Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) <= tolerance : actual === String(expected);
}

function pixelChange(a, b) {
  if (a.length !== b.length) return 0;
  let changed = 0, total = 0;
  for (let i = 0; i < a.length; i += 6) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 12) changed++;
    total++;
  }
  return total ? changed / total : 0;
}

export async function reviewStory({ ROOT, TL, fmt, F }) {
  const file = path.join(ROOT, 'visual-events.json'), out = path.join(ROOT, `review/story_${fmt}.json`);
  const required = TL.visual_format === 'image-per-phrase';
  const report = { fmt, status: 'NOT CHECKED', meaning: 'NOT CHECKED — independent critic must verify meaning', events: [], errors: [] };
  const inputs = ['timeline.json', 'visual-events.json', 'audio/vo_placed.json', 'captions.json', 'beats.json',
    ...fs.readdirSync(path.join(ROOT, 'film'), { recursive: true }).filter((f) => /\.(js|html|css)$/.test(f)).map((f) => `film/${f}`)];
  report.inputs = Object.fromEntries(inputs.map((f) => [f, fs.existsSync(path.join(ROOT, f))
    ? createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex') : null]));
  const finish = () => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`story ${fmt}: ${report.status} · ${report.covered ?? 0}/${report.phrases ?? 0} phrases with rendered state evidence → ${path.relative(ROOT, out)}`);
    for (const error of report.errors) console.error(error);
    if (report.status === 'FAIL') process.exitCode = 1;
    return report;
  };
  if (!fs.existsSync(file)) {
    report.status = required ? 'FAIL' : 'NOT CHECKED';
    report.errors.push('no visual-events.json; visual phrase coverage was not checked');
    return finish();
  }
  let plan;
  try { plan = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { report.status = 'FAIL'; report.errors.push(e.message); return finish(); }
  const phrases = await F.page.evaluate(() => window.VO || []);
  const marks = TL.marks || {};
  report.phrases = phrases.length;
  report.errors = validatePlan(plan, phrases, marks);
  if (!phrases.length) report.errors.push('no placed voice phrases; run vo.py and sync.mjs first');
  if (report.errors.length) { report.status = 'FAIL'; return finish(); }
  const dir = path.join(ROOT, `review/story/${fmt}`);
  fs.mkdirSync(dir, { recursive: true });
  const covered = new Set();
  for (const e of plan.events) {
    const result = { id: e.id, phrase: e.phrase, action: e.action, meaning: e.meaning, status: 'FAIL', errors: [] };
    report.events.push(result);
    try {
      const at = await F.page.evaluate((m) => C.bt(m), e.at), window = e.window || [-0.1, 0.7];
      const phrase = phrases.find((p) => p.id === e.phrase);
      if (!Number.isFinite(at) || at < phrase.t0 - 1 / F.FPS || at > phrase.t1 + 1 / F.FPS) throw new Error('event mark is outside its voice phrase');
      const times = [at + window[0], at + window[1]];
      if (times[0] < 0 || times[1] >= F.DUR) throw new Error('observation window is outside the film');
      const buffers = [], states = [];
      for (const [i, t] of times.entries()) {
        buffers.push(await F.png(t));
        states.push(await F.page.evaluate(observe, e));
        if (states[i].error) throw new Error(states[i].error);
        if (!states[i].visible) throw new Error('prop region is hidden');
      }
      const [a, b] = states;
      result.times = times;
      result.observed = states.map(({ value, readable }) => ({ value, readable }));
      if (!equal(a.value, e.from) || !equal(b.value, e.to)) result.errors.push('rendered states do not match from/to');
      if (!b.readable || (e.property === 'text' && !a.readable)) result.errors.push('observable is hidden, covered or outside the frame');
      const rect = { x: Math.min(a.rect.x, b.rect.x), y: Math.min(a.rect.y, b.rect.y) };
      rect.width = Math.max(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - rect.x;
      rect.height = Math.max(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - rect.y;
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > F.W || rect.y + rect.height > F.H) result.errors.push('prop region is cropped');
      const stills = buffers.map((buffer, i) => {
        const dst = path.join(dir, `${e.id}-${i ? 'after' : 'before'}.png`);
        fs.writeFileSync(dst, buffer);
        return dst;
      });
      const pair = path.join(dir, `${e.id}-pair.jpg`);
      const crops = states.map(({ rect: r }) => `crop=${Math.floor(r.width)}:${Math.floor(r.height)}:${Math.floor(r.x)}:${Math.floor(r.y)},scale=720:360`);
      // Normalize each region separately: a camera translation/zoom is not a change inside the prop.
      const local = stills.map((src, i) => {
        const p = spawnSync('ffmpeg', ['-v', 'error', '-i', src, '-vf', crops[i], '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
          { timeout: 30000, maxBuffer: 1024 * 1024 });
        if (p.status !== 0) throw new Error('failed to normalize prop pixels');
        return p.stdout;
      });
      result.changed_pixel_ratio = pixelChange(...local);
      if (result.changed_pixel_ratio < 0.0005) result.errors.push('no visible internal pixel change in the prop region');
      const pairResult = spawnSync('ffmpeg', ['-y', '-v', 'error', ...stills.flatMap((s) => ['-i', s]), '-filter_complex',
        `[0:v]${crops[0]}[a];[1:v]${crops[1]}[b];[a][b]hstack`, '-frames:v', '1', pair], { timeout: 30000 });
      if (pairResult.status !== 0) result.errors.push('failed to create before/after evidence pair');
      result.pair = path.relative(ROOT, pair);
      result.clip_command = `node scripts/render.mjs --fmt ${fmt} --range ${times.map((t) => t.toFixed(3)).join(',')}`;
      if (!result.errors.length) { result.status = 'EVIDENCE'; covered.add(e.phrase); }
    } catch (error) { result.errors.push(error.message); }
  }
  report.covered = covered.size;
  report.coverage = covered.size / phrases.length;
  report.uncovered = phrases.filter((p) => !covered.has(p.id)).map((p) => p.id);
  // The 80% contract belongs to image-per-phrase only; other formats report evidence without imposing that signature.
  if (required && report.coverage < 0.8) report.errors.push(`rendered phrase coverage ${Math.round(report.coverage * 100)}% is below 80%`);
  const bad = report.events.filter((e) => e.status === 'FAIL');
  if (bad.length) report.errors.push(...bad.map((e) => `${e.id}: ${e.errors.join('; ')}`));
  report.status = report.errors.length ? 'FAIL' : 'EVIDENCE';
  return finish();
}
