# Shotlist: <product> reel · <duration> s · <bpm> BPM · <n> beats · formats <…>

STATUS: DRAFT — waiting for the user's OK. Nothing gets built until this says APPROVED.

Beats are on the measured grid (`beats.json`). One row per shot; every row lists what is NEW on screen.
Rule check: something new every 2–4 s · hook readable by frame 0–2 s · end card holds ≤ 2 s and never goes static.
Direction: one hero moment at 60–85 % of the length (row marked **HERO**, music drop-out before it) · a quiet window of
0.6–1.2 s every ~20 s (marked **AIR**) · density 1–5 alternates, no more than three scenes in a row of the same length · every transition has a carrier.
Every row names a concrete **object** in frame (not "headline" or "background") and its **action** (not "appears").
On a screenshot the screen acts (cursor, new row, toggle), not the camera; a product without its screen is a sign card.
**Camera** is one move from RULES.md "The camera is punctuation": hold · push · pull · pan · snap · punch · whip · cut.
Accents at most a third, after a push comes a pull, a pan or a cut. The first and last rows are not a text card. Every
number in "On-screen text" is in the voice or a source. Check: `python3 scripts/plan_check.py`.

| # | Beats | Time (s) | Density 1–5 | Object | Action | Camera | On-screen text (exact) | Transition (preset, carrier) | SFX (timeline mark) | VO (exact line) | 9:16 notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0–4 | 0.0–2.0 | | Hook: | | | | | | | |
| 2 | | | | | | | | | | | |
| 3 | | | | | | | | | | | |
| … | | | | | | | | | | | |
| n | | | | End card: logo + CTA | | | | | | | |

## Music
Synth sections (timeline.json music.sections) or supplied track + where its drops fall.

## Open questions for the user
-
