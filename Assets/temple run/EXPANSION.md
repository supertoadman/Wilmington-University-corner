# Temple Run motion, world and audio pack

Open `expansion-preview.html` through `npm run preview` for animation, layering, parallax and music review. `viewer.html` shows the full collection. Audio decoding uses fetch, so use HTTP rather than a file URL.

## Deliverables and runtime

All **143 asset IDs** remain. The expansion contains six philosopher move sets, two chaser cycles, 22 obstacle/scenery images, six 2048×1024 backgrounds, three music loops and 16 themed effects. Each philosopher has run 6, jump 3, slide 3, stumble 2, fall 3 and idle 1. Each chaser has six run frames.

Every raster runtime image is **WebP quality 80** (near the requested 85). Alpha quality is 50 for sprites/props and 85 for soft backgrounds; alpha remains intact as a channel, with lossy quantization to meet the web budget. The two divine lintel layers use **lossless WebP** to prevent encoder edge differences at the join. Original SVG UI/grid assets remain vectors. Every audio asset has **Ogg/Vorbis and M4A/AAC** versions. `runtimeBytes` counts every primary file and both audio formats exactly once; source masters are excluded. Validation enforces a **15,000,000-byte** ceiling.

## Repairs

The divine lintel uses a continuous repaired assembly, split into complementary masks at x=320. Both layers retain 640×640 canvases and (0.5, 1) anchors. Draw back → actor → front at identical positions/scales. The PNG layers reconstruct the continuous assembly exactly, eliminating the old step. The corrupt assembly is preserved.

Divine/corrupt Plato and Aristotle have redrawn `fall-ground` poses based on `fall-air`: head left, feet right, back/near side down. Socrates is preserved. The individual source frames and combined runtime sheets contain the same corrected poses.

## Paths and housekeeping

- `textures/{theme}/{category}/{id}.webp`: runtime raster images and combined sheets.
- `audio/`: Ogg and AAC runtime audio, including `audio/expansion/`.
- `vectors/`: original SVG runtime assets.
- `masters/exports/textures/`: exact expansion PNG exports underlying the WebP files.
- `masters/frames/`: 120 individual 640×640 PNG source frames, not deployed.
- `masters/audio/`: WAV masters; `masters/encoding/`: guarded encoding inputs.
- `masters/repairs/`: generated repair artwork. Original generated artwork remains under `masters/{theme}/`.
- `masters/previous-frames/` and `masters/previous-runtime/`: archived earlier exports.

Git ignores `masters/`, `node_modules/`, ZIPs and ZIP checksums. There is no top-level `frames/` directory. Deploy runtime directories, manifests and desired preview files; omit ignored source folders. Validation checks Git's tracked/unignored file list for the **50,000,000-byte per-file limit**.

## Manifest 2.0 migration

Asset IDs and animation names remain unchanged. The schema major version changes because frame `src` and `bytes` fields are replaced by source-only `master` and `masterBytes`. Runtime consumers crop the parent WebP sheet using frame `x`, `y`, `width`, `height` and `anchor`; they no longer fetch individual PNGs. Asset `src` and `bytes` describe its compressed primary file. Asset `master` points to PNG/WAV source and is intentionally unavailable in a runtime-only deployment.

Audio `sources` lists both encodings with MIME type, codec, bytes, sample rate and encoded loop bounds. `runtimeBytes` includes the alternatives.

## Animation and backgrounds

New frames are 640×640 with (0.5, 1) anchors: draw at `(worldX - 320, worldY - 640)`. Ground contact leaves an 8px lower margin. Camera follows the stylized northeast three-quarter reference on a 256×128 logical grid; these are artistic sprites rather than calibrated 3D renders.

Run uses 12 fps; jump, slide and stumble 8 fps; fall 7 fps. Hold `slide-hold` until release, then play `slide-rise`. Select jump poses from physics; `jump-air` already includes 72px visual lift. Original sheets were upscaled; repaired landings use individually generated source artwork. Other generated limb/cloth details may still benefit from motion polish.

Background layers repeat every 2048px using a 256px premultiplied-alpha overlap blend. Composite over manifest `baseColor` in far/middle/near order. Suggested scroll factors: 0.12, 0.35, 0.7; preview near opacity: 0.45. Seam validation reads decoded WebP.

## Encoded audio and accurate loops

Divine music: 76.8 seconds; corrupt: 71.111111 seconds; menu: 72 seconds. Original synthesized compositions and effects are preserved. Ogg uses managed 48 kbps Vorbis; AAC uses 48 kbps; both use 44.1 kHz. Short cues include a silent codec-tail guard, trimmed to their original duration by the player.

Music encodes one second of cyclic guard audio before and after the playable loop. After decoding, the build searches within 50 ms of sample 44100 for a quiet matching boundary. Each encoding records its own `loopStartSample` and `loopEndSample`, separated by the **exact original sample count**. `loopPhaseOffsetSamples` records the small cyclic phase adjustment, which prevents lossy codec-block differences from creating a click without changing duration or tempo. Use the selected encoding's `loopStart`/`loopEnd` seconds after the decoder removes codec priming. Top-level bounds describe the primary Ogg file; AAC bounds can differ. `masterLoopStartSample`/`masterLoopEndSample` describe the original WAV. Encoded duration includes guards and possibly tail padding: **do not loop the entire encoded file**.

Include `audio-runtime.js` and call `TempleAudio.play(asset)`. It selects supported Ogg/AAC, retries the alternate on decode failure, decodes through Web Audio, trims to the exact playable interval at the AudioContext sample rate, and loops the trimmed buffer. `TempleAudio.stop()` stops it. This provides AAC fallback for Safari and avoids media-element scheduling gaps. `examples/canvas-assets.mjs` returns supported audio URLs and loop bounds for custom engines.

Validation decodes **both formats**, checks codecs/sample rates/available samples, compares decoded samples with the WAV to detect priming offsets, and measures compressed loop boundaries. This verifies encoded timing; Safari device playback depends on its decoder and audio engine.

## Build and reports

```sh
npm install
npm run build
npm run check
npm run preview
```

Build requires ignored local masters, uses Sharp and npm-packaged FFmpeg, and never calls image generation. If npm disables install scripts, allow the `ffmpeg-static` installer to obtain its platform binary. Default preview port: 4174.

Reports: `source/validation-report.json`, `source/expansion-validation-report.json`, `source/web-validation-report.json`, `source/export-report.json`. Visual evidence: `previews/fall-direction-review.png`, `previews/beam-seam-review.png`. Repair prompts: `source/web-repair-prompts.json`, created with built-in image generation using attached local references. Original expansion prompts remain in `source/expansion-prompts.json`.
