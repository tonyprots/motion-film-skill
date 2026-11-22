# Local media registry

Use the registry to verify that selected files have not changed and to retain their provenance.
It is enabled by the first registration. Existing projects without `assets/manifest.json` keep working;
`check` reports `NOT CHECKED`, creates nothing, and does not claim to have checked all media.

## Suitability for the shot

Keep the selected image's master source separate from cutouts, resized copies and other derivatives.
Preparation depends on the action in the shot list:

- Independently moving object parts need suitable layers, attachment points and an occlusion order.
  If motion exposes a hidden part or background, prepare it; a cutout alone does not contain it.
- When a transparent layer is needed, check actual dimensions, alignment with the master, alpha, and edges against the scene background. An alpha-capable
  file format does not establish that alpha is present; check halos and missing detail after compositing.
- For a push-in or close-up, inspect the source at its largest planned screen size and required angle.
  If detail breaks down, check the primary source for a higher-quality version before upscaling or restaging;
  a larger file resolution does not remove softness baked into the recording. Record any staging limit in the
  shot list: a flat raster does not supply a new view of the object.
- After assembling a key frame, compare it with the master or selected visual reference: are shape, detail,
  colour, contact shadows, bounced light, and edge quality retained? Layers without light interaction can look pasted
  on even when contours match. If separation degrades the master, preserve the whole source and choose a supported
  movement; a separate layer is not required merely to add animation. For deformation, check intermediate poses as
  well as the source pose.

These are media-preparation and shot-list notes; `assets.py check` verifies file integrity, not suitability for motion.
A simple unchanged image needs no layer separation. Implementation choices: [LIBRARY.md](LIBRARY.md);
risky-action pilots: [PILOT.md](PILOT.md).

## Registration

Run from the project root:

```bash
python3 scripts/assets.py add assets/logo.svg --source https://example.com/brand --license unknown
python3 scripts/assets.py add assets/ui/account.png --metadata assets/ui/account.json
python3 scripts/assets.py add audio/sfx/click/example.wav --metadata audio/sfx/index.json
python3 scripts/assets.py add assets/broll/bridge_16x9.mp4 --metadata assets/broll/bridge_16x9.json
python3 scripts/assets.py check
```

`add` registers one existing file. `--source`, `--license`, and `--author` are supplied assertions;
the registry does not verify their legal validity. An unknown license remains `unknown` and produces a WARN during `check`.
Do not infer a license from a file extension, a generation model, or the file's public availability.

`--metadata` reads existing local JSON: `capture.mjs` records `source`/`url`,
`sfx_fetch.py` records source, author, and `licence` in its index; `broll.py` records model, job ID, and request fingerprint.
SFX entries are matched by the asset path relative to the index, not just the file name.
No metadata is fetched again. Selected fields, the JSON path, and its SHA-256 are retained;
the registry does not depend on the source website or API remaining available.

## Checking and updates

- PASS: the registered file matches its SHA-256 and byte size.
- FAIL: a file is missing, modified, or its path escapes the project. Exit code 1.
- WARN: the license is unknown; exit code 0. This does not authorize publication.
- NOT CHECKED: the registry is absent or empty. Unregistered files are not discovered automatically.

Paths must be relative and stay inside the project. Absolute paths, `..`, and links outside the project are rejected.
Internal symlinks are allowed; their targets are checked again on each `check` run.
The manifest and its lock file cannot register themselves.

After intentionally changing a file:

```bash
python3 scripts/assets.py add assets/logo.svg --refresh
python3 scripts/assets.py check
```

Without `--refresh`, changed bytes or metadata do not replace a record. With `--refresh`, a new revision is appended;
all earlier records stay in the manifest, and unspecified source/license fields are preserved.
Registering the same unchanged file again does not rewrite the registry. History stores metadata and hashes,
not previous media bytes: this command never changes, archives, or downloads the asset itself.

Commands return JSON. They verify registered file integrity, not license clearance, visual quality,
or the complete set of files actually used by a render. There is no global cache or new dependency.
