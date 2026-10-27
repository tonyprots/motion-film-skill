# README demo: the source

The 35-second film at the top of the main README, made with this skill. Everything an agent wrote for it:

| file | what it is |
|---|---|
| `SCRIPT.md` | story and script, approved before any audio |
| `brief.md` | the brief |
| `film/film.js` | the whole picture: seven scenes and the presenter layer, timed from the voice marks |
| `film/index.html` | the page, with a chip class and a rule that hides a caption under a wipe |
| `film/peaks.js`, `scripts/peaks.py` | the voice loudness envelope drawn in scene 3, and the script that measures it |
| `timeline.json` | grid, formats, voice, music sections, mix |
| `captions.json` | burned-in captions, one entry per clause |
| `scripts/sfx_layout.py` | the two hits: the SHIP stamp and the end mark |
| `docs/review_log.md` | five rounds of checks and critics, the scores and the blind reads |
| `preset/` | colours, Geist font (OFL), voice and music settings |

## The presenter is not included
The presenter is a private puppet pack (`PUPPET`, see reference/EDITORIAL.md): its pose and mouth images are not part of
this repository. `film.js` takes the first pack it finds in `assets/puppets/` and never names it. Without a pack it
falls back to the drawn `ACTOR`, so the film still builds. To use your own presenter, make a pack with
`scripts/puppet_pack.py` and put it in the project's `assets/puppets/` before rendering. The mouth tiles in scene 5
show that pack's mouth shapes.

## Rebuild
`sh scripts/init.sh ~/films/readme-demo --preset <path to this preset>`, copy these files over the project, then run
SKILL.md from step 4. You need your own voice key; the voice is regenerated, so the timing marks shift slightly. After
the voice, run `python3 scripts/peaks.py` to measure the new waveform.
