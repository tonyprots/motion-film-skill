// Apply a brand preset to a scaffolded project. Run from anywhere:
//   node <skill>/scripts/preset.mjs <preset-dir> [project-dir]      (init.sh --preset calls this for you)
//
// A preset is a folder with preset.jsonc (commented JSON, see presets/blank) and optional font files.
// It writes, in the project:
//   assets/fonts/display.woff2, ui.woff2   copied from the preset (film/index.html already points at these names)
//   film/index.html                        :root colour tokens from preset.colors
//   timeline.json                          preset.timeline merged in, plus brand (product, hook, cta) for the film
//   brief.md                               every field the preset knows is filled; the rest stay "?"
//   preset.json                            the resolved preset, for the record
import fs from 'node:fs';
import path from 'node:path';

const [presetArg, projectArg = '.'] = process.argv.slice(2);
if (!presetArg) { console.error('usage: node preset.mjs <preset-dir> [project-dir]'); process.exit(1); }
const PRESET = path.resolve(presetArg), PROJ = path.resolve(projectArg);
const file = path.join(PRESET, 'preset.jsonc');
if (!fs.existsSync(file)) { console.error(`no preset.jsonc in ${PRESET}`); process.exit(1); }

// JSON with // and /* */ comments and trailing commas. String-aware, so "https://…" survives.
function parseJSONC(src) {
  let out = '', i = 0, str = false;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (str) { out += c; if (c === '\\') { out += n; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    out += c; i++;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}
const P = parseJSONC(fs.readFileSync(file, 'utf8'));
const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
const done = [];

// ---------------------------------------------------------------- fonts
fs.mkdirSync(path.join(PROJ, 'assets/fonts'), { recursive: true });
const html = path.join(PROJ, 'film/index.html');
const noFont = [];
// motion-film: a role may list several weights, from any path (~ allowed), e.g. local licensed fonts that must not
// ship with the skill:  "files": [{ "file": "~/Library/Fonts/Inter-Bold.ttf", "weight": 700 }, …]
// They are copied into the project's assets/fonts/ and get one @font-face each (format from the extension).
const home = (f) => f.replace(/^~(?=\/)/, process.env.HOME);
const FMT = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' };
const faces = [];
for (const role of ['display', 'ui']) {
  const R = P.fonts?.[role] || {};
  const list = filled(R.files) ? R.files : filled(R.file) ? [{ file: R.file, weight: R.weight || '100 900' }] : [];
  if (!list.length) { noFont.push(role); done.push(`font ${role}: none in preset (system face until capture.mjs finds the brand's)`); continue; }
  for (const { file: f, weight } of list) {
    const src = path.resolve(PRESET, home(f)), ext = path.extname(src).toLowerCase();
    if (!fs.existsSync(src)) { console.error(`font file missing: ${src}`); process.exit(1); }
    const name = list.length === 1 && ext === '.woff2' ? `${role}.woff2` : `${role}-${String(weight).replace(/\s+/g, '_')}${ext}`;
    fs.copyFileSync(src, path.join(PROJ, 'assets/fonts', name));
    faces.push(`  @font-face { font-family: '${role === 'ui' ? 'UI' : 'Display'}'; src: url(../assets/fonts/${name}) format('${FMT[ext] || 'woff2'}'); font-weight: ${weight}; }`);
  }
  done.push(`font ${role}: ${R.family || path.basename(list[0].file)} (${list.length} file${list.length > 1 ? 's' : ''})`);
}
if (faces.length && fs.existsSync(html)) {
  let src = fs.readFileSync(html, 'utf8');
  const roles = new Set(faces.map((f) => f.match(/font-family: '(\w+)'/)[1]));
  src = src.split('\n').filter((l) => !(l.includes('@font-face') && [...roles].some((r) => l.includes(`font-family: '${r}'`)))).join('\n');
  src = src.replace('<style>', '<style>\n' + faces.join('\n'));
  fs.writeFileSync(html, src);
}

// a role with no font file uses a local system face, so the page doesn't request a file that isn't there
if (noFont.length && fs.existsSync(html)) {
  let src = fs.readFileSync(html, 'utf8');
  for (const role of noFont) {
    src = src.replace(`src: url(../assets/fonts/${role}.woff2) format('woff2');`,
      `src: local('Helvetica Neue'), local('HelveticaNeue'), local('Arial'); /* no font in preset: replace with url(../assets/fonts/${role}.woff2) */`);
  }
  fs.writeFileSync(html, src);
}

// ---------------------------------------------------------------- colour tokens
const setColors = Object.entries(P.colors || {}).filter(([, v]) => filled(v));
if (!setColors.length) done.push('colours: none in preset (engine defaults until the style guide measures the brand)');
if (fs.existsSync(html) && setColors.length) {
  const map = { bg: '--bg', ink: '--ink', ink2: '--ink-2', accent: '--accent', card: '--card' };
  let src = fs.readFileSync(html, 'utf8');
  src = src.replace(/(:root\s*\{[\s\S]*?)(--bg:[^\n]*)/, (m, head, line) => {
    let l = line;
    for (const [k, tok] of Object.entries(map)) if (filled(P.colors[k])) l = l.replace(new RegExp(`${tok}:\\s*[^;]+;`), `${tok}: ${P.colors[k]};`);
    return head + l;
  });
  if (filled(P.fonts?.display?.weight)) src = src.replace(/(\.display \{[^}]*?font-weight: )\d+/, `$1${P.fonts.display.weight}`);
  if (filled(P.fonts?.display?.tracking)) src = src.replace(/(\.display \{[^}]*?letter-spacing: )[^;]+/, `$1${P.fonts.display.tracking}`);
  fs.writeFileSync(html, src);
  done.push(`colours: ${setColors.map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

// ---------------------------------------------------------------- timeline
const tlFile = path.join(PROJ, 'timeline.json');
if (fs.existsSync(tlFile)) {
  const TL = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
  const T = P.timeline || {};
  for (const k of ['duration', 'fps', 'bpm', 'formats']) if (filled(T[k])) TL[k] = T[k];
  if (T.music) TL.music = { ...TL.music, ...Object.fromEntries(Object.entries(T.music).filter(([, v]) => filled(v))) };
  if (T.mix) TL.mix = { ...(TL.mix || {}), ...T.mix };
  if (filled(P.brand?.product)) TL.title = `${P.brand.product} — film`;
  TL.brand = Object.fromEntries(Object.entries(P.brand || {}).filter(([, v]) => filled(v)));
  if (P.voiceover?.provider && P.voiceover.provider !== 'none') TL.voiceover = Object.fromEntries(Object.entries(P.voiceover).filter(([, v]) => filled(v)));
  if (P.transcribe?.provider) TL.transcribe = { ...P.transcribe };
  if (P.vo_layout) TL.vo_layout = { ...P.vo_layout };
  fs.writeFileSync(tlFile, JSON.stringify(TL, null, 2) + '\n');
  done.push(`timeline: ${TL.duration}s @ ${TL.bpm} bpm, formats ${TL.formats.join(' ')}`);
}

// ---------------------------------------------------------------- brief
const briefFile = path.join(PROJ, 'brief.md');
if (fs.existsSync(briefFile)) {
  const b = P.brand || {}, T = P.timeline || {}, V = P.voiceover || {};
  const font = (r) => P.fonts?.[r] && (P.fonts[r].family || P.fonts[r].file);
  const val = {
    'Product': b.product, 'URL': b.url, 'One-line promise': b.promise, 'Audience / platform': b.audience,
    'Duration (s)': T.duration, 'Formats': filled(T.formats) ? T.formats.join(', ') : null,
    'Brand colours': P.colors && Object.entries(P.colors).filter(([, v]) => filled(v)).map(([k, v]) => `${k} ${v}`).join(', '),
    'Fonts': [font('display') && `display: ${font('display')}`, font('ui') && `UI: ${font('ui')}`].filter(Boolean).join(' · '),
    'Reference film': b.reference, 'Music': T.music?.source,
    'Voiceover': V.provider === 'none' ? 'none' : [V.provider, V.voice].filter(filled).join(': '),
    'CTA / end card': b.cta, 'Must show': b.must_show, 'Must avoid': b.must_avoid,
  };
  let src = fs.readFileSync(briefFile, 'utf8').replace(/^\| ([^|]+?) \| \? \|/gm, (m, k) => (filled(val[k]) ? `| ${k} | ${val[k]} |` : m));
  if (filled(P.notes)) src = src.replace(/## Notes\s*$/, `## Notes\n${[].concat(P.notes).map((n) => `- ${n}`).join('\n')}\n`);
  src = src.replace('# Brief', `# Brief\n\nPreset: \`${path.basename(PRESET)}\` (${P.name || ''}). Fields it did not fill still say \`?\`.`);
  fs.writeFileSync(briefFile, src);
  done.push('brief.md prefilled');
}

fs.writeFileSync(path.join(PROJ, 'preset.json'), JSON.stringify({ from: path.basename(PRESET), ...P }, null, 2) + '\n');
console.log(`preset ${path.basename(PRESET)} applied to ${path.relative(process.cwd(), PROJ) || '.'}`);
for (const d of done) console.log('  ' + d);
