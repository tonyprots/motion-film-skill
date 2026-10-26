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

## Verbal feedback → numbers (2026-10-22)
A note in words ("livelier", "more premium") is not a change. Turn it into numbers first, then change one thing.

| Note | What changes | How to check |
|---|---|---|
| "livelier", "make it pop" | a scale hit on the key word or number the voice names: 1.0 → 1.08 → 1.0 over 6 frames (0.1 s at 60 fps), peak exactly on the beat; at most one per scene | `--at` on the beat and ±3 frames around it |
| "more premium" | linear moves (`C.seg`) — ease-out-quint, `cubic-bezier(0.22, 1, 0.36, 1)`, in code `1 - (1 - x) ** 5`; container springs — ζ = 0.8 (~1.5 % overshoot); text — `heavy` (ζ = 1), no overshoot | `--range` over the scene: no overshoot on text in the strips |
| "it drags" | every pause one beat shorter: `air`, `pre`, `hold` in `SCRIPT.md`, quiet windows, holds between events; text hold never below the RULES.md "Rhythm" rule | `plan_check.py`, `--animatic` |
| "too busy" | one main move per shot; the rest start 150 ms later and travel 60 % of its path (RULES.md "Motion hierarchy") | `strip_fast*.jpg`: one fastest element in frame |
| "looks AI-made" | list every default move in the shot (a fade entrance, a uniform cascade, a slow push on every shot, a preset with no role), ban each with a line in the style guide's "Rules from notes" and re-render | the new sheet or clip against the last one: none of the listed moves left |

**The revision loop.** Taste notes — one or two per round, not all at once: after five changes at once you cannot tell
which one worked. A change that worked becomes a rule through `notes.py resolve N --rule "…"`. This does not limit the
critic's blocking defects: fix all of them.
