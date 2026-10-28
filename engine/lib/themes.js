// Stage themes (motion-film): an OPTION for the "stage + one object per phrase" style (lib/iso.js), never a default.
// Each theme is a full set — palette, light on the stage, fonts, object colours — chosen so the film does not look like
// every other dark reel (purple-orange haze + wide grotesque caps; that one is kept as `reference`, for comparison only).
//
//   const T = THEMES.use('newsroom');            // first lines of film.js: sets --bg/--ink/--ink-2/--accent and adds
//   C.fonts = [`${T.dw} 100px ${T.D}`, `600 40px ${T.U}`, `800 100px ${T.N}`];   // @font-face for the theme's fonts
//   (font files: sh scripts/fonts.sh <theme> → assets/fonts/v/<file>-cyrillic|latin.woff2, OFL, from Fontsource)
//
// Fields: bg ink ink2 acc (numbers) acc2 (units) · D U N font families (display, UI, numbers), dw display weight, caps,
// ls tracking, size (display scale: a condensed face can go bigger) · stage: glow | pool (a lamp pool with falloff) |
// spot (light cyclorama) | blueprint (drafting grid) | riso (paper grain, misregistered type: misreg) · mood [calm,
// alarm, good] light colours, glowA strength · floor/floorA (ISO.floor), dust, vign (vignette) · money band goog googWin
// cai caiWin plinth p1 p2 tileOff tileOn tileGlow: object colours [r,g,b] (rename for your film's objects) · card
// cardLine skel: DOM cards · chip chipInk labelPlate labelInk edge: plates and box edges.
// Caption plate for CAPTIONS.karaoke({ current: true }): light stages use ink/bg, dark ones chip/chipInk.
// The `reference` theme uses the project's own Display/UI faces (film/index.html), no files from fonts.sh.
(() => {
  const FONTS = {
    sofia: ['Sofia', 'sofia-sans-extra-condensed'], literata: ['Literata', 'literata'], tektur: ['Tektur', 'tektur'],
    martian: ['Martian', 'martian-mono'], geologica: ['Geologica', 'geologica'], commissioner: ['Commissioner', 'commissioner'],
    dela: ['Dela', 'dela-gothic-one', '400'], unbounded: ['Unbounded', 'unbounded'], inter: ['Inter', 'inter'],
  };
  const THEMES = {
    reference: { bg: '#0b0a10', ink: '#f4f2ee', ink2: '#8d8a99', acc: '#ff5222', acc2: '#3ddc84', D: 'Display', U: 'UI', N: 'Display',
         dw: 800, caps: true, ls: '0', size: 1, stage: 'glow', mood: [[112, 84, 255], [255, 74, 30], [40, 200, 110]], glowA: 0.42,
         floor: [150, 140, 200], floorA: 0.16, dust: [220, 214, 255], vign: 0.6,
         money: [118, 206, 132], band: [246, 240, 224], goog: [58, 56, 66], googWin: [255, 244, 214], cai: [96, 72, 230], caiWin: [196, 184, 255],
         plinth: [30, 28, 38], p1: [70, 112, 255], p2: [255, 72, 92], tileOff: [40, 37, 52], tileOn: [255, 74, 30], tileGlow: true,
         card: 'linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.03))', cardLine: 'rgba(255,255,255,.10)', skel: ['#34303e', '#2c2935', '#4a4656', '#2a2733'],
         chip: '#f4f2ee', chipInk: '#16141c', labelPlate: 'rgba(244,242,238,0.95)', labelInk: '#16141c', edge: 'rgba(255,255,255,0.30)' },
    newsroom: { bg: '#0c1411', ink: '#eef0e6', ink2: '#86948b', acc: '#ffb21e', acc2: '#3fd6c2', D: 'Sofia', U: 'Commissioner', N: 'Sofia',
         dw: 900, caps: true, ls: '0.01em', size: 1.42, stage: 'pool', mood: [[63, 214, 194], [255, 140, 30], [120, 230, 150]], glowA: 0.30,
         floor: [130, 200, 175], floorA: 0.14, dust: [230, 240, 220], vign: 0.7,
         money: [120, 196, 120], band: [240, 232, 200], goog: [52, 64, 60], googWin: [255, 214, 140], cai: [26, 130, 118], caiWin: [180, 255, 236],
         plinth: [22, 32, 29], p1: [63, 214, 194], p2: [255, 178, 30], tileOff: [30, 44, 40], tileOn: [255, 178, 30], tileGlow: true,
         card: 'linear-gradient(180deg,rgba(220,255,240,.07),rgba(220,255,240,.025))', cardLine: 'rgba(220,255,240,.10)', skel: ['#25352f', '#1f2d28', '#3b4b45', '#1c2925'],
         chip: '#ffb21e', chipInk: '#0c1411', labelPlate: 'rgba(238,240,230,0.95)', labelInk: '#0c1411', edge: 'rgba(230,255,240,0.26)' },
    studio: { bg: '#dfe3e8', ink: '#121418', ink2: '#5c636d', acc: '#d8261a', acc2: '#1f7a46', D: 'Literata', U: 'Commissioner', N: 'Literata',
         dw: 800, caps: false, ls: '-0.02em', size: 1.08, stage: 'spot', mood: [[255, 255, 255], [255, 236, 228], [236, 255, 240]], glowA: 0.9,
         floor: [90, 100, 115], floorA: 0.18, dust: null, vign: 0.16,
         money: [86, 176, 110], band: [250, 248, 240], goog: [176, 182, 192], googWin: [255, 230, 160], cai: [36, 62, 210], caiWin: [210, 224, 255],
         plinth: [196, 201, 209], p1: [36, 62, 210], p2: [216, 38, 26], tileOff: [196, 202, 210], tileOn: [216, 38, 26], tileGlow: false,
         card: '#f6f7f9', cardLine: 'rgba(18,20,24,.08)', skel: ['#dde1e6', '#e6e9ed', '#9aa1ab', '#c9ced5'],
         chip: '#121418', chipInk: '#f6f7f9', labelPlate: 'rgba(18,20,24,0.92)', labelInk: '#f6f7f9', edge: 'rgba(255,255,255,0.55)' },
    blueprint: { bg: '#1238a8', ink: '#f2f5ff', ink2: '#a9bcff', acc: '#ffd23f', acc2: '#ffd23f', D: 'Tektur', U: 'Commissioner', N: 'Martian',
         dw: 800, caps: true, ls: '0.02em', size: 1.0, stage: 'blueprint', mood: null, glowA: 0,
         floor: [220, 230, 255], floorA: 0.26, dust: null, vign: 0.35,
         money: [255, 210, 63], band: [18, 56, 168], goog: [40, 86, 200], googWin: [242, 245, 255], cai: [58, 110, 235], caiWin: [255, 210, 63],
         plinth: [24, 66, 180], p1: [242, 245, 255], p2: [255, 210, 63], tileOff: [34, 78, 196], tileOn: [255, 210, 63], tileGlow: false,
         card: 'rgba(242,245,255,.06)', cardLine: 'rgba(242,245,255,.55)', skel: ['rgba(242,245,255,.25)', 'rgba(242,245,255,.18)', 'rgba(242,245,255,.35)', 'rgba(242,245,255,.10)'],
         chip: '#ffd23f', chipInk: '#1238a8', labelPlate: 'rgba(242,245,255,0.95)', labelInk: '#1238a8', edge: 'rgba(242,245,255,0.9)' },
    riso: { bg: '#f1efe8', ink: '#0d5fb0', ink2: '#5b84b8', acc: '#ff3fa4', acc2: '#ff3fa4', D: 'Dela', U: 'Commissioner', N: 'Dela',
         dw: 400, caps: true, ls: '0', size: 0.9, stage: 'riso', mood: null, glowA: 0, misreg: '#ff3fa4',
         floor: [13, 95, 176], floorA: 0.22, dust: null, vign: 0,
         money: [255, 226, 0], band: [255, 63, 164], goog: [13, 95, 176], googWin: [255, 226, 0], cai: [255, 63, 164], caiWin: [255, 236, 120],
         plinth: [190, 200, 214], p1: [13, 95, 176], p2: [255, 63, 164], tileOff: [205, 212, 222], tileOn: [255, 63, 164], tileGlow: false,
         card: '#fbfaf6', cardLine: 'rgba(13,95,176,.25)', skel: ['#d9e2ee', '#e4eaf2', '#8fb0d6', '#c4d3e6'],
         chip: '#0d5fb0', chipInk: '#fbfaf6', labelPlate: 'rgba(251,250,246,0.96)', labelInk: '#0d5fb0', edge: 'rgba(255,255,255,0.5)' },
    graphite: { bg: '#1a1917', ink: '#ecebe4', ink2: '#8f8b83', acc: '#c9f031', acc2: '#c9f031', D: 'Geologica', U: 'Geologica', N: 'Geologica',
         dw: 800, caps: false, ls: '-0.035em', size: 1.1, stage: 'pool', mood: [[255, 248, 236], [255, 248, 236], [255, 248, 236]], glowA: 0.13,
         floor: [236, 235, 228], floorA: 0.08, dust: null, vign: 0.55,
         money: [201, 240, 49], band: [26, 25, 23], goog: [70, 68, 64], googWin: [236, 235, 228], cai: [118, 115, 108], caiWin: [201, 240, 49],
         plinth: [40, 39, 36], p1: [236, 235, 228], p2: [201, 240, 49], tileOff: [48, 47, 44], tileOn: [201, 240, 49], tileGlow: false,
         card: 'rgba(236,235,228,.05)', cardLine: 'rgba(236,235,228,.10)', skel: ['#34332f', '#2c2b28', '#55534d', '#262522'],
         chip: '#c9f031', chipInk: '#1a1917', labelPlate: 'rgba(236,235,228,0.95)', labelInk: '#1a1917', edge: 'rgba(255,255,255,0.22)' },
    // «Лента»: the faces Reels makers reach for in 2025–2026 that have Cyrillic and an open licence. Instagram Sans is
    // Meta's own and not licensed outside the app; Inter is its nearest open twin, Unbounded the wide display of 2026.
    feed: { bg: '#ffffff', ink: '#0f1012', ink2: '#6b6f76', acc: '#3d5afe', acc2: '#ff4d2e', D: 'Unbounded', U: 'Inter', N: 'Unbounded',
         dw: 800, caps: false, ls: '-0.02em', size: 0.92, stage: 'spot', mood: [[255, 255, 255], [255, 240, 236], [240, 244, 255]], glowA: 0.9,
         floor: [60, 70, 90], floorA: 0.10, dust: null, vign: 0.08,
         money: [120, 214, 140], band: [255, 255, 255], goog: [222, 226, 234], googWin: [255, 232, 160], cai: [61, 90, 254], caiWin: [214, 222, 255],
         plinth: [232, 235, 240], p1: [61, 90, 254], p2: [255, 77, 46], tileOff: [226, 230, 238], tileOn: [61, 90, 254], tileGlow: false,
         card: '#ffffff', cardLine: 'rgba(15,16,18,.08)', skel: ['#eceef2', '#f2f3f6', '#a6abb4', '#d7dbe2'],
         chip: '#0f1012', chipInk: '#ffffff', labelPlate: 'rgba(15,16,18,0.92)', labelInk: '#ffffff', edge: 'rgba(255,255,255,0.7)' },
  };
  function use(name) {
    const T = THEMES[name];
    if (!T) throw new Error(`unknown theme: ${name} (${Object.keys(THEMES).join(', ')})`);
    const css = [];
    for (const [fam, file, wt = '100 900'] of Object.values(FONTS)) if ([T.D, T.U, T.N].includes(fam))
      for (const [sub, range] of [['cyrillic', 'U+0400-04FF, U+2010-2027'], ['latin', 'U+0000-03FF, U+2000-200F, U+2028-206F, U+20A0-20CF']])
        css.push(`@font-face{font-family:'${fam}';src:url(../assets/fonts/v/${file}-${sub}.woff2) format('woff2');unicode-range:${range};font-weight:${wt}}`);
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css.join('\n') }));
    const rs = document.documentElement.style;
    rs.setProperty('--bg', T.bg); rs.setProperty('--ink', T.ink); rs.setProperty('--ink-2', T.ink2); rs.setProperty('--accent', T.acc);
    return { name, light: T.stage === 'spot' || T.stage === 'riso', ...T };
  }
  window.THEMES = { ...THEMES, use, names: Object.keys(THEMES), fonts: FONTS };
})();
