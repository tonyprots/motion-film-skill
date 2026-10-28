# Styles: the look of a film, set for the situation

A film is decided on four independent axes. The **arc** (`STORY.md`) is the order in which it leads to the point. The
**format** (`FORMATS.md`) is the language it shows it in. The **brand** (`presets/`) is whose colours, type and voice.
The **style** (this file) is how exactly the film looks and sounds: type, palette, pictures, character, captions, music.

A style is a set of switches, not one house look. One film needs a character, music and captions at the top; another
needs only the interface, silence and text at the bottom. The defaults in `RULES.md` are a starting point, not an
obligation. The quality bar does not depend on the style: `--lint`, `--seams`, `stillness.py`, the blind read and the
critique are the same for all.

## Switches

| Switch | Options | Default | Where it is set |
|---|---|---|---|
| Type | preset fonts; the site's fonts (`capture.mjs`); a free font that covers the language; an accent italic for key words only; stage themes (`THEMES`, ENGINE "Isometry and stage themes"): OFL fonts with Cyrillic, outside the overused set | preset, else the site | `preset.jsonc` → `fonts`, `film/index.html` |
| Palette | one accent; colour encodes entities or states; chapter worlds: a chapter's background changes with its meaning (a consequence on the accent, a definition on dark); a whole stage theme (`THEMES`: palette, light, object colours) | one accent | `preset.jsonc` → `colors`, scene background in `film.js` |
| Pictures | the real interface; a brand card; object illustrations (`ILLUSTRATIONS`, 30 objects; `skin`: `line` — line and soft shadow, `flat`, `mono`, `sketch`); extras `ILLUSTRATIONS.extra` (563 Noto Emoji objects in the same `skin`); icons (Lucide, Tabler, Phosphor); photos with a cut-out (`vision.py`); charts and counters (`BLOCKS`); isometric objects on a stage (`ISO`) | by the material, `FORMATS.md` | `LIBRARY.md`, `EDITORIAL.md`, `PROPS.md` |
| Character | none; a drawn presenter (`ACTOR`, a pool of looks via `character`: `classic`, `casual`, `woman`, picked for the voice and tone) or a puppet drawn as pictures (`PUPPET`, mouth from the words via `LIPSYNC`); a real person (a recording as the base, step 4b) | none | `EDITORIAL.md`, RULES "Characters and people" |
| Captions | bottom, a line at a time (`CAPTIONS.scene`); bottom, word by word (`CAPTIONS.karaoke`, in "An image per phrase"); top: the voice line large, words appearing as they are spoken; kinetic type instead of captions (the "Kinetic statement" format); no captions only in a film without a voice; the whole page at once, the spoken word on a plate (`CAPTIONS.karaoke({ current: true })`) | bottom, a line at a time | `CAPTIONS.scene`, `CAPTIONS.karaoke({ bottom })` or `({ y })` |
| Numbers | a static figure; a drum counter (`BLOCKS` rolling-number, `mode: 'drum'`); a running total in a corner as a thread through chapters | per the script | `BLOCKS` |
| Music | `synth`; a ready track; `ace` (local); an external provider; `none` | `synth` | `timeline.json` → `music.source`, `AUDIO.md` |
| Sound effects | on meaningful hits; synth or library; no SFX | meaningful hits | `timeline.json` → `sfx_source`, `AUDIO.md` |
| Voice | synthesis; own recordings; no voice | synthesis | `preset.jsonc` → `voiceover`, `PROVIDERS.md` |

## How to choose

The style follows the platform, the material and the series, not the taste of the last film.

- **Watched without sound** (a feed, Telegram, a meeting): captions are mandatory and large; music can be skipped.
- **There is a real product**: its interface or a brand card, not illustrations that look like the product.
- **A story about consequences, risks, people**: object illustrations and, where it fits, a character who reacts to events.
- **Many chapters with no shared object**: give them a thread: a character, a running total or a shared object.
- **A series**: the series style goes into the preset (`style`), and every episode inherits it.

