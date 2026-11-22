# Generated inserts and hybrid video

Read when generated video is requested. The main code-driven workflow remains unchanged.
Keep text, numbers, real UI, logos and verifiable actions in deterministic layers.
Use a video model for material, lighting, atmosphere or organic texture when the brief benefits from it.

## Choose an operation

| Task | Current route |
|---|---|
| Atmospheric bridge between two frames of our film | `broll.py`, engine-generated first and last frames, no speech |
| Graphics over an existing recording | ENGINE → "Overlay on a recording"; audio and transcript come from the recording |
| Edit, extend, multiple keyframes or reframe an existing clip | Separate experiment with a suitable API; `broll.py` does not implement these operations |

A model name is not a capability contract. Check operations, duration, resolution, aspect ratio and frame-input
compatibility at the selected provider. A change at one provider does not imply removal elsewhere.
Do not mix `frame_images` and `input_references` without checking precedence: the former may change the mode
and override the latter.

## One shot's contract

In the shotlist record: subject and initial state → one observable action → final state; one camera movement;
duration; invariants; entry and exit; image provenance. The image sets the scene's appearance; the prompt describes
its development over time. Example: "A paper sheet slowly folds in half on a stationary table; locked camera;
one continuous shot." "Make it cinematic" alone is insufficient.

For a recurring subject, prepare a consistent image set and record scale, contact point and permitted deformation
in the style guide. These are review targets, not model guarantees. Fix an input image that implies the wrong
movement direction before generation; contradictory text is unreliable.

For models that accept several references, list each file and its role in upload order. A turnaround sheet establishes one character’s identity. A starting frame establishes the opening composition. If the surface loses detail in close-up, try a reference of the same detail at the intended scale. Check which input roles the selected model supports.

## Preserve paid results

`broll.py` without `--yes` plans without a paid request. Prices come from the current catalog;
unknown prices remain unknown. `--max-cost <USD>` caps the **estimate for new requests** in this run,
not the provider's final bill; an unknown price blocks this mode.

Request metadata, reference frames, job ID and original MP4 are kept inside the project under
`assets/broll/jobs/`. Repeating a run resumes a known job. If submission loses its response before an ID
arrives, no new paid request is sent automatically: find the previous job at the provider and attach it with
`--resume-job`, `--only`, `--fmt` and `--yes`. This prevents automatic resubmission; it does not promise
exactly-once execution by the API.

Cache identity includes the request and both reference frames' bytes. A changed scene invalidates it;
reference capture excludes previous video bridges. Old published versions remain under
`assets/broll/versions/`. Run `node scripts/sync.mjs` after generation.

## Review the insert

Two requested endpoint frames guide generation; they do not guarantee invisible cuts. Watch both boundaries in
a continuous MP4, at least half a second before and after, in each format. For a small jump, inspect consecutive
frames and a close crop of the affected object. Sparse contact sheets are insufficient.

Check separately:

- frame and object edges: previous-scene residue, scale or direction changes;
- the action: the subject changes, not just the camera;
- consistent shape, material and character; unrequested cuts;
- invented letters, numbers or logos; real UI preserved in neighbouring layers;
- duplicate frames at an extension boundary and drift by the end of the clip.

Record attempts and the cost of the **accepted** clip. Cheap generations with repeated repairs can produce
an expensive result. A seed does not promise bitwise reproducibility from an external model.

Place custom sound cues against the accepted clip. Find the contact frame, such as a wheel touching a ramp, account for the trim and playback rate, and check the sound against the picture in the final edit.

## When to extend the workflow

Before adding edit/extend/multi-keyframe, compare a short code-driven pilot with a hybrid version using the same
script and audio, randomized for an independent critic. Set criteria before running: action clarity, subject
preservation, continuity, repair time and cost. Better texture cannot compensate for lost meaning.
Until tested, the route remains experimental; do not enable new providers or dependencies automatically.
