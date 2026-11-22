# Motion pilot

Before full production, choose the riskiest action or transition and make a short continuous pilot in the requested formats. A simple kinetic-type loop does not need a separate object-action pilot. A styleframe verifies composition, not motion quality.

Finished teaching scenes in `library/examples/`:

- `task`: a tool visibly changes document lines; the worker leaves while the partial result remains, then returns and completes it. The clock hand turns; its casing stays still.
- `handoff`: a document travels between containers, with its label attached; continuous entrance and exit.
- `edit`: select, replace text and retain the result in an explicitly generic teaching editor. Existing products still require real media.

```
node <skill>/scripts/pilot.mjs task <new-project-dir> --lang en
cd <new-project-dir>
node scripts/render.mjs --draft --all
node scripts/render.mjs --verify --all
python3 scripts/blindpack.py 1 --draft --visual-only
```

An installed local runtime (`init.sh`) is required. `pilot.mjs` installs nothing, calls no provider and refuses a nonempty destination. It also works from a scaffolded project. Labels default to English; `--lang ru` selects Russian. These three scenes run for 10 seconds, without voice, captions or audio. The render command creates both MP4s. These demonstrate mechanics, not a mandatory art style.

For two 6.6-second versions of the same postcard handoff, see the [collage and risograph studies](STYLES.md#postcard-studies).

Watch the continuous MP4, especially motion starts and finishes. Identify which object acts, what changes, where intermediate progress remains and what the result is. A changing status label alone does not prove an action. Give an independent reader only the picture pack and neutral BRIEF, without the intended interpretation.

For a series, compare object behaviour and transitions with the preceding MP4. A new user can use a runnable example of the relevant action as a baseline. After fixing the pilot, carry its mechanics into scenes while keeping the film's own content and style.

When a scene claims work on an object, show that object changing. A meter explains progress but does not itself demonstrate editing or returning to a task. For a return, separate the worker from the retained result so the viewer can observe each independently.

A drawn or generated action may explain an idea, but does not establish a real product's capability.
Evidence of that capability requires actual product states or a recording and a verifiable source.

When a hand performs the action, include its full chain in the pilot: approach → grip → action → release → exit,
plus the nearest cut. Check contact through turns and side changes, correct finger occlusion by a foreground
surface, and a departing limb leaving no strip across the frame. Placing a hand beside an already animated
object is not enough. This checks the chosen hand action; it does not require hands in a schematic animation.
An insertion pilot does not establish that opening and extraction work.
A version without hands can test a different staging choice, not the quality of hands or a rig.

At a handoff, occlusion or change of shot size, follow the object across the cut. How many copies are visible, who holds it, and which detail identifies it? Ask a blind viewer what changed hands and how they could tell. If the new staging obscures an opening, grip or handoff, restore the legible passage from the earlier cut and compare again. Add decoration and tracking labels once the action reads on its own.

## Comparing two variants

First identify the purpose of the comparison:

- **Texture or a local technique:** keep action, text, duration, geometry and audio identical;
  change the selected factor.
- **How the shot is made:** preserve meaning, the key result, duration, readability requirements and audio.
  Staging, geometry and image sources may differ: layered artwork, footage and 3D need not reproduce one rig's
  limitations. Compare image and action quality, retention of important detail and the effort of the next substantive
  revision, such as changing when an object is released. Include failed attempts when accounting for the time and
  cost of the accepted variant.

Write the decision criteria and acceptable regressions, then prepare a comparison:

```bash
.venv/bin/python scripts/compare.py renders/first.mp4 renders/second.mp4 review/comparison-1
```

The script assigns A/B randomly, strips audio, chapters and container/video-stream metadata without re-encoding the image,
and creates contact sheets and a neutral BRIEF. Dimensions, frame rate and frame count must match; only CFR is accepted.
The assignment mapping with SHA-256 is saved beside the folder, outside the reader's pack. The output directory must be new.
`--seed` reproduces the assignment; `--lang ru` selects a Russian brief (English is the default).

Give a fresh critic only the A/B folder, without sources, mapping or the desired conclusion.
Visible watermarks and other clues within the picture are not removed: inspect them yourself.
"No convincing advantage" is a valid outcome. Record whether continuous video was actually watched:
contact sheets do not prove the absence of flicker and cannot replace motion acceptance.

Repeated and backward seeks test the composition with fixed inputs. Keep the selected sources and resulting media
so a repeat render uses the same bytes. A repeated request to an external generative model, even with the same seed,
need not return an identical image. File integrity: [ASSETS.md](ASSETS.md); deterministic composition establishes
neither artistic quality nor the truth of the action shown.

### Material pilot

Treat material as a separate object layer that can be disabled for A/B without changing the action.
First make sure the flat version communicates the action. Then add a surface with a physical purpose:
fibres for paper, small ink gaps for a stamp. Hatching alone does not make a mug ceramic;
line direction should support its volume, and the body and handle should share a coherent material.

Compute the texture once during scene construction with a fixed seed. Draw in object-local coordinates,
clip to its contour and move with it. Do not generate fresh noise in `run(t)`. Keep text and meaningful details
above texture; distress letters only after checking readability at full size and phone size.

Compare repeated and backward seeks pixel by pixel; a held object must retain identical texture across frames.
Separately watch continuous motion at the final resolution: determinism does not rule out fine-pattern moire.
In a local pilot, paper and ink were preferred in still-frame comparisons in both formats; mug hatching lost
to the flat surface. This supports trying the first two techniques, not a mandatory style or a claim about
full-video quality. Judge a material in its actual frame and in motion; A/B helps when choosing between variants,
rather than being mandatory for every surface.