**Where it is recorded.** A "Style" line in `brief.md`: every switch that differs from the default, with one phrase on
why. In the step-5 style guide: what exactly it overrides in `RULES.md` (e.g. "captions at the top: RULES 'Captions',
the top was chosen by the style, the 14 % zone stays clear"). A preset can set the style up front: a `style` block in
`preset.jsonc` lands in the brief.

## Stage and an object per phrase (an option, not yet a recipe)

A vertical breakdown of a news story or a company's history: a dark or light stage with a floor, one isometric object
per phrase on it (a bundle of money, a building, figures, counter tiles), a large heading or number above, and at the
bottom the whole phrase as a page with the spoken word on a plate. The object changes state on the voice's word
(`<id>.w<k>`): the money flies off on "lost", the building rises on "to launch", tiles light up as the count runs. Popular
breakdown reels are built this way; on 2026-10-28 four scenes of one were rebuilt with the engine and shown side by side
with the original.

- Pictures: `ISO` (ENGINE "Isometry and stage themes"), one object per phrase, no icons or cards around it.
- Palette and fonts: one of the `THEMES`. The `reference` theme (purple-orange haze, wide grotesque) is what everyone
  does; do not pick it, it is there for comparison. Choose between `newsroom`, `studio`, `blueprint`, `riso`, `graphite`
  by the material: money and risk — `newsroom` or `graphite`, technology and how things work — `blueprint`, a light
  touch — `riso`, a calm breakdown for an adult audience — `studio`, a Reels feed for a young audience — `feed`. A light theme is the default wherever there is no
  reason for a dark one.
- Captions: `CAPTIONS.karaoke({ current: true, exit: 'cut' })`, centred.
- Numbers: a counter that runs to its value on the word (held with `C.frameTime`, or sub-frames mix two values).
- Not for: a product with a real interface, a film with a presenter, anything longer than 90 s (the stage tires).
- Object pictures: figures from the library (LIBRARY "Figures"), tinted to the theme.
- Status: the Character AI film in `blueprint` passed two blind critique rounds; the customer's review of it is below.
  The section becomes a recipe after a film built with these lessons.

### Lessons from the test film (2026-10-28)

The Character AI film in the `blueprint` theme passed two blind critique rounds, and the customer still found defects
the critic never named. Each is now a rule of this style:

- **One projection per frame.** Everything on the stage lies in isometry with a contact shadow. A flat sheet, stamp or
  card over a 3D object reads as a sticker (lawsuit sheets lying flat on a 3D stage). Paper is the `papers` or `document`
  figure; text on it goes through `ISO.onTop`.
- **No stamps or plates on graphics.** A yellow "BANKRUPT" stamp on a sheet looks foreign. The object shows the state
  itself: the money flies off, the windows go dark, the bar drops.
- **Overlap only when physically true.** Objects are painted by depth (`ISO.layer`), not in call order. Money between the
  character and the building is a layer-order bug. A deliberate overlap that could happen in the world is fine.
- **A callout is tied to its object.** A speech bubble or label runs its tail to a point on the object (`ISO.callout`)
  instead of floating in the air next to the building.
- **An abstraction reads without a label.** A grid of squares does not read as a map of the states. Use the real shape
  (an outline from an open set, `source:*` in LIBRARY) or another object.
- **Real people get their photos.** A founder, a judge, a CEO — a real licensed portrait (Wikimedia Commons, a press
  kit) in the `portrait` frame through `ISO.figureQuad`. A token with initials is only for a generic "user".
- **A caption does not repeat the screen.** If the line is already written in the frame (headline, chip, text on an
  object), it gets no caption: an empty entry in `captions.json`. `render.mjs --lint` catches a repeat ("AI-boom
  startup" twice), canvas text included.
- **Figures, not boxes.** Objects come from the library (LIBRARY "Figures"), tinted to the theme; `box` stays for tiles,
  counters and bundles.
- **From the critique of the same film.** A counter reaches its total within 0.45 s and never sits on "0". Do not strike
  through a negation: it becomes a double one. Evidence that fades reads as "fake". Entrances come with a spring and
  scale, not opacity. A headline does not slide out through a mask at the frame edge. The main object spans at least
  65 % of the frame width. The blind reader also gets in-between frames, not only frames on the words.

**Fonts for the feed.** Instagram Sans is proprietary and unavailable outside the app. Reels of 2025–2026 use pairs that
have Cyrillic and an OFL licence:

| Pair | Character | Where |
|---|---|---|
| Unbounded + Inter (or Onest) | wide geometric grotesque, young and loud | the `feed` theme |
| Sofia Sans Extra Condensed + Inter | narrow poster caps, news and numbers | the `newsroom` theme (with Commissioner) |
| Playfair Display + Montserrat | high-contrast serif, "magazine", calm delivery | your own theme |
| Manrope or Onest alone | neutral UI grotesque | fallback for any theme |

Anton, Bebas Neue, Poppins, League Spartan and DM Sans are popular but lack Cyrillic in their Google Fonts builds: do not
use them for a Russian film.

## Recipes

A recipe is a set of switches proven on a real film. A new recipe is added only after a film that passed blind
critique, with the film and the score next to it. An untested combination is not a recipe but one film's choice.

### Editorial breakdown with a presenter (2026-10-26)

Proven on a vertical breakdown of legal risks (70 s, 9:16): against a reference film with the same content and sound,
2:1 with three blind critics, ahead on readability and polish, behind on character and objects.

- Type: a bold grotesque for captions and figures; key words in an accent italic in the accent colour.
- Palette: a light background and one accent; consequence chapters on the accent background, the definition on dark.
- Pictures: object illustrations in line with a soft shadow; the form, the email, the bill look like real ones.
- Character: one presenter at the bottom of the frame; reacts to events (surprise, worry, relief), points at the
  object that changes, changes scale smoothly, never on the cut.
- Captions: at the top, large, words appearing as they are spoken.
- Numbers: a running total in a corner as a thread through the chapters, sums roll on a drum; in chapters where the
  total would argue with the voice, it leaves.
- Every chapter gets an event inside it (a hit, a tick, a tag flying over), or the frame stands still: `stillness.py`.
- Not for: a product demo with the real interface, a calm corporate tone.
- Sound was not tested in this recipe: voice and sound were shared by both films in the comparison.
