# User notes: the player, notes, verbal feedback

Read at SKILL.md step 9, when the user watches the film and leaves notes. The critic does not need this file: it does not
edit on the user's word.

## The player
`node scripts/player.mjs` → http://127.0.0.1:4173/ (Ctrl+C stops it). Scene and mark timeline, sound, 16:9 and 9:16.
Paused, click an element in the frame: the note keeps time, scene, mark and the element's address in `docs/notes.json`.
Palette, face and text knobs change the preview only and become a "change X to Y" note; the agent edits `film.js` /
`index.html`. No server: "Copy for Claude". Agents never keep the server running: check it with
`node scripts/player.mjs --selftest`.

## Notes
From chat: `scripts/notes.py add <t> "…" [--el "<element>"]`. Close every note with what changed and how it was checked
(`notes.py resolve N --reply "…"`). If the mistake can come back, `--rule "<rule>"` appends it to "Rules from notes" in
`docs/style_guide.md` with the date and the verbatim reaction; that section is read before every round and the next
issue. An open note blocks delivery (`notes.py list` before the final).

## Verbal feedback → diagnosis → trial
A note describes an impression, not its cause. Find the specific frame or interval and identify the level of the
problem: concept, image, source material, edit, or motion execution. State a testable hypothesis and change that
decision. Numbers come after diagnosis, when the issue actually concerns timing or a curve.

| Note | What to investigate first | How to check the trial |
|---|---|---|
| "livelier", "make it pop" | Is there an event, curiosity, and a change in what the viewer knows? Where is attention lost? | A short before/after sequence: did attention improve while meaning remained clear? |
| "more premium" | Locate the gap from the chosen professional reference: composition, shape, material, typography, lighting, or motion | A large frame and clip beside the reference; easing cannot repair a poor drawing |
| "it drags" | Which shot has delivered its information? Which pause supports reading or anticipation? | Re-edit the specific interval with sound; do not shorten every pause automatically |
| "too busy" | Do movement, cuts, sound, and reading compete? Is the main subject clear? | An uninterrupted clip at delivery size, including neighbouring shots |
| "looks AI-made" | Identify the visible defect: anatomy, repetition, generic graphics, arbitrary texture, or unmotivated movement | Replace the relevant material or staging and compare; do not turn a list of techniques into universal bans |

**The revision loop.** Preserve the original and test one coherent hypothesis at a time when identifying the cause of
improvement matters. Do not split a necessary change of composition and material into meaningless isolated edits.
Record a successful technique as a project decision; use `--rule` only for a recurring mistake, with its scope, not as
a new universal law. Fix all blocking defects from the critic.
