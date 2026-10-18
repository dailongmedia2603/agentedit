# NOTICE — video-shotcraft

This directory contains motion-graphic shot implementations derived from **video-shotcraft**
(https://github.com/Vincentwei1021/video-shotcraft, upstream commit `43bd349a136651865ecfa6ea1cf012f6e957d304`,
2026-10-18), Copyright (c) Vincent Wei and contributors, licensed under the **Apache License, Version 2.0**
(full text in `LICENSE` in this directory).

Modifications made for Agent Edit (2026-10-18):

- Demo components (`demos/<category>/<card>/*.tsx`) were copied to `shots/` and shared fixtures to `fixtures/`
  (plus `assets/lib/ClipCard.tsx` and `assets/lib/FlashCut.tsx`); legacy demos, sample screenshots, audio,
  gallery, template, workbench and skill documents were not included.
- `useCurrentFrame` / `useVideoConfig` / `staticFile` now come from `runtime.tsx` (time-scaled playback, virtual
  1920×1080 stage, image slots) so each shot renders real content of the edited video: text slots (spoken words),
  image/video slots, the video's brand, bundled Vietnamese-capable fonts, accent colours, and native 9:16 layouts.
- The video-shotcraft brand marks, names and promotional copy were removed from rendered output
  (`fixtures/Brand.tsx` renders the edited video's own brand or a neutral mark).
- Each shot has a `<Component>.meta.json` (slots, timing, Vietnamese description) used by the app's planner.

Files in this directory that carry these changes are marked with `[Agent Edit]` comments where the upstream
code was altered in place.
