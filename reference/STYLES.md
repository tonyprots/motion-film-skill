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
| Type | preset fonts; the site's fonts (`capture.mjs`); a free font that covers the language; an accent italic for key words only | preset, else the site | `preset.jsonc` → `fonts`, `film/index.html` |
| Palette | one accent; colour encodes entities or states; chapter worlds: a chapter's background changes with its meaning (a consequence on the accent, a definition on dark) | one accent | `preset.jsonc` → `colors`, scene background in `film.js` |
| Pictures | the real interface; a brand card; object illustrations (`ILLUSTRATIONS`, 30 objects; `skin`: `line` — line and soft shadow, `flat`, `mono`, `sketch`); extras `ILLUSTRATIONS.extra` (563 Noto Emoji objects in the same `skin`); icons (Lucide, Tabler, Phosphor); photos with a cut-out (`vision.py`); charts and counters (`BLOCKS`) | by the material, `FORMATS.md` | `LIBRARY.md`, `EDITORIAL.md`, `PROPS.md` |
| Character | none; a drawn presenter (`ACTOR`, a pool of looks via `character`: `classic`, `casual`, `woman`, picked for the voice and tone) or a puppet drawn as pictures (`PUPPET`, mouth from the words via `LIPSYNC`); a real person (a recording as the base, step 4b) | none | `EDITORIAL.md`, RULES "Characters and people" |
| Captions | bottom, a line at a time (`CAPTIONS.scene`); bottom, word by word (`CAPTIONS.karaoke`, in "An image per phrase"); top: the voice line large, words appearing as they are spoken; kinetic type instead of captions (the "Kinetic statement" format); no captions only in a film without a voice | bottom, a line at a time | `CAPTIONS.scene`, `CAPTIONS.karaoke({ bottom })` or `({ y })` |
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
