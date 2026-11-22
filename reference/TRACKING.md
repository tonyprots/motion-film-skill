# Labels attached to moving objects

Optional local **translation-only** tracking for a small textured subject in one continuous shot.
Not full-person tracking, scale, rotation, deformation, perspective or camera tracking. Uses the existing
ffmpeg/ffprobe, NumPy and SciPy runtime; no API or additional installation.

## Prepare a track

Finish editing and normalizing the recording first. Track the **same final CFR video** shown by footage.js.
If overlay_prep.py --cut-pauses changed the recording, use its *-cut.mp4. Rotation metadata and variable frame
rates are rejected; normalize the source first.

```bash
.venv/bin/python scripts/track.py assets/recording/clip.mp4 \
  --roi 80,160,40,40 --out assets/tracks-object-v1.json
```

ROI is x,y,width,height in original source pixels at --start-frame (default 0).
Choose a textured patch whose appearance stays stable. Flat patches are rejected.
The rectangle keeps its size; output coordinates locate its center.

- --search 40: local displacement from the last accepted position, in original source pixels.
- --threshold 0.78: minimum NCC correlation, **not a probability** of a correct match.
- --margin 0.08: separation from another distinct peak; similar nearby objects can make a match ambiguous.
- --max-gap 5: maximum lost/recovering frames. Exceeding it locks the track as lost for the rest of this run.
- Recovery after a short loss requires two consecutive confident matches in the same bounded search area.
- --cut-threshold 0.25: a large mean absolute brightness change / 255 locks tracking.
  This is a conservative hard-cut cue, not a general shot detector.
- --analysis-width 640: downsample for analysis, never upscale; allowed range 32–1280.
  --max-frames 7200 limits clip length, with an upper bound of 36000. Raw frames are streamed.
  --timeout 120 sets a wall-time limit for decoding and analysis; a stalled ffmpeg process is terminated.

Output records source dimensions, fps, frame count and SHA-256, the original ROI, parameters and one sample per frame.
lost/recovering/not-started samples carry x:null,y:null. The saved search parameter is converted to analysis pixels.
Existing output files are not overwritten: use a new version filename.

## Attach a label

Load lib/tracking.js after core.js. Call follow before C.start(); JSON loading enters C.gates so frame zero waits.

```js
const label = C.el('div', {class: 'abs', style: 'font-size:28px;color:#fff'}, C.stage, 'Object');
TRACKING.follow(label, '../assets/tracks-object-v1.json', {
  box: C.REC, focus: [0.5, 0.5], offset: C.TL.recording.offset || 0,
  dx: 20, dy: -50,
});
```

box:{x,y,w,h} is a fixed cover area in stage coordinates. If box is omitted or equals C.REC, focus and offset
default to the recording and its current-format layout unless explicitly overridden. For a custom box, pass
focus/offset yourself. Put the label directly under C.stage, without transformed ancestors.
Do not combine this mapping with CAM.rig or transformed recording layers. dx/dy offset the label from the subject
center. Subjects outside the cover crop hide the label. The returned object exposes stop()/start().

Custom drawing: TRACKING.validate(track), then TRACKING.sample(track,time,offset) and
TRACKING.project(track,point,box,focus). Sampling is discrete: no smoothing or interpolation across gaps.
follow uses FRAME_T so shutter samples cannot move the label to a different source-video frame.

**Label position, leader lines and occlusion are separate jobs.** follow moves only the label element; it does
not draw a leader. Derive its endpoint from the same projected subject point and its start from the label
boundary after dx/dy. Check both formats: a fixed decorative line may end in empty space after repositioning.

Track loss hides the entire label; it is not a depth mask. Before building, decide whether the label is a screen
annotation above the recording or an object occluded by the foreground. The latter needs separate occluder
geometry/masking and suitable label placement; track.py does not recover either. Record a manual mask as manual,
not tracking output. Match narration such as "hidden" or "back" to the label's visible state, not just the point
status. Do not interpolate across track loss to support a mask.

sample also returns null outside the track duration. If the recording holds its last frame, align the label's
ending with that hold: finish both layers together or explicitly sample the same held source frame. This is valid
only for an actually held frame with a reliable point, not for filling lost/recovering gaps. Check the clip tail
after changing offset.

## Acceptance and limits

Inspect continuous playback before, during and after occlusion. A lost label disappears rather than drifting
onto a similar object. Check both formats because crop and dimensions change stage coordinates.
Fast motion beyond the search window, blur, deformation, repeated textures and strong lighting changes require
another method or manual anchors.

Offline pilot: 120 H.264 frames, noise, integer translation and three fully occluded frames.
Median fixed-label error was 123.179 px versus 0 px for the track; visible recall was 99.15%, false-visible labels
during occlusion 0. Zero error belongs to this simple synthetic test, not arbitrary footage.
Separate tests cover an ambiguous duplicate, a strong cut, leaving the frame and prolonged loss.
