# Cinematic toolkit — portable 3D scenes

## Framework and dependencies
Use React Three Fiber + Drei for new code-driven 3D scenes when they fit; Three.js renders, GSAP handles absolute-time choreography and optional postprocessing provides finishing. Preserve working approved native Three.js scenes rather than migrating just to use React. Framework choice alone is not cinematic quality.

Inspect the user's actual Node version, package.json and lock file. Choose compatible stable React/Fiber/Drei peer versions; don't assume the author's installed versions or use alpha APIs as stable. Shared toolkits are optional: resolve `MVD_TOOLKIT` / config `toolkit_dir`; if absent, use an authorized project-local renderer stack. Never replace a project's node_modules/junction, silently upgrade shared packages or install competing frameworks without a concrete need.

Resolve Chromium through the installed Playwright browser API or a user-configured executable; never hardcode a browser cache/version/OS path. Detect actual GPU/capture support. CPU/software rendering is a fallback, not a claim to have used the user's GPU. Do not assume NVIDIA CUDA on macOS, AMD or Intel hardware.

## Composition, style and cameras
Read project TASTE for dimensional style, character identity, palette and exposure. Preserve chosen sprite/illustration/3D style. If using 2D sprites in 3D, author correct interaction poses and test camera angles so edges/seat contact remain believable; don't replace the user's design with a different look.

Use shaped key/fill/rim, motivated practical lights, readable shadows, contact shadows and restrained materials/DOF/bloom. Avoid hiding low detail in darkness or washing the whole scene with glow. Keep UI/text in focus, preserve pixel boundaries when appropriate and fit source footage correctly. Do not crop a full-screen recording without an agreed framing requirement.

Use motivated, eased camera movement. For screen recordings, anticipate target entry with restrained follow/dolly, settle for the click, and hold long enough to understand the result; avoid twitching after every cursor micro-move. Keep text and full UI context readable. Inspect the whole path for edge cropping and overlapping captions. Tie movement SFX to the actual acceleration/velocity envelope, not a generic constant whoosh.

## Deterministic capture
Sample paused timelines at absolute time and reset known base transforms. No browser clocks, unseeded randomness, uncontrolled physics or mandatory audio callback state. Await fonts, textures and decoded source video frames before capture. A realtime VideoTexture is not itself proof of frame-accurate seeking.

Validate repeated nonsequential seeks. Use local environment/texture assets rather than runtime CDN dependencies. Inspect the installed postprocessing API before setting DOF or temporal effects; parameter units change between versions. Avoid temporal accumulation that makes random frame seeks inconsistent.

Prototype the key pose/interaction/camera first, then low-resolution dense range previews. Honor the user's approval/review instructions; preserve previous approved parts and narration masters. GPU performance and full export must be tested in the buyer's actual environment.

## Official documentation
- https://r3f.docs.pmnd.rs/getting-started/introduction
- https://drei.docs.pmnd.rs/
- https://threejs.org/docs/
- https://gsap.com/docs/v3/GSAP/Timeline/seek/
- https://github.com/pmndrs/postprocessing
