# README demo: the source

The 33-second film at the top of the main README, made with this skill. Everything an agent wrote for it:

| file | what it is |
|---|---|
| `SCRIPT.md` | story and script, approved before any audio |
| `brief.md` | the brief |
| `film/film.js` | the whole picture: five scenes timed from the voice marks |
| `film/index.html`, `film/peaks.js` | page with a few extra classes; the voice loudness envelope drawn in scene 3 |
| `timeline.json` | grid, formats, music sections |
| `captions.json` | burned-in captions, one entry per clause |
| `scripts/sfx_layout.py` | every UI sound, on its landing beat |
| `docs/review_log.md` | six critic rounds, from 5–7 to ship, with the evidence for every score |
| `preset/` | colours, Geist font (OFL), voice and music settings |

To rebuild it: `sh scripts/init.sh ~/films/readme-demo --preset <path to this preset>`. Then copy these files over the
project and run SKILL.md from step 4. You need your own voice key; the voice is regenerated, so the timing marks
will shift slightly.
